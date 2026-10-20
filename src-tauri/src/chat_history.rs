use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub role: String,
    pub content: String,
    /// Turno al que pertenece el mensaje (Time Travel / rollback). Opcional:
    /// los chats guardados antes de persistirlo se cargan igual (serde default)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    /// Timestamp de creación (M4: orden del timeline unificado tras reanudar)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ts: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub messages: Vec<StoredMessage>,
    /// Pasos del agente persistidos (transparentes para Rust: se guardan tal cual)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_steps: Option<Vec<serde_json::Value>>,
    /// Workspace al que pertenece la sesión — los chats son por carpeta
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_root: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSummary {
    pub id: String,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn chats_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo resolver el directorio de datos: {e}"))?
        .join("chats");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear el directorio de chats: {e}"))?;
    Ok(dir)
}

fn chat_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("ID de chat inválido".to_string());
    }
    Ok(chats_dir(app)?.join(format!("{id}.json")))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn write_chat(path: &PathBuf, chat: &ChatSession) -> Result<(), String> {
    let tmp = path.with_file_name(format!(".{}.tmp", chat.id));
    let raw = serde_json::to_string_pretty(chat)
        .map_err(|e| format!("No se pudo serializar el chat: {e}"))?;
    fs::write(&tmp, raw).map_err(|e| format!("No se pudo guardar el chat: {e}"))?;
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("No se pudo guardar el chat: {e}"));
    }
    Ok(())
}

#[tauri::command]
pub fn create_chat(app: AppHandle, chat: ChatSession) -> Result<(), String> {
    let path = chat_path(&app, &chat.id)?;
    write_chat(&path, &chat)
}

#[tauri::command]
pub fn list_chats(app: AppHandle, root: String) -> Result<Vec<ChatSummary>, String> {
    let dir = chats_dir(&app)?;
    let mut summaries = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("No se pudo leer el historial: {e}"))?;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(session) = serde_json::from_str::<ChatSession>(&raw) else {
            continue;
        };
        // Los chats son por carpeta: solo sesiones de ESTE workspace
        if session.workspace_root.as_deref() != Some(root.as_str()) {
            continue;
        }
        summaries.push(ChatSummary {
            id: session.id,
            title: session.title,
            created_at: session.created_at,
            updated_at: session.updated_at,
        });
    }
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(summaries)
}

#[tauri::command]
pub fn load_chat(app: AppHandle, id: String) -> Result<Option<ChatSession>, String> {
    let path = chat_path(&app, &id)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("No se pudo leer el chat: {e}"))?;
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|e| format!("Chat corrupto: {e}"))
}

#[tauri::command]
pub fn save_chat(app: AppHandle, chat: ChatSession) -> Result<(), String> {
    let path = chat_path(&app, &chat.id)?;
    write_chat(&path, &chat)
}

#[tauri::command]
pub fn rename_chat(app: AppHandle, id: String, title: String) -> Result<(), String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("El título no puede estar vacío".to_string());
    }
    let path = chat_path(&app, &id)?;
    if !path.exists() {
        return Err(format!("No existe el chat '{id}'"));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("No se pudo leer el chat: {e}"))?;
    let mut session: ChatSession =
        serde_json::from_str(&raw).map_err(|e| format!("Chat corrupto: {e}"))?;
    session.title = title;
    session.updated_at = now_ms();
    write_chat(&path, &session)
}

#[tauri::command]
pub fn delete_chat(app: AppHandle, id: String) -> Result<(), String> {
    let path = chat_path(&app, &id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("No se pudo eliminar el chat: {e}"))?;
    }
    Ok(())
}
