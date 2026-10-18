use futures_util::StreamExt;
use serde_json::json;
use tauri::ipc::Channel;

use crate::ai::{
    extract_sse_data_lines, http_client, send_with_retries, strip_code_fences,
    truncate_chars_end, truncate_chars_start, ChatMessage, CompletionRequest, ModelInfo, Provider,
    ProviderInfo, StreamChunk, StreamUsage, ThinkingLevel, ToolCall, ToolDef, ToolResponse,
};

/// Adaptador genérico para proveedores con formato OpenAI-compatible:
/// OpenAI, DeepSeek, Mistral, xAI, Groq, NVIDIA NIM, Together, Qwen, MiniMax, LM Studio.
pub struct OpenAiCompatibleProvider {
    pub info: ProviderInfo,
}

#[async_trait::async_trait]
impl Provider for OpenAiCompatibleProvider {
    fn info(&self) -> ProviderInfo {
        self.info.clone()
    }

    async fn fetch_models(&self, api_key: Option<String>) -> Result<Vec<ModelInfo>, String> {
        let url = format!("{}/models", self.info.base_url);
        let mut request = http_client().get(&url);
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
        let msgs: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| json!({ "role": m.role, "content": m.content }))
            .collect();

        let mut body = json!({
            "model": model,
            "messages": msgs,
            "stream": true,
            // Pide el objeto usage al final del stream (OpenAI, DeepSeek, Groq…;
            // los servidores que no lo soportan lo ignoran)
            "stream_options": { "include_usage": true },
        });
        // reasoning_effort solo para modelos que soportan razonamiento
        if let Some(level) = thinking {
            if crate::ai::supports_thinking(&self.info.id, model) {
                body["reasoning_effort"] = json!(level.openai_effort());
            }
        }

        let mut request = http_client().post(&url).json(&body);
        if let Some(key) = api_key {
            request = request.bearer_auth(key);
        }

        let response = send_with_retries(request, Some(channel)).await?;

        let mut usage = StreamUsage::default();
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| format!("Error recibiendo el stream: {e}"))?;
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
                    }
                }
                if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                    if !text.is_empty() {
                        usage.generated_chars += text.chars().count() as u64;
                        channel
                            .send(StreamChunk::Delta { text: text.to_string() })
                            .map_err(|e| format!("Error de IPC: {e}"))?;
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
        let body = json!({
            "model": model,
            "messages": [
                { "role": "system", "content": crate::ai::COMPLETION_SYSTEM_PROMPT },
                { "role": "user", "content": user },
            ],
            "max_tokens": 128,
            "temperature": 0.2,
        });
        let mut req = http_client().post(&url).json(&body);
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

        let mut request = http_client().post(&url).json(&body);
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
