use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tokio::sync::oneshot;

use crate::ai::{
    get_provider, ChatMessage, CompletionRequest, KeyValidation, ModelInfo, ProviderInfo,
    StreamChunk, ThinkingLevel, ToolDef, ToolResponse,
};
use crate::ai::list_providers as ai_list_providers;
use crate::secrets;

/// Estado de una key que el frontend puede conocer. El hint son los últimos
/// 4 caracteres calculados en Rust SOLO si la key tiene >= 12; la key nunca
/// sale del keychain
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub configured: bool,
    pub hint: Option<String>,
}

/// Últimos 4 caracteres de la key, solo si tiene >= 12 (con keys cortas,
/// 4 caracteres sería demasiado revelador)
pub(crate) fn key_hint(key: &str) -> Option<String> {
    let chars: Vec<char> = key.chars().collect();
    if chars.len() >= 12 {
        Some(chars[chars.len() - 4..].iter().collect())
    } else {
        None
    }
}

/// Mapea el resultado del keychain a un estado por proveedor. Un fallo del
/// keychain se convierte en UN único error marcado `keychain-blocked:` que
/// el frontend traduce con i18n
pub(crate) fn build_key_status(
    key: Result<Option<String>, String>,
) -> Result<ApiKeyStatus, String> {
    match key {
        Ok(Some(k)) => Ok(ApiKeyStatus {
            configured: true,
            hint: key_hint(&k),
        }),
        Ok(None) => Ok(ApiKeyStatus {
            configured: false,
            hint: None,
        }),
        Err(e) => Err(format!("keychain-blocked:{e}")),
    }
}

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

/// Estado de las keys para TODOS los proveedores que requieren key, en UNA
/// llamada. Un acceso al keychain por proveedor; si el keychain falla se
/// devuelve UN único error marcado `keychain-blocked:` que el frontend
/// traduce con i18n ("No se pudo acceder al keychain del SO")
#[tauri::command]
pub fn api_key_statuses() -> Result<HashMap<String, ApiKeyStatus>, String> {
    let mut map = HashMap::new();
    for p in ai_list_providers() {
        if !p.requires_key {
            continue;
        }
        let status = build_key_status(secrets::get_key(&p.id))?;
        map.insert(p.id, status);
    }
    Ok(map)
}

/// Valida la key de un proveedor con una llamada de prueba (timeout 8 s,
/// sin redirecciones). SOLO tras guardar o con "Reintentar" — nunca al
/// arrancar. La respuesta lleva estado/motivo enum: NUNCA texto del cuerpo
/// (algunos proveedores devuelven la key enmascarada en su cuerpo)
#[tauri::command]
pub async fn validate_api_key(provider_id: String) -> Result<KeyValidation, String> {
    // Custom sin URL configurada: no hay nada contra lo que validar
    if provider_id == "custom" && crate::ai::custom::current_base_url().is_none() {
        return Ok(KeyValidation {
            estado: "unverifiable".into(),
            http_status: None,
            motivo: "noUrl".into(),
        });
    }
    let provider = get_provider(&provider_id)?;
    if !provider.requires_key() {
        // Locales (Ollama, LM Studio): sin badge ni validación
        return Ok(KeyValidation {
            estado: "unverifiable".into(),
            http_status: None,
            motivo: "noKey".into(),
        });
    }
    let Some(key) = secrets::get_key(&provider_id)? else {
        return Ok(KeyValidation {
            estado: "unverifiable".into(),
            http_status: None,
            motivo: "noKey".into(),
        });
    };
    Ok(provider.validate_key(&key).await)
}

#[tauri::command]
pub fn set_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    secrets::set_key(&provider_id, &api_key)
}

#[tauri::command]
pub fn delete_api_key(provider_id: String) -> Result<(), String> {
    secrets::delete_key(&provider_id)
}

/// Guarda la URL base del proveedor personalizado (validada aquí en Rust).
/// La key queda ligada a host:puerto: si cambia, se borra del keychain y el
/// frontend debe volver a pedirla (devuelve true). EXCEPCIÓN: `restore=true`
/// con memoria vacía (arranque desde session.json) NO toca la key — es la
/// misma URL guardada la sesión anterior. `url=None` limpia todo.
#[tauri::command]
pub fn set_custom_base_url(url: Option<String>, restore: Option<bool>) -> Result<bool, String> {
    let Some(url) = url else {
        // Limpiar configuración: borra también la key
        crate::ai::custom::store_base_url(None);
        let _ = secrets::delete_key("custom");
        return Ok(true);
    };
    let normalized = crate::ai::custom::validate_custom_base_url(&url)?;
    let previous = crate::ai::custom::current_base_url();
    let key_removed = if restore.unwrap_or(false) && previous.is_none() {
        // Restauración en arranque: la key del keychain corresponde a esta
        // misma URL guardada en session.json — no se invalida
        false
    } else {
        crate::ai::custom::host_changed(previous.as_deref(), &normalized)
    };
    if key_removed {
        let _ = secrets::delete_key("custom");
    }
    crate::ai::custom::store_base_url(Some(normalized));
    Ok(key_removed)
}

#[tauri::command]
pub fn get_custom_base_url() -> Option<String> {
    crate::ai::custom::current_base_url()
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

    let mut cancel_rx = task_id.as_ref().map(|tid| register_cancel(tid));

    let start = std::time::Instant::now();
    // Reintentos de la FASE DE STREAM (fix/gateway-retry, req. 5): solo
    // errores marcados como transitorios — por contrato (stream_error en
    // mod.rs) esos implican que AÚN no llegó contenido al frontend, así que
    // reintentar nunca duplica texto (req. 2)
    let mut stream_attempt: u32 = 0;
    let result = loop {
        let attempt_result = if let Some(rx) = cancel_rx.as_mut() {
            tokio::select! {
                result = provider.chat_stream(&model, messages.clone(), api_key.clone(), thinking_level, &on_chunk) => result,
                // Cancelable en CUALQUIER momento: durante la llamada o el
                // backoff entre reintentos (req. 3)
                _ = rx => Err("Chat cancelado por el usuario".to_string()),
            }
        } else {
            provider
                .chat_stream(&model, messages.clone(), api_key.clone(), thinking_level, &on_chunk)
                .await
        };
        match attempt_result {
            Err(e) if crate::ai::is_transient_error(&e) && stream_attempt < crate::ai::MAX_STREAM_RETRIES => {
                stream_attempt += 1;
                let reason = crate::ai::transient_reason_code(&e);
                let _ = on_chunk.send(StreamChunk::Status {
                    message: format!(
                        "gateway-retry:{stream_attempt}/{}:{reason}",
                        crate::ai::MAX_STREAM_RETRIES
                    ),
                });
                let delay = crate::ai::backoff_delay(stream_attempt - 1);
                if let Some(rx) = cancel_rx.as_mut() {
                    tokio::select! {
                        _ = tokio::time::sleep(delay) => {}
                        _ = rx => {
                            break Err("Chat cancelado por el usuario".to_string());
                        }
                    }
                } else {
                    tokio::time::sleep(delay).await;
                }
            }
            other => break other,
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_hint_con_longitudes_limite() {
        // 8 caracteres: sin hint (demasiado corto, 4 sería la mitad)
        assert_eq!(key_hint("short123"), None);
        // 12 caracteres: hint con los últimos 4
        assert_eq!(key_hint("sk-test1234567890"), Some("7890".to_string()));
        assert_eq!(key_hint("abcdefgh1234"), Some("1234".to_string()));
        // 40 caracteres: hint con los últimos 4
        let long = "sk-proj-abcdef1234567890abcdef1234567890abcd";
        assert_eq!(key_hint(long), Some("abcd".to_string()));
        // 11 caracteres: justo por debajo del umbral
        assert_eq!(key_hint("abcdefghijk"), None);
    }

    #[test]
    fn build_key_status_mapea_keychain() {
        // Key configurada → configured + hint
        let ok = build_key_status(Ok(Some("sk-abcdef1234567890wxyz".to_string()))).expect("ok");
        assert!(ok.configured);
        assert_eq!(ok.hint.as_deref(), Some("wxyz"));

        // Sin key → no configurada, sin hint
        let none = build_key_status(Ok(None)).expect("ok");
        assert!(!none.configured);
        assert!(none.hint.is_none());

        // Keychain bloqueado → UN único error marcado para i18n
        let err = build_key_status(Err("acceso denegado".to_string())).expect_err("err");
        assert!(err.starts_with("keychain-blocked:"));
        assert!(err.contains("acceso denegado"));
    }

    #[test]
    fn clasificacion_estados_http_de_validacion() {
        // 200 → valid
        let v = crate::ai::classify_key_validation_status(200);
        assert_eq!(v.estado, "valid");
        assert_eq!(v.motivo, "ok");
        assert_eq!(v.http_status, Some(200));

        // 401/403 → rejected (los ÚNICOS estados que marcan la key inválida)
        for code in [401u16, 403] {
            let v = crate::ai::classify_key_validation_status(code);
            assert_eq!(v.estado, "rejected", "HTTP {code} debe ser rejected");
            assert_eq!(v.motivo, "auth");
        }

        // 429, 5xx, 3xx, 404 y otros 4xx → unverifiable (nunca rejected)
        let casos = [
            (429u16, "rateLimit"),
            (500, "serverError"),
            (503, "serverError"),
            (529, "serverError"),
            (301, "redirect"),
            (302, "redirect"),
            (404, "noModelsEndpoint"),
            (400, "unexpectedStatus"),
            (422, "unexpectedStatus"),
        ];
        for (code, motivo) in casos {
            let v = crate::ai::classify_key_validation_status(code);
            assert_eq!(v.estado, "unverifiable", "HTTP {code} no debe ser rejected");
            assert_eq!(v.motivo, motivo, "HTTP {code}");
        }
    }

    #[test]
    fn clasificacion_errores_de_envio() {
        // Timeout → unverifiable/timeout
        let v = crate::ai::classify_key_validation_error("operation timed out after 8s");
        assert_eq!(v.estado, "unverifiable");
        assert_eq!(v.motivo, "timeout");
        assert!(v.http_status.is_none());

        // Sin red → unverifiable/noNetwork
        let v = crate::ai::classify_key_validation_error("error sending request: connection refused");
        assert_eq!(v.estado, "unverifiable");
        assert_eq!(v.motivo, "noNetwork");

        // El texto del error NUNCA se incluye en la respuesta
        let leaked = "error sending request: url http://secret-server.invalid key sk-abcdef123456";
        let v = crate::ai::classify_key_validation_error(leaked);
        let json = serde_json::to_string(&v).expect("serializa");
        assert!(!json.contains("secret-server"), "el error filtra la URL");
        assert!(!json.contains("sk-abcdef123456"), "el error filtra la key");
    }

    #[test]
    fn serializacion_de_estados_sin_key_completa() {
        // La key JAMÁS aparece en las respuestas de los comandos de keys
        let key = "sk-abcdef1234567890wxyz";

        let status = build_key_status(Ok(Some(key.to_string()))).expect("ok");
        let json = serde_json::to_string(&status).expect("serializa");
        assert!(!json.contains(key), "ApiKeyStatus filtra la key completa");
        assert!(json.contains("wxyz"), "el hint (últimos 4) sí está");

        // Key corta: sin hint en absoluto
        let short = build_key_status(Ok(Some("sk-abcd".to_string()))).expect("ok");
        let json = serde_json::to_string(&short).expect("serializa");
        assert!(!json.contains("sk-abcd"), "la key corta nunca sale");
        assert!(json.contains("\"hint\":null"), "sin hint para keys cortas");

        // KeyValidation solo lleva estado/motivo/HTTP
        let v = crate::ai::classify_key_validation_status(401);
        let json = serde_json::to_string(&v).expect("serializa");
        assert_eq!(json, r#"{"estado":"rejected","httpStatus":401,"motivo":"auth"}"#);
    }

    /// Servidor HTTP local que responde un status con un body que contiene
    /// la key (simula proveedores que devuelven la key enmascarada en el error)
    fn local_server(status_line: &'static str, body: &'static str) -> (std::net::SocketAddr, std::thread::JoinHandle<()>) {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let addr = listener.local_addr().expect("addr");
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let resp = format!("{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            let _ = stream.write_all(resp.as_bytes());
            let _ = stream.flush();
        });
        (addr, handle)
    }

    #[tokio::test]
    async fn validate_request_no_filtra_el_cuerpo_del_proveedor() {
        // El proveedor responde 401 con la key en el body (enmascarada o no):
        // la respuesta de validación SOLO lleva estado/motivo
        let key = "sk-secretkey987654321";
        let (addr, handle) = local_server(
            "HTTP/1.1 401 Unauthorized",
            r#"{"error":{"message":"Invalid API key provided: sk-secret***321"}}"#,
        );
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("client");
        let request = client.get(format!("http://{addr}/models")).bearer_auth(key);
        let v = crate::ai::validate_key_request(request).await;
        handle.join().expect("thread");

        assert_eq!(v.estado, "rejected");
        assert_eq!(v.motivo, "auth");
        assert_eq!(v.http_status, Some(401));
        // Ni la key completa ni el cuerpo del error aparecen en la respuesta
        let json = serde_json::to_string(&v).expect("serializa");
        assert!(!json.contains(key), "la key completa se filtró");
        assert!(!json.contains("sk-secret"), "el cuerpo del proveedor se filtró");
        assert!(!json.contains("Invalid API key"), "el mensaje del proveedor se filtró");
    }

    #[tokio::test]
    async fn validate_request_200_es_valid() {
        let (addr, handle) = local_server("HTTP/1.1 200 OK", r#"{"data":[]}"#);
        let client = reqwest::Client::builder().build().expect("client");
        let request = client.get(format!("http://{addr}/models")).bearer_auth("sk-abcdef123456");
        let v = crate::ai::validate_key_request(request).await;
        handle.join().expect("thread");
        assert_eq!(v.estado, "valid");
        assert_eq!(v.motivo, "ok");
    }

    #[tokio::test]
    async fn validate_request_no_sigue_redirecciones() {
        // 302 → unverifiable/redirect (la key NO se envía al destino)
        let (addr, handle) = local_server(
            "HTTP/1.1 302 Found",
            "",
        );
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("client");
        let request = client.get(format!("http://{addr}/models")).bearer_auth("sk-abcdef123456");
        let v = crate::ai::validate_key_request(request).await;
        handle.join().expect("thread");
        assert_eq!(v.estado, "unverifiable");
        assert_eq!(v.motivo, "redirect");
    }
}
