use std::collections::HashMap;
use std::sync::Mutex;

use tauri::ipc::Channel;
use tokio::sync::oneshot;

use crate::ai::{
    get_provider, ChatMessage, CompletionRequest, ModelInfo, ProviderInfo, StreamChunk,
    ThinkingLevel, ToolDef, ToolResponse,
};
use crate::ai::list_providers as ai_list_providers;
use crate::secrets;

static RUNNING_TASKS: Mutex<Option<HashMap<String, oneshot::Sender<()>>>> = Mutex::new(None);

fn register_cancel(task_id: &str) -> oneshot::Receiver<()> {
    let (tx, rx) = oneshot::channel::<()>();
    if let Ok(mut guard) = RUNNING_TASKS.lock() {
        guard
            .get_or_insert_with(HashMap::new)
            .insert(task_id.to_string(), tx);
    }
    rx
}

fn unregister_task(task_id: &str) {
    if let Ok(mut guard) = RUNNING_TASKS.lock() {
        if let Some(map) = guard.as_mut() {
            map.remove(task_id);
        }
    }
}

fn cancel_task(task_id: &str) {
    if let Ok(mut guard) = RUNNING_TASKS.lock() {
        if let Some(map) = guard.as_mut() {
            if let Some(tx) = map.remove(task_id) {
                let _ = tx.send(());
            }
        }
    }
}

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
    task_id: Option<String>,
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

    let cancel_rx = task_id.as_ref().map(|tid| register_cancel(tid));

    let start = std::time::Instant::now();
    let result = if let Some(mut rx) = cancel_rx {
        tokio::select! {
            result = provider.chat_stream(&model, messages, api_key, thinking_level, &on_chunk) => result,
            _ = &mut rx => Err("Chat cancelado por el usuario".to_string()),
        }
    } else {
        provider
            .chat_stream(&model, messages, api_key, thinking_level, &on_chunk)
            .await
    };
    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(usage) => {
            // Tokens reales del proveedor; fallback: estimación chars/4
            let tokens = usage.output_tokens.unwrap_or_else(|| {
                if usage.generated_chars == 0 {
                    0
                } else {
                    (usage.generated_chars / 4).max(1)
                }
            });
            let _ = on_chunk.send(StreamChunk::Metrics {
                elapsed_ms,
                tokens,
                input_tokens: usage.input_tokens,
                cached_tokens: usage.cached_tokens,
            });
            let _ = on_chunk.send(StreamChunk::Done);
        }
        Err(message) => {
            // El error ya viaja al frontend por el canal (StreamChunk::Error);
            // el comando siempre resuelve Ok para no duplicar la entrega.
            let _ = on_chunk.send(StreamChunk::Error { message });
            let _ = on_chunk.send(StreamChunk::Done);
        }
    }

    // Salida única: siempre desregistrar (evita entradas stale en RUNNING_TASKS)
    if let Some(ref tid) = task_id {
        unregister_task(tid);
    }
    Ok(())
}

#[tauri::command]
pub fn chat_stop(task_id: String) -> Result<(), String> {
    cancel_task(&task_id);
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
    task_id: String,
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

    let cancel_rx = register_cancel(&task_id);

    let result = tokio::select! {
        result = provider.chat_with_tools(&model, messages, tools, api_key, thinking_level) => result,
        _ = cancel_rx => Err("Agent step cancelado por el usuario".to_string()),
    };

    unregister_task(&task_id);
    result
}
