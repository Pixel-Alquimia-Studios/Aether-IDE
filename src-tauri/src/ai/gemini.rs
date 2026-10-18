use futures_util::StreamExt;
use serde_json::json;
use tauri::ipc::Channel;

use crate::ai::{
    error_from_response, extract_sse_data_lines, http_client, send_with_retries,
    truncate_chars_end, truncate_chars_start, ChatMessage, CompletionRequest, ModelInfo, Provider,
    ProviderInfo, StreamChunk, StreamUsage, ThinkingLevel, ToolCall, ToolDef, ToolResponse,
};

pub struct GeminiProvider;

#[async_trait::async_trait]
impl Provider for GeminiProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "gemini".into(),
            name: "Google Gemini".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://generativelanguage.googleapis.com/v1beta".into(),
            chat_path: "/models/{model}:streamGenerateContent".into(),
            default_models: vec![
                ModelInfo::multimodal("gemini-2.5-pro", 1_048_576, &["audio", "video"]),
                ModelInfo::multimodal("gemini-2.5-flash", 1_048_576, &["audio", "video"]),
                ModelInfo::multimodal("gemini-2.5-flash-lite", 1_048_576, &[]),
            ],
        }
    }

    async fn fetch_models(&self, api_key: Option<String>) -> Result<Vec<ModelInfo>, String> {
        let key = api_key.ok_or_else(|| "API key no configurada".to_string())?;
        let response = http_client()
            .get("https://generativelanguage.googleapis.com/v1beta/models")
            .header("x-goog-api-key", key)
            .send()
            .await
            .map_err(|e| format!("Error de conexión: {e}"))?;
        if !response.status().is_success() {
            return Err(error_from_response(response).await);
        }
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;
        let data = value["models"]
            .as_array()
            .ok_or_else(|| "Respuesta inesperada del proveedor".to_string())?;
        Ok(data
            .iter()
            .filter_map(|m| {
                let name = m["name"].as_str()?;
                let id = name.strip_prefix("models/")?;
                Some(ModelInfo {
                    id: id.to_string(),
                    max_context_tokens: m["inputTokenLimit"].as_u64(),
                    modalities: vec!["text".into(), "image".into()],
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
        let key = api_key.ok_or_else(|| "API key no configurada".to_string())?;

        // Gemini usa "model" como rol del asistente y systemInstruction para los system
        let system = messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let contents: Vec<serde_json::Value> = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| {
                let role = if m.role == "assistant" { "model" } else { "user" };
                json!({ "role": role, "parts": [{ "text": m.content }] })
            })
            .collect();

        let mut body = json!({ "contents": contents });
        // thinkingConfig para Gemini 2.5
        if let Some(level) = thinking {
            if crate::ai::supports_thinking("gemini", model) {
                body["generationConfig"] = json!({
                    "thinkingConfig": { "thinkingBudget": level.gemini_budget(), "includeThoughts": true }
                });
            }
        }
        if !system.is_empty() {
            body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
        }

        let url = format!(
            "{}/models/{model}:streamGenerateContent?alt=sse",
            self.info().base_url
        );
        let request = http_client()
            .post(&url)
            .header("x-goog-api-key", key)
            .json(&body);

        let response = send_with_retries(request, Some(channel)).await?;

        let mut generated_chars: u64 = 0;
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| format!("Error recibiendo el stream: {e}"))?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));
            for data in extract_sse_data_lines(&mut buffer) {
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&data) else {
                    continue;
                };
                if let Some(parts) = value["candidates"][0]["content"]["parts"].as_array() {
                    for part in parts {
                        if let Some(t) = part["text"].as_str() {
                            if t.is_empty() {
                                continue;
                            }
                            // parts marcados con "thought": true son razonamiento
                            if part["thought"].as_bool() == Some(true) {
                                channel
                                    .send(StreamChunk::Thinking { text: t.to_string() })
                                    .map_err(|e| format!("Error de IPC: {e}"))?;
                            } else {
                                generated_chars += t.chars().count() as u64;
                                channel
                                    .send(StreamChunk::Delta { text: t.to_string() })
                                    .map_err(|e| format!("Error de IPC: {e}"))?;
                            }
                        }
                    }
                }
                if value["candidates"][0]["finishReason"].as_str() == Some("STOP") {
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
        api_key: Option<String>,
    ) -> Result<Option<String>, String> {
        let key = api_key.ok_or_else(|| "API key no configurada".to_string())?;
        let user = format!(
            "Lenguaje: {}\n\nPREFIJO (el cursor está al final):\n{}\n\nSUFIJO (código posterior):\n{}\n\nContinúa el código exactamente desde el final del PREFIJO.",
            request.language,
            truncate_chars_end(&request.prefix, 4000),
            truncate_chars_start(&request.suffix, 2000),
        );
        let body = json!({
            "contents": [{ "role": "user", "parts": [{ "text": user }] }],
            "systemInstruction": { "parts": [{ "text": crate::ai::COMPLETION_SYSTEM_PROMPT }] },
            "generationConfig": { "maxOutputTokens": 128, "temperature": 0.2 },
        });

        let url = format!("{}/models/{model}:generateContent", self.info().base_url);
        let request = http_client()
            .post(&url)
            .header("x-goog-api-key", key)
            .json(&body);
        let response = send_with_retries(request, None).await?;
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;
        let text = value["candidates"][0]["content"]["parts"]
            .as_array()
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| p["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();
        let clean = crate::ai::strip_code_fences(&text);
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
        let key = api_key.ok_or_else(|| "API key no configurada".to_string())?;

        let system = messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let contents: Vec<serde_json::Value> = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| {
                let role = if m.role == "assistant" { "model" } else { "user" };
                json!({ "role": role, "parts": [{ "text": m.content }] })
            })
            .collect();

        let tools_json: Vec<serde_json::Value> = vec![json!({
            "functionDeclarations": tools
                .iter()
                .map(|t| json!({ "name": t.name, "description": t.description, "parameters": t.parameters }))
                .collect::<Vec<_>>(),
        })];

        let mut body = json!({ "contents": contents, "tools": tools_json });
        if let Some(level) = thinking {
            if crate::ai::supports_thinking("gemini", model) {
                body["generationConfig"] =
                    json!({ "thinkingConfig": { "thinkingBudget": level.gemini_budget() } });
            }
        }
        if !system.is_empty() {
            body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
        }

        let url = format!("{}/models/{model}:generateContent", self.info().base_url);
        let request = http_client()
            .post(&url)
            .header("x-goog-api-key", key)
            .json(&body);
        let response = send_with_retries(request, None).await?;
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;

        let mut text = String::new();
        let mut calls = Vec::new();
        if let Some(parts) = value["candidates"][0]["content"]["parts"].as_array() {
            for part in parts {
                if let Some(t) = part["text"].as_str() {
                    text.push_str(t);
                }
                if let Some(function_call) = part["functionCall"].as_object() {
                    let name = function_call
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("desconocida");
                    calls.push(ToolCall {
                        id: String::new(),
                        name: name.to_string(),
                        arguments: function_call.get("args").cloned().unwrap_or(json!({})),
                    });
                }
            }
        }
        // Gemini no devuelve id de llamada: se generan localmente
        for (i, call) in calls.iter_mut().enumerate() {
            if call.id.is_empty() {
                call.id = format!("gemini-call-{i}");
            }
        }

        if calls.is_empty() {
            Ok(ToolResponse::Text { text })
        } else {
            Ok(ToolResponse::ToolCalls { message: text, calls })
        }
    }
}
