use tauri::ipc::Channel;

use crate::ai::{
    get_provider, ChatMessage, CompletionRequest, ModelInfo, ProviderInfo, StreamChunk,
    ThinkingLevel, ToolDef, ToolResponse,
};
use crate::ai::list_providers as ai_list_providers;
use crate::secrets;

#[tauri::command]
pub fn list_providers() -> Vec<ProviderInfo> {
    ai_list_providers()
}

#[tauri::command]
pub fn has_api_key(provider_id: String) -> Result<bool, String> {
    Ok(secrets::get_key(&provider_id)?.is_some())
}

#[tauri::command]
pub fn set_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    secrets::set_key(&provider_id, &api_key)
}

#[tauri::command]
pub fn delete_api_key(provider_id: String) -> Result<(), String> {
    secrets::delete_key(&provider_id)
}

#[tauri::command]
pub async fn fetch_models(provider_id: String) -> Result<Vec<ModelInfo>, String> {
    let provider = get_provider(&provider_id)?;
    let api_key = if provider.requires_key() {
        Some(
            secrets::get_key(&provider_id)?
                .ok_or_else(|| format!("API key no configurada para '{provider_id}'"))?,
        )
    } else {
        None
    };
    provider.fetch_models(api_key).await
}

#[tauri::command]
pub async fn chat_stream(
    provider_id: String,
    model: String,
    messages: Vec<ChatMessage>,
    thinking_level: Option<ThinkingLevel>,
    on_chunk: Channel<StreamChunk>,
) -> Result<(), String> {
    let provider = get_provider(&provider_id)?;
    let api_key = if provider.requires_key() {
        Some(
            secrets::get_key(&provider_id)?
                .ok_or_else(|| format!("API key no configurada para '{provider_id}'"))?,
        )
    } else {
        None
    };

    // Métricas: el tiempo se mide aquí, en Rust
    let start = std::time::Instant::now();
    let result = provider
        .chat_stream(&model, messages, api_key, thinking_level, &on_chunk)
        .await;
    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(generated_chars) => {
            // Tokens aproximados: ≈4 caracteres por token
            let tokens = if generated_chars == 0 {
                0
            } else {
                (generated_chars / 4).max(1)
            };
            let _ = on_chunk.send(StreamChunk::Metrics { elapsed_ms, tokens });
            let _ = on_chunk.send(StreamChunk::Done);
        }
        Err(message) => {
            let _ = on_chunk.send(StreamChunk::Done);
            return Err(message);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn inline_completion(
    provider_id: String,
    model: String,
    request: CompletionRequest,
) -> Result<Option<String>, String> {
    let provider = get_provider(&provider_id)?;
    let api_key = if provider.requires_key() {
        Some(
            secrets::get_key(&provider_id)?
                .ok_or_else(|| format!("API key no configurada para '{provider_id}'"))?,
        )
    } else {
        None
    };
    provider.complete(&model, request, api_key).await
}

#[tauri::command]
pub async fn chat_with_tools(
    provider_id: String,
    model: String,
    messages: Vec<ChatMessage>,
    tools: Vec<ToolDef>,
    thinking_level: Option<ThinkingLevel>,
) -> Result<ToolResponse, String> {
    let provider = get_provider(&provider_id)?;
    let api_key = if provider.requires_key() {
        Some(
            secrets::get_key(&provider_id)?
                .ok_or_else(|| format!("API key no configurada para '{provider_id}'"))?,
        )
    } else {
        None
    };
    provider
        .chat_with_tools(&model, messages, tools, api_key, thinking_level)
        .await
}
