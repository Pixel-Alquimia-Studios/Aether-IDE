use futures_util::StreamExt;
use serde_json::json;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::ipc::Channel;

use crate::ai::{
    extract_sse_data_lines, notify_usage_retry, send_with_retries, strip_code_fences,
    truncate_chars_end, truncate_chars_start, ChatMessage, CompletionRequest, ModelInfo, Provider,
    ProviderInfo, StreamChunk, StreamUsage, ThinkingLevel, ToolCall, ToolDef, ToolResponse,
};

/// Adaptador genérico para proveedores con formato OpenAI-compatible:
/// OpenAI, DeepSeek, Mistral, xAI, Groq, NVIDIA NIM, Together, Qwen, MiniMax,
/// LM Studio, OpenRouter, Z.ai, Cerebras, Fireworks y Moonshot.
pub struct OpenAiCompatibleProvider {
    pub info: ProviderInfo,
}

/// Proveedores que rechazaron `stream_options.include_usage` con 400:
/// se recuerdan en memoria (por sesión de la app) y no se vuelve a enviar
static NO_USAGE_PROVIDERS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

pub(crate) fn no_usage_providers() -> &'static Mutex<HashSet<String>> {
    NO_USAGE_PROVIDERS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Excepción ESTRICTA a la regla de "400 nunca se reintenta": SOLO reintenta
/// sin `stream_options.include_usage` si el error es 400 y el cuerpo menciona
/// `stream_options` o `include_usage`. Cualquier otro 400 sigue sin reintentarse.
pub(crate) fn is_usage_unsupported_error(err: &str) -> bool {
    err.contains("HTTP 400")
        && (err.contains("stream_options") || err.contains("include_usage"))
}

/// Body base de chat_stream. `stream_options.include_usage` SOLO si el
/// proveedor no lo rechazó antes (los servidores que no lo soportan
/// devuelven 400 mencionándolo — ver `is_usage_unsupported_error`)
pub(crate) fn build_chat_body(
    model: &str,
    messages: &[ChatMessage],
    include_usage: bool,
) -> serde_json::Value {
    let msgs: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    let mut body = json!({
        "model": model,
        "messages": msgs,
        "stream": true,
    });
    if include_usage {
        body["stream_options"] = json!({ "include_usage": true });
    }
    body
}

/// Body de complete() SIN max_tokens/temperature: los añade `apply_omit_params`
pub(crate) fn build_completion_body(model: &str, user_prompt: &str) -> serde_json::Value {
    json!({
        "model": model,
        "messages": [
            { "role": "system", "content": crate::ai::COMPLETION_SYSTEM_PROMPT },
            { "role": "user", "content": user_prompt },
        ],
    })
}

/// Añade max_tokens/temperature al body de complete() salvo que el proveedor
/// los omita vía `omit_params` (p. ej. Moonshot: muestreo fijo en kimi-k2).
/// El payload del resto de proveedores queda idéntico al de antes de 0.4.0.
pub(crate) fn apply_omit_params(body: &mut serde_json::Value, omit: Option<&Vec<String>>) {
    if !omit.is_some_and(|o| o.iter().any(|p| p == "max_tokens")) {
        body["max_tokens"] = json!(128);
    }
    if !omit.is_some_and(|o| o.iter().any(|p| p == "temperature")) {
        body["temperature"] = json!(0.2);
    }
}

#[async_trait::async_trait]
impl Provider for OpenAiCompatibleProvider {
    fn info(&self) -> ProviderInfo {
        self.info.clone()
    }

    async fn fetch_models(&self, api_key: Option<String>) -> Result<Vec<ModelInfo>, String> {
        let url = format!("{}/models", self.info.base_url);
        let client = crate::ai::custom::client_for(&self.info.id);
        let mut request = client.get(&url);
        if let Some(key) = api_key {
            request = request.bearer_auth(key);
        }
        let response = request
            .send()
            .await
            .map_err(|e| format!("Error de conexión: {e}"))?;
        if !response.status().is_success() {
            return Err(crate::ai::error_from_response(response).await);
        }
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;
        let data = value["data"]
            .as_array()
            .ok_or_else(|| "Respuesta inesperada del proveedor".to_string())?;
        Ok(data
            .iter()
            .filter_map(|m| {
                let id = m["id"].as_str()?;
                // Algunas APIs incluyen contexto en el listado (p. ej. Groq: context_window)
                let max_context_tokens = m["context_window"]
                    .as_u64()
                    .or_else(|| m["max_context_tokens"].as_u64());
                Some(ModelInfo {
                    id: id.to_string(),
                    max_context_tokens,
                    modalities: vec!["text".into()],
                })
            })
            .collect())
    }

    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        api_key: Option<String>,
        thinking: Option<ThinkingLevel>,
        channel: &Channel<StreamChunk>,
    ) -> Result<StreamUsage, String> {
        let url = format!("{}{}", self.info.base_url, self.info.chat_path);

        // stream_options.include_usage: pide el objeto usage al final del stream
        // (OpenAI, DeepSeek, Groq…; los servidores que no lo soportan lo ignoran).
        // Si el proveedor ya lo rechazó con 400 antes, no se vuelve a enviar.
        let include_usage = !no_usage_providers()
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .contains(&self.info.id);
        let mut body = build_chat_body(model, &messages, include_usage);
        // reasoning_effort solo para modelos que soportan razonamiento
        if let Some(level) = thinking {
            if crate::ai::supports_thinking(&self.info.id, model) {
                body["reasoning_effort"] = json!(level.openai_effort());
            }
        }

        let client = crate::ai::custom::client_for(&self.info.id);
        let mut request = client.post(&url).json(&body);
        if let Some(key) = api_key.as_ref() {
            request = request.bearer_auth(key);
        }

        let response = match send_with_retries(request, Some(channel)).await {
            // Excepción estricta: 400 que menciona stream_options/include_usage,
            // aún sin contenido emitido y solo la primera vez → reintento sin él
            Err(e) if include_usage && is_usage_unsupported_error(&e) => {
                no_usage_providers()
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .insert(self.info.id.clone());
                notify_usage_retry(Some(channel));
                body.as_object_mut()
                    .expect("body de chat es un objeto")
                    .remove("stream_options");
                let mut retry_req = client.post(&url).json(&body);
                if let Some(key) = api_key {
                    retry_req = retry_req.bearer_auth(key);
                }
                send_with_retries(retry_req, Some(channel)).await?
            }
            other => other?,
        };

        let mut usage = StreamUsage::default();
        let mut emitted = false; // algún Delta/Thinking ya llegó al frontend
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        loop {
            // Inactividad (req. 5): 120 s sin ni un byte = stream muerto
            let next =
                tokio::time::timeout(std::time::Duration::from_secs(crate::ai::STREAM_IDLE_SECS), stream.next()).await;
            let item = match next {
                Err(_) => {
                    return Err(crate::ai::stream_error(
                        emitted,
                        "inactividad",
                        &format!(
                            "El stream se quedó sin datos ({} s de inactividad)",
                            crate::ai::STREAM_IDLE_SECS
                        ),
                    ));
                }
                Ok(None) => break,
                Ok(Some(item)) => item,
            };
            let bytes = match item {
                Ok(b) => b,
                // Corte a mitad del stream: error FINAL si ya hubo contenido,
                // transitorio (reintentable) si aún no (req. 2)
                Err(e) => {
                    return Err(crate::ai::stream_error(
                        emitted,
                        "red",
                        &format!("Error recibiendo el stream: {e}"),
                    ));
                }
            };
            buffer.push_str(&String::from_utf8_lossy(&bytes));
            for data in extract_sse_data_lines(&mut buffer) {
                if data == "[DONE]" {
                    return Ok(usage);
                }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&data) else {
                    continue;
                };
                // Usage real del proveedor (llega en el último chunk con choices
                // vacías, o adjunto al último chunk de contenido):
                // - OpenAI/compatibles: prompt_tokens / completion_tokens /
                //   prompt_tokens_details.cached_tokens
                // - DeepSeek: prompt_cache_hit_tokens
                if let Some(u) = value["usage"].as_object() {
                    usage.input_tokens = u.get("prompt_tokens").and_then(|v| v.as_u64());
                    usage.output_tokens = u
                        .get("completion_tokens")
                        .and_then(|v| v.as_u64())
                        .or_else(|| u.get("output_tokens").and_then(|v| v.as_u64()));
                    usage.cached_tokens = u
                        .get("prompt_cache_hit_tokens")
                        .and_then(|v| v.as_u64())
                        .or_else(|| {
                            u.get("prompt_tokens_details")
                                .and_then(|d| d.get("cached_tokens"))
                                .and_then(|v| v.as_u64())
                        });
                }
                // reasoning_content: razonamiento de modelos tipo DeepSeek R1 / o-series
                if let Some(reasoning) = value["choices"][0]["delta"]["reasoning_content"].as_str() {
                    if !reasoning.is_empty() {
                        channel
                            .send(StreamChunk::Thinking { text: reasoning.to_string() })
                            .map_err(|e| format!("Error de IPC: {e}"))?;
                        emitted = true;
                    }
                }
                if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                    if !text.is_empty() {
                        usage.generated_chars += text.chars().count() as u64;
                        channel
                            .send(StreamChunk::Delta { text: text.to_string() })
                            .map_err(|e| format!("Error de IPC: {e}"))?;
                        emitted = true;
                    }
                }
            }
        }
        Ok(usage)
    }

    async fn complete(
        &self,
        model: &str,
        request: CompletionRequest,
        api_key: Option<String>,
    ) -> Result<Option<String>, String> {
        let url = format!("{}{}", self.info.base_url, self.info.chat_path);
        let user = format!(
            "Lenguaje: {}\n\nPREFIJO (el cursor está al final):\n{}\n\nSUFIJO (código posterior):\n{}\n\nContinúa el código exactamente desde el final del PREFIJO.",
            request.language,
            truncate_chars_end(&request.prefix, 4000),
            truncate_chars_start(&request.suffix, 2000),
        );
        let mut body = build_completion_body(model, &user);
        // omit_params (p. ej. Moonshot: muestreo fijo en kimi-k2)
        apply_omit_params(&mut body, self.info.omit_params.as_ref());
        let client = crate::ai::custom::client_for(&self.info.id);
        let mut req = client.post(&url).json(&body);
        if let Some(key) = api_key {
            req = req.bearer_auth(key);
        }

        let response = send_with_retries(req, None).await?;
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;
        let content = value["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("");
        let clean = strip_code_fences(content);
        if clean.trim().is_empty() {
            Ok(None)
        } else {
            Ok(Some(clean))
        }
    }

    async fn chat_with_tools(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        tools: Vec<ToolDef>,
        api_key: Option<String>,
        thinking: Option<ThinkingLevel>,
    ) -> Result<ToolResponse, String> {
        let url = format!("{}{}", self.info.base_url, self.info.chat_path);
        let msgs: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| json!({ "role": m.role, "content": m.content }))
            .collect();
        let tools_json: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "function": { "name": t.name, "description": t.description, "parameters": t.parameters },
                })
            })
            .collect();

        let mut body = json!({
            "model": model,
            "messages": msgs,
            "tools": tools_json,
            "tool_choice": "auto",
        });
        if let Some(level) = thinking {
            if crate::ai::supports_thinking(&self.info.id, model) {
                body["reasoning_effort"] = json!(level.openai_effort());
            }
        }

        let client = crate::ai::custom::client_for(&self.info.id);
        let mut request = client.post(&url).json(&body);
        if let Some(key) = api_key {
            request = request.bearer_auth(key);
        }
        let response = send_with_retries(request, None).await?;
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;

        let message = value["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();
        // finish_reason "length": la respuesta se cortó por límite de tokens —
        // los argumentos de las tool calls suelen llegar incompletos
        let response_truncated = value["choices"][0]["finish_reason"].as_str() == Some("length");
        let calls = value["choices"][0]["message"]["tool_calls"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .enumerate()
                    .filter_map(|(i, tc)| {
                        let name = tc["function"]["name"].as_str()?.to_string();
                        let raw = tc["function"]["arguments"].as_str().unwrap_or("{}");
                        let arguments: serde_json::Value = if response_truncated {
                            // Respuesta truncada: el JSON llega casi seguro roto
                            json!({ "__truncated": true })
                        } else {
                            serde_json::from_str(raw).unwrap_or(json!({ "__truncated": true }))
                        };
                        let id = tc["id"]
                            .as_str()
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| format!("call-{i}"));
                        Some(ToolCall { id, name, arguments })
                    })
                    .collect::<Vec<ToolCall>>()
            })
            .unwrap_or_default();

        if calls.is_empty() {
            Ok(ToolResponse::Text { text: message })
        } else {
            Ok(ToolResponse::ToolCalls { message, calls })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::openai_compatible_presets;

    #[test]
    fn payload_legacy_identico_en_complete() {
        // Regresión: los 10 proveedores OpenAI-compatibles previos a 0.4.0
        // deben seguir enviando exactamente max_tokens=128 y temperature=0.2
        let legacy = [
            "openai",
            "deepseek",
            "mistral",
            "xai",
            "groq",
            "nvidia-nim",
            "together",
            "qwen",
            "minimax",
            "lm-studio",
        ];
        for p in openai_compatible_presets() {
            let mut body = build_completion_body("m", "u");
            apply_omit_params(&mut body, p.omit_params.as_ref());
            if legacy.contains(&p.id.as_str()) {
                assert_eq!(
                    body["max_tokens"],
                    json!(128),
                    "{} perdió max_tokens",
                    p.id
                );
                assert_eq!(
                    body["temperature"],
                    json!(0.2),
                    "{} perdió temperature",
                    p.id
                );
            }
        }
    }

    #[test]
    fn moonshot_omite_temperature_y_max_tokens() {
        let moonshot = openai_compatible_presets()
            .into_iter()
            .find(|p| p.id == "moonshot")
            .expect("preset moonshot");
        let omit = moonshot.omit_params.as_ref().expect("moonshot con omit_params");
        assert!(omit.contains(&"temperature".to_string()));
        assert!(omit.contains(&"max_tokens".to_string()));

        let mut body = build_completion_body("kimi-k2-0711-preview", "u");
        apply_omit_params(&mut body, Some(omit));
        assert!(
            body.get("max_tokens").is_none(),
            "moonshot no debe enviar max_tokens"
        );
        assert!(
            body.get("temperature").is_none(),
            "moonshot no debe enviar temperature"
        );
        // el resto del payload sí está
        assert_eq!(body["model"], json!("kimi-k2-0711-preview"));
        assert!(body["messages"].as_array().is_some());
    }

    #[test]
    fn payload_chat_stream_con_y_sin_usage() {
        let msgs = vec![ChatMessage {
            role: "user".into(),
            content: "hola".into(),
        }];
        let with = build_chat_body("gpt-4o", &msgs, true);
        assert_eq!(with["stream_options"]["include_usage"], json!(true));
        assert_eq!(with["stream"], json!(true));
        assert_eq!(with["model"], json!("gpt-4o"));
        let without = build_chat_body("gpt-4o", &msgs, false);
        assert!(
            without.get("stream_options").is_none(),
            "sin include_usage el body no debe llevar stream_options"
        );
    }

    #[test]
    fn excepcion_include_usage_es_estricta() {
        // SÍ reintenta: 400 con mención explícita en el cuerpo
        assert!(is_usage_unsupported_error(
            "El proveedor respondió HTTP 400: stream_options is not supported"
        ));
        assert!(is_usage_unsupported_error(
            "El proveedor respondió HTTP 400: include_usage must be a boolean"
        ));
        // NO reintenta: 400 sin mención, otros estados con mención, red
        assert!(!is_usage_unsupported_error(
            "El proveedor respondió HTTP 400: invalid model id"
        ));
        assert!(!is_usage_unsupported_error(
            "El proveedor respondió HTTP 401: stream_options"
        ));
        assert!(!is_usage_unsupported_error(
            "El proveedor respondió HTTP 500: stream_options"
        ));
        assert!(!is_usage_unsupported_error("Error de conexión: reset por el peer"));
    }

    #[test]
    fn no_usage_providers_recuerda_por_proveedor() {
        let set = no_usage_providers();
        let mut guard = set.lock().unwrap_or_else(|p| p.into_inner());
        assert!(!guard.contains("test-provider-x"));
        guard.insert("test-provider-x".to_string());
        assert!(guard.contains("test-provider-x"));
        guard.remove("test-provider-x");
        assert!(!guard.contains("test-provider-x"));
    }

    #[test]
    fn nuevos_presets_registrados() {
        let ids: Vec<String> = openai_compatible_presets()
            .into_iter()
            .map(|p| p.id)
            .collect();
        for expected in [
            "openrouter",
            "zai",
            "cerebras",
            "fireworks",
            "moonshot",
        ] {
            assert!(
                ids.contains(&expected.to_string()),
                "falta el preset {expected}"
            );
        }
        // 15 presets OpenAI-compatibles (10 legacy + 5 nuevos)
        assert_eq!(ids.len(), 15);
    }

    #[test]
    fn solo_moonshot_tiene_omit_params() {
        for p in openai_compatible_presets() {
            let omit = p.omit_params.as_ref().map(|v| v.len()).unwrap_or(0);
            if p.id == "moonshot" {
                assert_eq!(omit, 2);
            } else {
                assert_eq!(omit, 0, "{} no debe omitir parámetros", p.id);
            }
        }
    }
}
