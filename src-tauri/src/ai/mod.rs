pub mod anthropic;
pub mod gemini;
pub mod ollama;
pub mod openai_compatible;

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use crate::ai::anthropic::AnthropicProvider;
use crate::ai::gemini::GeminiProvider;
use crate::ai::ollama::OllamaProvider;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    /// "cloud" | "local"
    pub kind: String,
    pub requires_key: bool,
    pub base_url: String,
    pub chat_path: String,
    pub default_models: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub max_context_tokens: Option<u64>,
    pub modalities: Vec<String>,
}

impl ModelInfo {
    pub fn text(id: &str) -> Self {
        Self {
            id: id.into(),
            max_context_tokens: None,
            modalities: vec!["text".into()],
        }
    }

    pub fn with_context(id: &str, tokens: u64) -> Self {
        Self {
            id: id.into(),
            max_context_tokens: Some(tokens),
            modalities: vec!["text".into()],
        }
    }

    /// texto + imagen + modalidades extra (audio, video…)
    pub fn multimodal(id: &str, tokens: u64, extra: &[&str]) -> Self {
        let mut modalities = vec!["text".to_string(), "image".to_string()];
        modalities.extend(extra.iter().map(|m| m.to_string()));
        Self {
            id: id.into(),
            max_context_tokens: Some(tokens),
            modalities,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    /// "system" | "user" | "assistant"
    pub role: String,
    pub content: String,
}

/// Nivel de razonamiento solicitado para modelos que soportan thinking
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThinkingLevel {
    Low,
    Medium,
    High,
    Max,
}

impl ThinkingLevel {
    pub fn anthropic_budget(self) -> u32 {
        match self {
            Self::Low => 2048,
            Self::Medium => 8192,
            Self::High => 16384,
            Self::Max => 32768,
        }
    }

    pub fn gemini_budget(self) -> u32 {
        match self {
            Self::Low => 1024,
            Self::Medium => 8192,
            Self::High => 16384,
            Self::Max => 24576,
        }
    }

    pub fn openai_effort(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High | Self::Max => "high",
        }
    }
}

/// Heurística: indica si un modelo soporta razonamiento según provider + nombre
pub fn supports_thinking(provider_id: &str, model: &str) -> bool {
    let m = model.to_lowercase();
    match provider_id {
        "anthropic" => {
            m.contains("claude-3-7")
                || m.contains("claude-opus-4")
                || m.contains("claude-sonnet-4")
                || m.contains("claude-haiku-4")
                || m.contains("claude-4")
        }
        "openai" => m.contains("o1") || m.contains("o3") || m.contains("o4") || m.contains("gpt-5"),
        "gemini" => m.contains("2.5"),
        "deepseek" => m.contains("reasoner"),
        "xai" => m.contains("grok-3-mini") || m.contains("grok-4"),
        "qwen" => m.contains("qwq") || m.contains("qwen3"),
        "ollama" => m.contains("qwen3") || m.contains("deepseek-r1") || m.contains("thinking"),
        _ => false,
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    pub prefix: String,
    pub suffix: String,
    pub language: String,
}

pub(crate) const COMPLETION_SYSTEM_PROMPT: &str = "Eres un motor de autocompletado de código. Continúa el código exactamente donde termina el PREFIJO del usuario. Responde ÚNICAMENTE con el texto a insertar: sin markdown, sin bloques de código, sin explicaciones y sin repetir el prefijo.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    /// JSON Schema de los parámetros
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ToolResponse {
    /// Respuesta final de texto
    Text { text: String },
    /// El modelo solicita ejecutar herramientas
    ToolCalls {
        /// Texto del assistant (puede estar vacío)
        message: String,
        calls: Vec<ToolCall>,
    },
}

/// Uso real de tokens reportado por el proveedor (cuando el stream lo entrega).
/// `cached_tokens`: tokens servidos DESDE la caché de prompt del proveedor
/// (cache read); el resto de la entrada se facturó a precio completo.
#[derive(Debug, Clone, Default)]
pub struct StreamUsage {
    pub generated_chars: u64,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamChunk {
    Delta { text: String },
    /// Contenido de razonamiento (Chain of Thought) del modelo
    Thinking { text: String },
    /// Aviso de estado mid-stream (p. ej. reintentos por rate limit)
    Status { message: String },
    /// Métricas de la respuesta: tiempo + tokens reales si el proveedor los
    /// entrega (fallback: estimación chars/4) + tokens de entrada y cacheados
    Metrics {
        elapsed_ms: u64,
        tokens: u64,
        input_tokens: Option<u64>,
        cached_tokens: Option<u64>,
    },
    Done,
    /// Parte del contrato IPC: el frontend la maneja para errores mid-stream
    #[allow(dead_code)]
    Error { message: String },
}

#[async_trait::async_trait]
pub trait Provider: Send + Sync {
    fn info(&self) -> ProviderInfo;

    fn requires_key(&self) -> bool {
        self.info().requires_key
    }

    async fn fetch_models(&self, api_key: Option<String>) -> Result<Vec<ModelInfo>, String>;

    /// Chat con streaming. Devuelve el uso real de tokens cuando el proveedor
    /// lo entrega (y chars generados como fallback); el chunk Done y las
    /// Metrics los emite el comando invocador.
    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        api_key: Option<String>,
        thinking: Option<ThinkingLevel>,
        channel: &Channel<StreamChunk>,
    ) -> Result<StreamUsage, String>;

    /// Autocompletado sin streaming: devuelve el texto a insertar o None
    async fn complete(
        &self,
        model: &str,
        request: CompletionRequest,
        api_key: Option<String>,
    ) -> Result<Option<String>, String>;

    /// Una llamada al LLM con herramientas (sin streaming). Devuelve texto final
    /// o peticiones de tool-calls; el bucle agéntico lo orquesta el frontend.
    async fn chat_with_tools(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Vec<ToolDef>,
        api_key: Option<String>,
        thinking: Option<ThinkingLevel>,
    ) -> Result<ToolResponse, String>;
}

pub(crate) fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        // Tope de seguridad TOTAL de 10 min (fix/gateway-retry, punto 5): una
        // respuesta ACTIVA no se corta por aquí en la práctica (el corte que
        // importa es el de INACTIVIDAD, 120 s sin bytes, en los adaptadores);
        // esto evita colgas eternos si el proveedor nunca cierra el stream
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .expect("No se pudo construir el cliente HTTP")
}

// --- Reintentos del gateway (fix/gateway-retry) ---

/// Prefijo de los errores TRANSITORIOS de la fase de stream. Contrato: el
/// adaptador SOLO lo usa cuando AÚN no llegó contenido al frontend —
/// reintentar después de contenido duplicaría texto (req. 2)
pub(crate) const TRANSIENT_PREFIX: &str = "[transitorio] ";

/// Segundos de INACTIVIDAD del stream (sin recibir ni un byte) antes de
/// considerarlo muerto (req. 5). Un stream que sigue emitiendo no se corta.
pub(crate) const STREAM_IDLE_SECS: u64 = 120;

/// Reintentos de la FASE DE PETICIÓN (send_with_retries)
const MAX_SEND_RETRIES: u32 = 3;
/// Reintentos de la FASE DE STREAM (inactividad/corte antes del primer byte)
pub(crate) const MAX_STREAM_RETRIES: u32 = 2;

/// ¿El código HTTP es transitorio (reintentable)? (req. 1)
pub(crate) fn retryable_status(status: u16) -> bool {
    matches!(status, 408 | 429 | 500 | 502 | 503 | 504 | 529)
}

/// Backoff por intento de reintento: 0→2 s, 1→5 s, ≥2→10 s (req. 1)
pub(crate) fn backoff_delay(attempt: u32) -> Duration {
    const SECS: [u64; 3] = [2, 5, 10];
    Duration::from_secs(SECS[(attempt as usize).min(SECS.len() - 1)])
}

/// Retry-After del proveedor, con tope de 30 s (req. 1). None si no viene,
/// viene vacío o no es un número de segundos
pub(crate) fn parse_retry_after(header: Option<&str>) -> Option<Duration> {
    header
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(|secs| Duration::from_secs(secs.min(30)))
}

/// Marca un error de la fase de stream como transitorio SOLO si no se emitió
/// contenido (req. 2). `reason_code`: "red" | "inactividad" (el frontend lo
/// traduce para el mensaje de estado)
pub(crate) fn stream_error(emitted: bool, reason_code: &str, msg: &str) -> String {
    if emitted {
        msg.to_string()
    } else {
        format!("{TRANSIENT_PREFIX}{reason_code}:{msg}")
    }
}

pub(crate) fn is_transient_error(msg: &str) -> bool {
    msg.starts_with(TRANSIENT_PREFIX)
}

/// Extrae el código de motivo del error transitorio ("red" | "inactividad")
pub(crate) fn transient_reason_code(msg: &str) -> &str {
    let rest = msg.strip_prefix(TRANSIENT_PREFIX).unwrap_or(msg);
    rest.split(':').next().unwrap_or("red")
}

pub(crate) async fn error_from_response(response: reqwest::Response) -> String {
    let status = response.status();
    // LOW (v0.3.1): el body es texto controlado por el PROVEEDOR — se trunca
    // antes de mostrarlo en el chat (y no puede ser un vector de spam/inyección largo)
    let body = response.text().await.unwrap_or_default();
    let body = if body.chars().count() > 500 {
        let cut: String = body.chars().take(500).collect();
        format!("{cut}… (truncado)")
    } else {
        body
    };
    format!("El proveedor respondió HTTP {status}: {body}")
}

/// Aviso de reintento para el frontend: marcador estructurado
/// `gateway-retry:{intento}/{máx}:{motivo}` — el chatStore lo traduce con i18n
fn notify_retry(channel: Option<&Channel<StreamChunk>>, attempt: u32, reason: &str) {
    if let Some(ch) = channel {
        let _ = ch.send(StreamChunk::Status {
            message: format!("gateway-retry:{attempt}/{MAX_SEND_RETRIES}:{reason}"),
        });
    }
}

/// Envía la petición con reintentos ante errores TRANSITORIOS: 408, 429, 500,
/// 502, 503, 504, 529 y errores de conexión/reset (req. 1). NO reintenta
/// 400/401/403/404 ni otros errores de contenido. Respeta Retry-After con
/// tope de 30 s; si no viene, backoff fijo 2 s → 5 s → 10 s. Máximo
/// MAX_SEND_RETRIES reintentos. Cada reintento se informa por el channel (si
/// hay) como StreamChunk::Status con marcador `gateway-retry:…`.
///
/// Esta fase es ANTES de cualquier byte de contenido: reintentar aquí nunca
/// duplica texto (req. 2). La cancelación del backoff la cubre el `select!`
/// del invocador (el futuro completo se aborta — req. 3).
pub(crate) async fn send_with_retries(
    request: reqwest::RequestBuilder,
    channel: Option<&Channel<StreamChunk>>,
) -> Result<reqwest::Response, String> {
    let mut attempt: u32 = 0;
    loop {
        let response = match request
            .try_clone()
            .ok_or_else(|| "No se pudo clonar la petición para reintentar".to_string())?
            .send()
            .await
        {
            Ok(r) => r,
            // Error de conexión/reset: transitorio (req. 1)
            Err(e) => {
                if attempt >= MAX_SEND_RETRIES {
                    return Err(format!("Error de conexión: {e}"));
                }
                attempt += 1;
                notify_retry(channel, attempt, "red");
                tokio::time::sleep(backoff_delay(attempt - 1)).await;
                continue;
            }
        };

        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }
        if !retryable_status(status.as_u16()) || attempt >= MAX_SEND_RETRIES {
            return Err(error_from_response(response).await);
        }

        attempt += 1;
        // Retry-After del proveedor con tope de 30 s (req. 1); si no viene,
        // backoff fijo 2 s → 5 s → 10 s
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| parse_retry_after(Some(s)));
        let delay = retry_after.unwrap_or_else(|| backoff_delay(attempt - 1));
        notify_retry(channel, attempt, &status.as_u16().to_string());
        tokio::time::sleep(delay).await;
    }
}

/// Extrae los valores de las líneas "data:" de un buffer SSE parcial
pub(crate) fn extract_sse_data_lines(buffer: &mut String) -> Vec<String> {
    let mut lines = Vec::new();
    while let Some(pos) = buffer.find('\n') {
        let line: String = buffer.drain(..pos + 1).collect();
        let line = line.trim_end_matches(['\r', '\n']);
        if let Some(data) = line.strip_prefix("data:") {
            lines.push(data.trim().to_string());
        }
    }
    lines
}

pub(crate) fn truncate_chars_end(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.to_string();
    }
    s.chars().skip(count - max).collect()
}

pub(crate) fn truncate_chars_start(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.to_string();
    }
    s.chars().take(max).collect()
}

/// Quita fences de markdown que algunos modelos añaden a las completions
pub(crate) fn strip_code_fences(s: &str) -> String {
    let trimmed = s.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed.to_string();
    };
    let rest = rest.trim_start_matches(|c: char| c.is_ascii_alphanumeric() || c == '-');
    let rest = rest.strip_prefix('\n').unwrap_or(rest);
    let rest = rest.strip_suffix("```").unwrap_or(rest);
    rest.trim().to_string()
}

/// Presets data-driven de proveedores con formato OpenAI-compatible
pub fn openai_compatible_presets() -> Vec<ProviderInfo> {
    vec![
        ProviderInfo {
            id: "openai".into(),
            name: "OpenAI".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://api.openai.com/v1".into(),
            chat_path: "/chat/completions".into(),
            default_models: vec![
                ModelInfo::multimodal("gpt-4o", 128_000, &[]),
                ModelInfo::multimodal("gpt-4o-mini", 128_000, &[]),
                ModelInfo::multimodal("gpt-4.1", 1_000_000, &[]),
            ],
        },
        ProviderInfo {
            id: "deepseek".into(),
            name: "DeepSeek".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://api.deepseek.com/v1".into(),
            chat_path: "/chat/completions".into(),
            default_models: vec![
                ModelInfo::with_context("deepseek-chat", 128_000),
                ModelInfo::with_context("deepseek-reasoner", 128_000),
            ],
        },
        ProviderInfo {
            id: "mistral".into(),
            name: "Mistral AI".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://api.mistral.ai/v1".into(),
            chat_path: "/chat/completions".into(),
            default_models: vec![
                ModelInfo::with_context("mistral-large-latest", 128_000),
                ModelInfo::with_context("mistral-small-latest", 128_000),
            ],
        },
        ProviderInfo {
            id: "xai".into(),
            name: "xAI (Grok)".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://api.x.ai/v1".into(),
            chat_path: "/chat/completions".into(),
            default_models: vec![
                ModelInfo::multimodal("grok-4", 256_000, &[]),
                ModelInfo::with_context("grok-3", 131_072),
                ModelInfo::with_context("grok-code-fast-1", 256_000),
            ],
        },
        ProviderInfo {
            id: "groq".into(),
            name: "Groq".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://api.groq.com/openai/v1".into(),
            chat_path: "/chat/completions".into(),
            default_models: vec![
                ModelInfo::with_context("llama-3.3-70b-versatile", 131_072),
                ModelInfo::with_context("llama-3.1-8b-instant", 131_072),
            ],
        },
        ProviderInfo {
            id: "nvidia-nim".into(),
            name: "NVIDIA NIM".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://integrate.api.nvidia.com/v1".into(),
            chat_path: "/chat/completions".into(),
            default_models: vec![
                ModelInfo::with_context("meta/llama-3.3-70b-instruct", 128_000),
                ModelInfo::with_context("nvidia/llama-3.1-nemotron-70b-instruct", 128_000),
            ],
        },
        ProviderInfo {
            id: "together".into(),
            name: "Together AI".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://api.together.xyz/v1".into(),
            chat_path: "/chat/completions".into(),
            default_models: vec![
                ModelInfo::with_context("meta-llama/Llama-3.3-70B-Instruct-Turbo", 128_000),
                ModelInfo::with_context("Qwen/Qwen2.5-Coder-32B-Instruct", 128_000),
            ],
        },
        ProviderInfo {
            id: "qwen".into(),
            name: "Qwen".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1".into(),
            chat_path: "/chat/completions".into(),
            default_models: vec![
                ModelInfo::with_context("qwen-max", 32_768),
                ModelInfo::with_context("qwen-plus", 131_072),
                ModelInfo::with_context("qwen-coder-plus", 131_072),
            ],
        },
        ProviderInfo {
            id: "minimax".into(),
            name: "MiniMax".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://api.minimaxi.chat/v1".into(),
            chat_path: "/text/chatcompletion_v2".into(),
            default_models: vec![
                ModelInfo::with_context("MiniMax-Text-01", 1_000_000),
                ModelInfo::with_context("abab6.5s-chat", 16_384),
            ],
        },
        ProviderInfo {
            id: "lm-studio".into(),
            name: "LM Studio (local)".into(),
            kind: "local".into(),
            requires_key: false,
            base_url: "http://localhost:1234/v1".into(),
            chat_path: "/chat/completions".into(),
            // Dinámico vía GET /v1/models
            default_models: vec![],
        },
    ]
}

/// Registro de proveedores: resuelve la implementación para un id
pub fn get_provider(id: &str) -> Result<Box<dyn Provider>, String> {
    if let Some(info) = openai_compatible_presets().into_iter().find(|p| p.id == id) {
        return Ok(Box::new(openai_compatible::OpenAiCompatibleProvider { info }));
    }
    match id {
        "anthropic" => Ok(Box::new(AnthropicProvider)),
        "gemini" => Ok(Box::new(GeminiProvider)),
        "ollama" => Ok(Box::new(OllamaProvider)),
        other => Err(format!("Proveedor desconocido: '{other}'")),
    }
}

/// Catálogo completo para el panel de Settings
pub fn list_providers() -> Vec<ProviderInfo> {
    let mut all = openai_compatible_presets();
    all.push(AnthropicProvider.info());
    all.push(GeminiProvider.info());
    all.push(OllamaProvider.info());
    all
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clasificacion_codigos_reintentables() {
        // Transitorios (req. 1): 408, 429, 500, 502, 503, 504, 529
        for code in [408u16, 429, 500, 502, 503, 504, 529] {
            assert!(retryable_status(code), "{code} debe ser reintentable");
        }
        // NO reintentables: errores de contenido/credenciales y otros
        for code in [200u16, 400, 401, 403, 404, 418, 422, 501, 505] {
            assert!(!retryable_status(code), "{code} NO debe ser reintentable");
        }
    }

    #[test]
    fn backoff_exponencial_con_tope() {
        assert_eq!(backoff_delay(0), Duration::from_secs(2));
        assert_eq!(backoff_delay(1), Duration::from_secs(5));
        assert_eq!(backoff_delay(2), Duration::from_secs(10));
        // Fuera de rango: se queda en el máximo (10 s), nunca crece más
        assert_eq!(backoff_delay(3), Duration::from_secs(10));
        assert_eq!(backoff_delay(99), Duration::from_secs(10));
    }

    #[test]
    fn retry_after_con_tope_de_30s() {
        assert_eq!(
            parse_retry_after(Some("5")),
            Some(Duration::from_secs(5))
        );
        // Tope: un Retry-After enorme no colga la UI
        assert_eq!(
            parse_retry_after(Some("120")),
            Some(Duration::from_secs(30))
        );
        // Formato no numérico (HTTP-date) o ausente: sin espera especial
        assert_eq!(parse_retry_after(Some("Wed, 21 Oct 2026 07:28:00 GMT")), None);
        assert_eq!(parse_retry_after(Some("")), None);
        assert_eq!(parse_retry_after(None), None);
    }

    #[test]
    fn stream_error_contrato_transitorio() {
        // Con contenido YA emitido: error FINAL, sin marcador (req. 2 —
        // reintentar duplicaría texto)
        let with_content = stream_error(true, "red", "stream cortado");
        assert!(!is_transient_error(&with_content));
        assert_eq!(with_content, "stream cortado");

        // Sin contenido emitido: transitorio → reintentable (req. 5)
        let without = stream_error(false, "inactividad", "120 s sin datos");
        assert!(is_transient_error(&without));
        assert_eq!(transient_reason_code(&without), "inactividad");

        let net = stream_error(false, "red", "reset por el peer");
        assert!(is_transient_error(&net));
        assert_eq!(transient_reason_code(&net), "red");

        // Un error cualquiera sin marcador jamás es transitorio
        assert!(!is_transient_error("El proveedor respondió HTTP 400: bad request"));
    }

    #[test]
    fn errores_de_contenido_nunca_transitorios() {
        // 400/401/403/404 NO se marcan como reintentables (req. 1)
        assert!(!retryable_status(400));
        assert!(!retryable_status(401));
        assert!(!retryable_status(403));
        assert!(!retryable_status(404));
    }
}
