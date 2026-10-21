use futures_util::StreamExt;
use serde_json::json;
use tauri::ipc::Channel;

use crate::ai::{
    error_from_response, http_client, send_with_retries, strip_code_fences, truncate_chars_end,
    truncate_chars_start, ChatMessage, CompletionRequest, ModelInfo, Provider, ProviderInfo,
    StreamChunk, StreamUsage, ThinkingLevel, ToolCall, ToolDef, ToolResponse,
};

pub struct OllamaProvider;

#[async_trait::async_trait]
impl Provider for OllamaProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "ollama".into(),
            name: "Ollama (local)".into(),
            kind: "local".into(),
            requires_key: false,
            base_url: "http://localhost:11434".into(),
            chat_path: "/api/chat".into(),
            // Dinámico vía GET /api/tags
            default_models: vec![],
        }
    }

    async fn fetch_models(&self, _api_key: Option<String>) -> Result<Vec<ModelInfo>, String> {
        let url = format!("{}/api/tags", self.info().base_url);
        let response = http_client()
            .get(&url)
            .send()
            .await
            .map_err(|e| {
                format!("No se pudo conectar con Ollama en {url} (¿está en ejecución?): {e}")
            })?;
        if !response.status().is_success() {
            return Err(error_from_response(response).await);
        }
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;
        let data = value["models"]
            .as_array()
            .ok_or_else(|| "Respuesta inesperada de Ollama".to_string())?;
        Ok(data
            .iter()
            .filter_map(|m| {
                let name = m["name"].as_str()?;
                Some(ModelInfo {
                    id: name.to_string(),
                    max_context_tokens: m["context_length"].as_u64(),
                    modalities: vec!["text".into()],
                })
            })
            .collect())
    }

    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        _api_key: Option<String>,
        thinking: Option<ThinkingLevel>,
        channel: &Channel<StreamChunk>,
    ) -> Result<StreamUsage, String> {
        let url = format!("{}{}", self.info().base_url, self.info().chat_path);
        let msgs: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| json!({ "role": m.role, "content": m.content }))
            .collect();

        let mut body = json!({ "model": model, "messages": msgs, "stream": true });
        // Ollama: "think" para modelos razonadores, solo en niveles altos
        if let Some(level) = thinking {
            if crate::ai::supports_thinking("ollama", model)
                && matches!(level, ThinkingLevel::High | ThinkingLevel::Max)
            {
                body["think"] = json!(true);
            }
        }

        let request = http_client().post(&url).json(&body);
        let response = send_with_retries(request, Some(channel)).await?;

        let mut generated_chars: u64 = 0;
        let mut emitted = false; // algún Delta/Thinking ya llegó al frontend
        // Ollama transmite NDJSON: una línea JSON por evento
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        loop {
            // Inactividad (req. 5): 120 s sin ni un byte = stream muerto
            let next = tokio::time::timeout(
                std::time::Duration::from_secs(crate::ai::STREAM_IDLE_SECS),
                stream.next(),
            )
            .await;
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
            while let Some(pos) = buffer.find('\n') {
                let line: String = buffer.drain(..pos + 1).collect();
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                    continue;
                };
                // "thinking" en el mensaje: razonamiento de modelos tipo deepseek-r1/qwen3
                if let Some(reasoning) = value["message"]["thinking"].as_str() {
                    if !reasoning.is_empty() {
                        channel
                            .send(StreamChunk::Thinking { text: reasoning.to_string() })
                            .map_err(|e| format!("Error de IPC: {e}"))?;
                        emitted = true;
                    }
                }
                if let Some(text) = value["message"]["content"].as_str() {
                    if !text.is_empty() {
                        generated_chars += text.chars().count() as u64;
                        channel
                            .send(StreamChunk::Delta { text: text.to_string() })
                            .map_err(|e| format!("Error de IPC: {e}"))?;
                        emitted = true;
                    }
                }
                if value["done"].as_bool() == Some(true) {
                    return Ok(StreamUsage { generated_chars, ..Default::default() });
                }
            }
        }
        Ok(StreamUsage { generated_chars, ..Default::default() })
    }

    async fn complete(
        &self,
        model: &str,
        request: CompletionRequest,
        _api_key: Option<String>,
    ) -> Result<Option<String>, String> {
        let url = format!("{}{}", self.info().base_url, self.info().chat_path);
        let user = format!(
            "Lenguaje: {}\n\nPREFIJO (el cursor está al final):\n{}\n\nSUFIJO (código posterior):\n{}\n\nContinúa el código exactamente desde el final del PREFIJO.",
            request.language,
            truncate_chars_end(&request.prefix, 4000),
            truncate_chars_start(&request.suffix, 2000),
        );
        let body = json!({
            "model": model,
            "messages": [
                { "role": "system", "content": crate::ai::COMPLETION_SYSTEM_PROMPT },
                { "role": "user", "content": user },
            ],
            "stream": false,
        });

        let request = http_client().post(&url).json(&body);
        let response = send_with_retries(request, None).await?;
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;
        let content = value["message"]["content"].as_str().unwrap_or("");
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
        _api_key: Option<String>,
        thinking: Option<ThinkingLevel>,
    ) -> Result<ToolResponse, String> {
        let url = format!("{}{}", self.info().base_url, self.info().chat_path);
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

        let mut body = json!({ "model": model, "messages": msgs, "tools": tools_json, "stream": false });
        if let Some(level) = thinking {
            if crate::ai::supports_thinking("ollama", model)
                && matches!(level, ThinkingLevel::High | ThinkingLevel::Max)
            {
                body["think"] = json!(true);
            }
        }

        let request = http_client().post(&url).json(&body);
        let response = send_with_retries(request, None).await?;
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;

        let message = value["message"]["content"].as_str().unwrap_or("").to_string();
        let calls = value["message"]["tool_calls"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .enumerate()
                    .filter_map(|(i, tc)| {
                        let name = tc["function"]["name"].as_str()?.to_string();
                        // Ollama devuelve los argumentos como objeto JSON
                        let arguments = tc["function"]["arguments"].clone();
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
