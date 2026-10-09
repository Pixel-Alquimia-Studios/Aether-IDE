use futures_util::StreamExt;
use serde_json::json;
use tauri::ipc::Channel;

use crate::ai::{
    error_from_response, extract_sse_data_lines, http_client, send_with_retries,
    strip_code_fences, truncate_chars_end, truncate_chars_start, ChatMessage, CompletionRequest,
    ModelInfo, Provider, ProviderInfo, StreamChunk, ThinkingLevel, ToolCall, ToolDef, ToolResponse,
};

pub struct AnthropicProvider;

#[async_trait::async_trait]
impl Provider for AnthropicProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "anthropic".into(),
            name: "Anthropic (Claude)".into(),
            kind: "cloud".into(),
            requires_key: true,
            base_url: "https://api.anthropic.com/v1".into(),
            chat_path: "/messages".into(),
            default_models: vec![
                ModelInfo::multimodal("claude-sonnet-4-5", 200_000, &[]),
                ModelInfo::multimodal("claude-opus-4-1", 200_000, &[]),
                ModelInfo::multimodal("claude-haiku-4-5", 200_000, &[]),
            ],
        }
    }

    async fn fetch_models(&self, api_key: Option<String>) -> Result<Vec<ModelInfo>, String> {
        let key = api_key.ok_or_else(|| "API key no configurada".to_string())?;
        let response = http_client()
            .get("https://api.anthropic.com/v1/models")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
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
        let data = value["data"]
            .as_array()
            .ok_or_else(|| "Respuesta inesperada del proveedor".to_string())?;
        Ok(data
            .iter()
            .filter_map(|m| m["id"].as_str())
            .map(ModelInfo::text)
            .collect())
    }

    async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        api_key: Option<String>,
        thinking: Option<ThinkingLevel>,
        channel: &Channel<StreamChunk>,
    ) -> Result<u64, String> {
        let key = api_key.ok_or_else(|| "API key no configurada".to_string())?;

        // Anthropic separa los mensajes system del resto
        let system = messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let chat: Vec<serde_json::Value> = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| json!({ "role": m.role, "content": m.content }))
            .collect();

        let mut body = json!({
            "model": model,
            "max_tokens": 8192,
            "stream": true,
            "messages": chat,
        });
        // Extended thinking para Claude 3.7+; max_tokens debe superar el budget
        if let Some(level) = thinking {
            if crate::ai::supports_thinking("anthropic", model) {
                let budget = level.anthropic_budget();
                body["thinking"] = json!({ "type": "enabled", "budget_tokens": budget });
                body["max_tokens"] = json!(budget + 8192);
            }
        }
        if !system.is_empty() {
            body["system"] = json!(system);
        }

        let request = http_client()
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
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
                match value["type"].as_str() {
                    Some("content_block_delta") => {
                        // thinking_delta: razonamiento; text_delta: contenido
                        if value["delta"]["type"].as_str() == Some("thinking_delta") {
                            if let Some(t) = value["delta"]["thinking"].as_str() {
                                if !t.is_empty() {
                                    channel
                                        .send(StreamChunk::Thinking { text: t.to_string() })
                                        .map_err(|e| format!("Error de IPC: {e}"))?;
                                }
                            }
                        } else if let Some(text) = value["delta"]["text"].as_str() {
                            if !text.is_empty() {
                                generated_chars += text.chars().count() as u64;
                                channel
                                    .send(StreamChunk::Delta { text: text.to_string() })
                                    .map_err(|e| format!("Error de IPC: {e}"))?;
                            }
                        }
                    }
                    Some("message_stop") => {
                        return Ok(generated_chars);
                    }
                    Some("error") => {
                        let message = value["error"]["message"]
                            .as_str()
                            .unwrap_or("Error del proveedor")
                            .to_string();
                        return Err(message);
                    }
                    _ => {}
                }
            }
        }
        Ok(generated_chars)
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
            "model": model,
            "max_tokens": 128,
            "system": crate::ai::COMPLETION_SYSTEM_PROMPT,
            "messages": [{ "role": "user", "content": user }],
        });

        let request = http_client()
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .json(&body);
        let response = send_with_retries(request, None).await?;
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;
        let content = value["content"][0]["text"].as_str().unwrap_or("");
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
        let key = api_key.ok_or_else(|| "API key no configurada".to_string())?;

        let system = messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        let chat: Vec<serde_json::Value> = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| json!({ "role": m.role, "content": m.content }))
            .collect();

        let tools_json: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                })
            })
            .collect();

        let mut body = json!({
            "model": model,
            "max_tokens": 8192,
            "tools": tools_json,
            "messages": chat,
        });
        if let Some(level) = thinking {
            if crate::ai::supports_thinking("anthropic", model) {
                let budget = level.anthropic_budget();
                body["thinking"] = json!({ "type": "enabled", "budget_tokens": budget });
                body["max_tokens"] = json!(budget + 8192);
            }
        }
        if !system.is_empty() {
            body["system"] = json!(system);
        }

        let request = http_client()
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .json(&body);
        let response = send_with_retries(request, None).await?;
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida: {e}"))?;

        let mut text = String::new();
        let mut calls = Vec::new();
        if let Some(blocks) = value["content"].as_array() {
            for block in blocks {
                match block["type"].as_str() {
                    Some("text") => text.push_str(block["text"].as_str().unwrap_or("")),
                    Some("tool_use") => calls.push(ToolCall {
                        id: block["id"].as_str().unwrap_or("call").to_string(),
                        name: block["name"].as_str().unwrap_or("desconocida").to_string(),
                        arguments: block["input"].clone(),
                    }),
                    _ => {}
                }
            }
        }

        if calls.is_empty() {
            Ok(ToolResponse::Text { text })
        } else {
            Ok(ToolResponse::ToolCalls { message: text, calls })
        }
    }
}
