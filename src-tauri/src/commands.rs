use std::collections::HashMap;
use std::fs;
use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use crate::ai::ModelInfo;
use notify::event::ModifyKind;
use notify::{Event, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub path: String,
    pub name: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

const MAX_DEPTH: usize = 8;
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".venv",
    "__pycache__",
];

// --- ContenciÃ³n del workspace (v0.3.1, hallazgos S1/S2 del plan de hardening) ---

/// Workspace actual conocido por el BACKEND. Se fija con `set_workspace` al
/// abrir una carpeta (o restaurar la sesiÃ³n). Los comandos que usa el agente
/// SIEMPRE toman el root de aquÃ­: el frontend no puede enviar un root
/// alternativo para saltarse la contenciÃ³n.
pub struct WorkspaceState(pub Mutex<Option<PathBuf>>);

fn backend_workspace(state: &State<'_, WorkspaceState>) -> Result<PathBuf, String> {
    let guard = state
        .0
        .lock()
        .map_err(|_| "El lock del workspace estÃ¡ envenenado".to_string())?;
    guard
        .clone()
        .ok_or_else(|| "No hay un workspace abierto".to_string())
}

/// Nombres reservados de Windows (dispositivos). Se compara el stem sin case:
/// CON.txt, nul.log, etc. tambiÃ©n estÃ¡n reservados.
const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Rechaza nombres reservados de Windows y streams alternos (ADS) en el
/// componente final: 'CON', 'nul.txt', 'file.txt:stream'â€¦
fn reject_windows_special(target_canon: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Some(name) = target_canon.file_name().map(|n| n.to_string_lossy().to_string()) {
            // ADS: dos puntos en el componente final (la unidad nunca aparece aquÃ­)
            if name.contains(':') {
                return Err(format!(
                    "Nombre de archivo invÃ¡lido (streams alternos no permitidos): '{name}'"
                ));
            }
            let stem = name.split('.').next().unwrap_or(&name).to_uppercase();
            if WINDOWS_RESERVED.contains(&stem.as_str()) {
                return Err(format!("Nombre de archivo reservado de Windows: '{name}'"));
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = target_canon;
    }
    Ok(())
}

/// Normaliza `target` (resuelve symlinks/junctions y '..') y verifica que
/// quede DENTRO de `root` (la propia raÃ­z cuenta como dentro; delete_file
/// aÃ±ade su rechazo de la raÃ­z). Para archivos que aÃºn no existen se
/// canonicaliza el directorio padre y se recompone el nombre. En Windows
/// canonicalize devuelve prefijo `\\?\` â€” se canonicaliza AMBOS lados para
/// que la comparaciÃ³n sea consistente.
fn ensure_in_workspace(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("No se pudo resolver el workspace '{}': {e}", root.display()))?;
    let target_canon = if target.exists() {
        target.canonicalize()
    } else {
        let parent = target.parent().filter(|p| p.is_dir()).ok_or_else(|| {
            format!("Directorio padre inexistente para '{}'", target.display())
        })?;
        parent
            .canonicalize()
            .map(|p| p.join(target.file_name().unwrap_or_default()))
    }
    .map_err(|e| format!("No se pudo resolver '{}': {e}", target.display()))?;
    if !target_canon.starts_with(&root_canon) {
        return Err(format!(
            "La ruta '{}' estÃ¡ fuera del workspace activo",
            target.display()
        ));
    }
    reject_windows_special(&target_canon)?;
    Ok(target_canon)
}

#[tauri::command]
pub fn set_workspace(state: State<'_, WorkspaceState>, path: String) -> Result<String, String> {
    let canon = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("No se pudo abrir el workspace '{path}': {e}"))?;
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "El lock del workspace estÃ¡ envenenado".to_string())?;
    *guard = Some(canon.clone());
    Ok(canon.to_string_lossy().to_string())
}

// --- Límites de lectura (M2, v0.3.1): sin esto, un archivo gigante
// materializado en String + JSON IPC + String JS + modelo Monaco congelaba
// o reventaba el WebView (OOM) ---
/// Tamaño máximo de lectura COMPLETA (read_file / read_file_base64)
const MAX_READ_BYTES: u64 = 20 * 1024 * 1024;
/// Tamaño máximo del archivo para la lectura POR SECCIONES (scan de bytes)
const MAX_RANGE_SCAN_BYTES: u64 = 512 * 1024 * 1024;
/// Tope de contenido capturado por sección (líneas enormes incluidas)
const MAX_RANGE_CAPTURE: usize = 2 * 1024 * 1024;

fn read_guard(target: &Path, path: &str, max: u64) -> Result<u64, String> {
    let len = fs::metadata(target)
        .map(|m| m.len())
        .map_err(|e| format!("No se pudo leer '{path}': {e}"))?;
    if len > max {
        return Err(format!(
            "'{path}' es demasiado grande ({} MB > límite de {} MB) para abrirlo en el editor",
            (len + 1024 * 1024 - 1) / (1024 * 1024),
            max / (1024 * 1024)
        ));
    }
    Ok(len)
}

/// Cuenta las líneas de un archivo escaneando POR BYTES en chunks (sin
/// materializar el contenido en memoria)
fn count_lines(target: &Path) -> std::io::Result<usize> {
    let mut file = fs::File::open(target)?;
    let mut lines: usize = 0;
    let mut buf = [0u8; 256 * 1024];
    let mut last_byte = 0u8;
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        lines += buf[..n].iter().filter(|&&b| b == b'\n').count();
        last_byte = buf[n - 1];
    }
    // Sin \n final: la última línea no cuenta salvo que el archivo tenga algo
    if lines == 0 && last_byte != 0 {
        return Ok(1);
    }
    if last_byte != b'\n' && last_byte != 0 {
        lines += 1;
    }
    Ok(lines)
}

/// Captura SOLO los bytes de las líneas [start..=end] (escaneo con salida
/// temprana al pasar del rango), con tope de memoria. Devuelve el contenido
/// y si quedó truncado por el tope.
fn capture_lines(target: &Path, start: usize, end: usize) -> std::io::Result<(String, bool)> {
    let mut file = fs::File::open(target)?;
    let mut captured: Vec<u8> = Vec::new();
    let mut truncated = false;
    let mut line_no: usize = 1;
    let mut buf = [0u8; 256 * 1024];
    'outer: loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        for &b in &buf[..n] {
            if line_no >= start && line_no <= end {
                if captured.len() < MAX_RANGE_CAPTURE {
                    captured.push(b);
                } else {
                    truncated = true;
                    break 'outer;
                }
            }
            if b == b'\n' {
                line_no += 1;
                if line_no > end {
                    break 'outer;
                }
            }
        }
    }
    // Decodifica de una vez (rango contiguo — sin problema de bordes de chunk).
    // lines().join normaliza CRLF→LF y quita el \n final del rango (misma
    // semántica que el read_to_string + lines() de la ruta rápida)
    let decoded = String::from_utf8_lossy(&captured);
    let mut content = decoded.lines().collect::<Vec<_>>().join("\n");
    if truncated {
        content.push_str("\n… (sección truncada: excede el límite de 2 MB por lectura — el archivo tiene líneas enormes)");
    }
    Ok((content, truncated))
}

#[tauri::command]
pub fn read_file(state: State<'_, WorkspaceState>, path: String) -> Result<String, String> {
    let root = backend_workspace(&state)?;
    let target = ensure_in_workspace(&root, Path::new(&path))?;
    read_guard(&target, &path, MAX_READ_BYTES)?;
    fs::read_to_string(&target).map_err(|e| format!("No se pudo leer '{path}': {e}"))
}

/// Lectura SIN contenciÃ³n: SOLO para flujos explÃ­citos del usuario
/// (Archivo â†’ Abrir archivo puede abrir fuera del workspace). Los comandos
/// que usa el agente van por `read_file`, que sÃ­ contiene.
#[tauri::command]
pub fn read_file_user(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("No se pudo leer '{path}': {e}"))
}

/// Lectura binaria segura para el visualizador de imÃ¡genes: devuelve el
/// contenido del archivo codificado en base64 (data URL lo construye el
/// frontend segÃºn la extensiÃ³n)
#[tauri::command]
pub fn read_file_base64(state: State<'_, WorkspaceState>, path: String) -> Result<String, String> {
    let root = backend_workspace(&state)?;
    let target = ensure_in_workspace(&root, Path::new(&path))?;
    read_guard(&target, &path, MAX_READ_BYTES)?;
    let bytes = fs::read(&target).map_err(|e| format!("No se pudo leer '{path}': {e}"))?;
    use base64::Engine as _;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadRange {
    pub content: String,
    pub total_lines: usize,
    pub start_line: usize,
    pub end_line: usize,
}

/// Lectura por secciones para el análisis del agente: permite leer archivos
/// grandes por rangos de líneas sin truncar a ciegas. M2 (v0.3.1): con
/// archivo grande hace un ESCANEO POR BYTES acotado (cuenta líneas y captura
/// solo el rango) — ya no carga el archivo completo en memoria por llamada.
#[tauri::command]
pub fn read_file_range(
    state: State<'_, WorkspaceState>,
    path: String,
    start_line: usize,
    end_line: usize,
) -> Result<ReadRange, String> {
    let root = backend_workspace(&state)?;
    let target = ensure_in_workspace(&root, Path::new(&path))?;
    let meta = fs::metadata(&target).map_err(|e| format!("No se pudo leer '{path}': {e}"))?;
    if meta.len() > MAX_RANGE_SCAN_BYTES {
        return Err(format!(
            "'{path}' es demasiado grande incluso para lectura por secciones (>{} MB)",
            MAX_RANGE_SCAN_BYTES / (1024 * 1024)
        ));
    }

    // Ruta rápida: archivos pequeños → lectura completa (comportamiento de siempre)
    if meta.len() <= MAX_READ_BYTES {
        let content =
            fs::read_to_string(&target).map_err(|e| format!("No se pudo leer '{path}': {e}"))?;
        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();
        if total_lines == 0 {
            return Ok(ReadRange {
                content: String::new(),
                total_lines: 0,
                start_line: 0,
                end_line: 0,
            });
        }
        let start = start_line.max(1).min(total_lines);
        let end = end_line.max(start).min(total_lines);
        return Ok(ReadRange {
            content: lines[start - 1..end].join("\n"),
            total_lines,
            start_line: start,
            end_line: end,
        });
    }

    // Archivo grande: scan por bytes (dos pasadas baratas sin alloc grande)
    let total_lines = count_lines(&target).map_err(|e| format!("No se pudo leer '{path}': {e}"))?;
    if total_lines == 0 {
        return Ok(ReadRange {
            content: String::new(),
            total_lines: 0,
            start_line: 0,
            end_line: 0,
        });
    }
    let start = start_line.max(1).min(total_lines);
    let end = end_line.max(start).min(total_lines);
    let (content, _truncated) =
        capture_lines(&target, start, end).map_err(|e| format!("No se pudo leer '{path}': {e}"))?;
    Ok(ReadRange {
        content,
        total_lines,
        start_line: start,
        end_line: end,
    })
}

/// ComprobaciÃ³n de existencia para los checkpoints del Time Travel: un fallo
/// de read_file (binario, permisos) no distingue "no existe" de "ilegible"
#[tauri::command]
pub fn file_exists(state: State<'_, WorkspaceState>, path: String) -> Result<bool, String> {
    let root = backend_workspace(&state)?;
    let target = ensure_in_workspace(&root, Path::new(&path))?;
    Ok(target.exists())
}

#[tauri::command]
pub fn write_file(state: State<'_, WorkspaceState>, path: String, content: String) -> Result<(), String> {
    let root = backend_workspace(&state)?;
    let target = ensure_in_workspace(&root, Path::new(&path))?;
    atomic_write(&target, &content)
}

/// Escritura SIN contenciÃ³n: SOLO flujos explÃ­citos del usuario (guardar un
/// archivo abierto con Archivo â†’ Abrir, o Save As fuera del workspace).
#[tauri::command]
pub fn write_file_user(path: String, content: String) -> Result<(), String> {
    atomic_write(Path::new(&path), &content)
}

/// Escritura atÃ³mica: archivo temporal + rename (evita corrupciÃ³n si el
/// proceso muere a mitad de escritura)
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| format!("Ruta invÃ¡lida: '{}'", path.display()))?;
    let parent = path
        .parent()
        .filter(|p| p.is_dir())
        .ok_or_else(|| format!("Directorio padre inexistente para '{}'", path.display()))?;
    let tmp = parent.join(format!(".{file_name}.aether-tmp"));
    fs::write(&tmp, content).map_err(|e| format!("No se pudo escribir '{}': {e}", path.display()))?;
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("No se pudo escribir '{}': {e}", path.display()));
    }
    Ok(())
}

#[tauri::command]
pub fn read_dir(state: State<'_, WorkspaceState>, path: String) -> Result<Vec<FileNode>, String> {
    let root_ws = backend_workspace(&state)?;
    let target = ensure_in_workspace(&root_ws, Path::new(&path))?;
    if !target.is_dir() {
        return Err(format!("'{path}' no es un directorio"));
    }
    walk_dir(&target, 0).map_err(|e| format!("No se pudo leer '{path}': {e}"))
}

fn walk_dir(dir: &Path, depth: usize) -> std::io::Result<Vec<FileNode>> {
    let entries = fs::read_dir(dir)?;
    // Carpetas primero y luego archivos, ambos ordenados alfabÃ©tico case-insensitive
    let mut items: Vec<(bool, String, PathBuf)> = entries
        .filter_map(|e| e.ok())
        .map(|e| {
            (
                e.file_type().map(|t| t.is_dir()).unwrap_or(false),
                e.file_name().to_string_lossy().to_string(),
                e.path(),
            )
        })
        .collect();
    items.sort_by(|a, b| {
        // b.0.cmp(&a.0): carpetas (true) antes que archivos (false)
        b.0.cmp(&a.0)
            .then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase()))
    });

    let mut nodes = Vec::new();
    for (is_dir, name, entry_path) in items {
        let path = entry_path.to_string_lossy().to_string();

        if is_dir {
            if IGNORED_DIRS.contains(&name.as_str()) || (name.starts_with('.') && depth > 0) {
                continue;
            }
            let children = if depth + 1 < MAX_DEPTH {
                Some(walk_dir(entry_path.as_path(), depth + 1)?)
            } else {
                None
            };
            nodes.push(FileNode {
                path,
                name,
                kind: "directory".into(),
                children,
            });
        } else {
            nodes.push(FileNode {
                path,
                name,
                kind: "file".into(),
                children: None,
            });
        }
    }
    Ok(nodes)
}

#[tauri::command]
pub async fn pick_workspace_dir(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, mut rx) = tauri::async_runtime::channel::<Option<String>>(1);

    let _ = app.dialog().file().pick_folder(move |folder| {
        let path = folder
            .and_then(|f| f.into_path().ok())
            .map(|p| p.to_string_lossy().to_string());
        let _ = tx.blocking_send(path);
    });

    rx.recv()
        .await
        .ok_or_else(|| "El diÃ¡logo se cerrÃ³ sin completar la selecciÃ³n".to_string())
}

static WATCHER: Mutex<Option<notify::RecommendedWatcher>> = Mutex::new(None);

#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    state: State<'_, WorkspaceState>,
    path: String,
) -> Result<(), String> {
    // Belt and braces: fija tambiÃ©n el workspace del backend (por si
    // set_workspace no se llamÃ³ antes en algÃºn flujo)
    if let Ok(canon) = Path::new(&path).canonicalize() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = Some(canon);
        }
    }

    // Sustituye el watcher anterior (drop libera los handles del SO)
    {
        let mut guard = WATCHER
            .lock()
            .map_err(|_| "El lock del watcher estÃ¡ envenenado".to_string())?;
        *guard = None;
    }

    let (tx, rx) = mpsc::channel::<Vec<String>>();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        let Ok(event) = res else { return };
        // M10 (v0.3.1): ignora .git Y los directorios de dependencias/build
        // (node_modules, target, dist…) — un npm install generaba tormentas
        // de eventos con re-reads completos del árbol y git status repetidos
        let ignored = event.paths.iter().any(|p| {
            let s = p.to_string_lossy().replace('\\', "/");
            s.contains("/.git/")
                || s.ends_with("/.git")
                || IGNORED_DIRS
                    .iter()
                    .any(|d| s.contains(&format!("/{d}/")) || s.ends_with(&format!("/{d}")))
        });
        if ignored {
            return;
        }
        let relevant = match &event.kind {
            notify::EventKind::Create(_) | notify::EventKind::Remove(_) => true,
            notify::EventKind::Modify(kind) => {
                matches!(kind, ModifyKind::Name(_) | ModifyKind::Data(_))
            }
            _ => false,
        };
        if relevant {
            let paths = event
                .paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            let _ = tx.send(paths);
        }
    })
    .map_err(|e| format!("No se pudo iniciar el watcher: {e}"))?;

    watcher
        .watch(Path::new(&path), notify::RecursiveMode::Recursive)
        .map_err(|e| format!("No se pudo vigilar '{path}': {e}"))?;

    let app_handle = app.clone();
    std::thread::spawn(move || {
        // Debounce: drena rÃ¡fagas de eventos y emite tras 300 ms de quietud
        while let Some(mut paths) = rx.recv().ok() {
            loop {
                match rx.recv_timeout(Duration::from_millis(300)) {
                    Ok(more) => paths.extend(more),
                    Err(_) => break,
                }
            }
            let _ = app_handle.emit("workspace-changed", paths);
        }
    });

    let mut guard = WATCHER
        .lock()
        .map_err(|_| "El lock del watcher estÃ¡ envenenado".to_string())?;
    *guard = Some(watcher);
    Ok(())
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionData {
    pub root_path: Option<String>,
    pub open_tabs: Vec<String>,
    pub active_tab: Option<String>,
    pub expanded_dirs: Vec<String>,
    pub active_view: Option<String>,
    pub sidebar_visible: bool,
    pub selected_provider: Option<String>,
    pub selected_model: Option<String>,
    pub fetched_models: HashMap<String, Vec<ModelInfo>>,
    pub active_chat_id: Option<String>,
    pub auto_save: bool,
    pub agent_mode: Option<String>,
}

#[tauri::command]
pub fn load_session(app: AppHandle) -> Result<Option<SessionData>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo resolver el directorio de datos: {e}"))?;
    let file = dir.join("session.json");
    if !file.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&file).map_err(|e| format!("No se pudo leer la sesiÃ³n: {e}"))?;
    match serde_json::from_str(&raw) {
        Ok(session) => Ok(Some(session)),
        Err(_e) => {
            // M11 (v0.3.1): cuarentena — el archivo corrupto se aparta para
            // que el SIGUIENTE arranque no vuelva a fallar eternamente; la
            // app arranca con defaults
            let quarantined = dir.join("session.json.corrupt");
            let _ = fs::rename(&file, &quarantined);
            Ok(None)
        }
    }
}

#[tauri::command]
pub fn save_session(app: AppHandle, session: SessionData) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No se pudo resolver el directorio de datos: {e}"))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear el directorio de datos: {e}"))?;

    let file = dir.join("session.json");
    let tmp = dir.join(".session.json.aether-tmp");
    let raw = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("No se pudo serializar la sesiÃ³n: {e}"))?;
    fs::write(&tmp, raw).map_err(|e| format!("No se pudo escribir la sesiÃ³n: {e}"))?;
    if let Err(e) = fs::rename(&tmp, &file) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("No se pudo guardar la sesiÃ³n: {e}"));
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub line_number: u64,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

const SEARCH_SKIP_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "eot", "mp3", "mp4", "zip", "gz",
    "exe", "dll", "so", "dylib", "pdf", "wasm", "lock",
];
const MAX_FILE_SIZE: u64 = 512 * 1024;

#[tauri::command]
pub fn search_files(
    state: State<'_, WorkspaceState>,
    _root: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    // La contenciÃ³n es del BACKEND: el root del frontend se ignora (S1)
    let workspace = backend_workspace(&state)?;
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(vec![]);
    }
    let limit = max_results.unwrap_or(80).min(200);
    let mut hits = Vec::new();
    search_dir(&workspace, &query, limit, &mut hits)
        .map_err(|e| format!("Error buscando en '{}': {e}", workspace.display()))?;
    Ok(hits)
}

fn search_dir(dir: &Path, query: &str, limit: usize, hits: &mut Vec<SearchHit>) -> std::io::Result<()> {
    if hits.len() >= limit {
        return Ok(());
    }
    let entries = fs::read_dir(dir)?;
    let mut items: Vec<(bool, String, PathBuf)> = entries
        .filter_map(|e| e.ok())
        .map(|e| {
            (
                e.file_type().map(|t| t.is_dir()).unwrap_or(false),
                e.file_name().to_string_lossy().to_string(),
                e.path(),
            )
        })
        .collect();
    items.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase()))
    });

    for (is_dir, name, path) in items {
        if is_dir {
            if IGNORED_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                continue;
            }
            search_dir(path.as_path(), query, limit, hits)?;
        } else {
            if hits.len() >= limit {
                return Ok(());
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if SEARCH_SKIP_EXT.contains(&ext.as_str()) {
                continue;
            }
            if path.metadata().map(|m| m.len() > MAX_FILE_SIZE).unwrap_or(true) {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(query) {
                    hits.push(SearchHit {
                        path: path.to_string_lossy().to_string(),
                        line_number: (i + 1) as u64,
                        text: line.trim().chars().take(200).collect(),
                    });
                    if hits.len() >= limit {
                        return Ok(());
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn execute_command(
    state: State<'_, WorkspaceState>,
    command: String,
    cwd: String,
    timeout: Option<u64>,
) -> Result<CommandOutput, String> {
    if command.trim().is_empty() {
        return Err("Comando vacÃ­o".to_string());
    }
    // El comando SIEMPRE corre dentro del workspace del backend: un cwd
    // vacÃ­o usa la raÃ­z, y un cwd explÃ­cito debe estar contenido (S2)
    let workspace = backend_workspace(&state)?;
    let cwd_path = if cwd.trim().is_empty() {
        workspace
    } else {
        ensure_in_workspace(&workspace, Path::new(&cwd))?
    };
    // M1 (v0.3.1): 120 s por defecto; el agente puede subirlo hasta 600 s
    let timeout_secs = timeout.unwrap_or(120).clamp(1, 600);
    run_command_with_timeout(&command, &cwd_path, Duration::from_secs(timeout_secs)).await
}

async fn run_command_with_timeout(
    command: &str,
    cwd_path: &Path,
    timeout: Duration,
) -> Result<CommandOutput, String> {
    use std::process::Stdio;
    use tokio::io::AsyncReadExt;

    #[cfg(target_os = "windows")]
    let mut cmd = {
        // PowerShell: mejor manejo de rutas con espacios y sintaxis mÃ¡s rica.
        // Forzamos salida UTF-8 para que los acentos no lleguen con mojibake.
        // El `exit` final preserva el cÃ³digo real: sin Ã©l, powershell.exe
        // colapsaba los cÃ³digos nativos (p. ej. `cmd /c exit 5`) a 0/1.
        let mut c = tokio::process::Command::new("powershell.exe");
        c.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!(
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {}; if ($LASTEXITCODE -is [int]) {{ exit $LASTEXITCODE }} elseif ($?) {{ exit 0 }} else {{ exit 1 }}",
                command
            ),
        ]);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = tokio::process::Command::new("sh");
        c.args(["-c", command]);
        c
    };

    cmd.current_dir(cwd_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Backstop: si el futuro se abandona (cancelaciÃ³n), el hijo muere
        .kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar el comando: {e}"))?;
    let pid = child.id();
    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "No se pudo capturar stdout".to_string())?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "No se pudo capturar stderr".to_string())?;

    // M1: lectura INCREMENTAL con decoder UTF-8 y tope de chars — se sigue
    // drenando el pipe (para que el hijo no se bloquee) aunque ya no se
    // guarde mÃ¡s salida, en vez de bufferear todo y truncar al final
    async fn drain_pipe<R: tokio::io::AsyncRead + Unpin>(
        pipe: &mut R,
        decoder: &mut crate::pty::Utf8Decoder,
        cap: usize,
    ) -> String {
        let mut out = String::new();
        let mut buf = [0u8; 4096];
        loop {
            match pipe.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if out.chars().count() < cap {
                        out.push_str(&decoder.feed(&buf[..n]));
                    }
                }
                Err(_) => break,
            }
        }
        out.push_str(&decoder.flush());
        out
    }

    let mut out_dec = crate::pty::Utf8Decoder::new();
    let mut err_dec = crate::pty::Utf8Decoder::new();
    let wait_all = async {
        let (out, err, status) = tokio::join!(
            drain_pipe(&mut stdout_pipe, &mut out_dec, 8000),
            drain_pipe(&mut stderr_pipe, &mut err_dec, 4000),
            child.wait(),
        );
        (out, err, status)
    };

    match tokio::time::timeout(timeout, wait_all).await {
        Ok((out, err, Ok(status))) => Ok(CommandOutput {
            exit_code: status.code().unwrap_or(-1),
            stdout: out.chars().take(8000).collect(),
            stderr: err.chars().take(4000).collect(),
        }),
        Ok((_, _, Err(e))) => Err(format!("Error esperando el comando: {e}")),
        Err(_) => {
            kill_process_tree(pid);
            Err(format!(
                "El comando excediÃ³ el timeout de {} s y fue TERMINADO (sube el parÃ¡metro 'timeout' hasta 600 si necesita mÃ¡s tiempo)",
                timeout.as_secs()
            ))
        }
    }
}

/// Mata el proceso (y su Ã¡rbol en Windows) tras un timeout (M1)
fn kill_process_tree(pid: Option<u32>) {
    let Some(pid) = pid else { return };
    #[cfg(target_os = "windows")]
    {
        // /T mata el ÃRBOL completo (hijos de la shell incluidos)
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Best-effort: hijo directo (sin libc, sin killpg)
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
    }
}

// --- IntegraciÃ³n Git (Fase 4.3) ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    /// "M" | "A" | "D" | "R" | "U" (untracked)
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub line_number: u64,
    /// "added" | "modified"
    pub kind: String,
}

fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        // B6 (v0.3.1): rutas con no-ASCII SIN C-quoting — con el default
        // quotepath=true, "José/año.md" llegaba escapado y stage/diff/delete
        // fallaban con "pathspec did not match"
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|e| format!("No se pudo ejecutar git (Â¿estÃ¡ instalado?): {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git fallÃ³".to_string()
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn git_status(root: String) -> Result<Vec<GitFileStatus>, String> {
    let text = run_git(&root, &["status", "--porcelain"])?;

    let mut files = Vec::new();
    for line in text.lines() {
        if line.len() < 4 {
            continue;
        }
        let x = line.chars().next().unwrap_or(' ');
        let y = line.chars().nth(1).unwrap_or(' ');
        let raw_path = &line[3..];
        // Renames: "R  viejo -> nuevo" â€” mostramos la ruta nueva
        let path = match raw_path.find(" -> ") {
            Some(pos) => raw_path[pos + 4..].to_string(),
            None => raw_path.to_string(),
        };
        if x == '?' {
            files.push(GitFileStatus { path, status: "U".into(), staged: false });
            continue;
        }
        if x != ' ' {
            files.push(GitFileStatus { path: path.clone(), status: x.to_string(), staged: true });
        }
        if y != ' ' {
            files.push(GitFileStatus { path, status: y.to_string(), staged: false });
        }
    }
    Ok(files)
}

#[tauri::command]
pub fn git_diff_lines(root: String, path: String) -> Result<Vec<DiffLine>, String> {
    let text = run_git(&root, &["diff", "HEAD", "-U0", "--", &path])?;

    struct Hunk {
        new_start: u64,
        removed: u64,
        added: u64,
    }
    let mut hunks: Vec<Hunk> = Vec::new();
    let mut current: Option<Hunk> = None;
    for line in text.lines() {
        if line.starts_with("@@") {
            if let Some(hunk) = current.take() {
                hunks.push(hunk);
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            let new_range = parts
                .get(2)
                .copied()
                .unwrap_or("")
                .trim_end_matches("@@")
                .trim_start_matches('+');
            let new_start: u64 = new_range
                .split(',')
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(1);
            current = Some(Hunk { new_start, removed: 0, added: 0 });
        } else if let Some(hunk) = current.as_mut() {
            if line.starts_with('+') && !line.starts_with("+++") {
                hunk.added += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                hunk.removed += 1;
            }
        }
    }
    if let Some(hunk) = current.take() {
        hunks.push(hunk);
    }

    let mut out = Vec::new();
    for hunk in hunks {
        let modified_count = hunk.removed.min(hunk.added);
        let pure_added = hunk.added.saturating_sub(modified_count);
        let mut line_number = hunk.new_start;
        for _ in 0..modified_count {
            out.push(DiffLine { line_number, kind: "modified".into() });
            line_number += 1;
        }
        for _ in 0..pure_added {
            out.push(DiffLine { line_number, kind: "added".into() });
            line_number += 1;
        }
    }
    Ok(out)
}

// --- Acciones de Git (Fase 4.4) ---

#[tauri::command]
pub fn git_stage(root: String, path: String) -> Result<(), String> {
    run_git(&root, &["add", "--", &path]).map(|_| ())
}

#[tauri::command]
pub fn git_unstage(root: String, path: String) -> Result<(), String> {
    run_git(&root, &["reset", "HEAD", "--", &path]).map(|_| ())
}

#[tauri::command]
pub fn git_commit(root: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("El mensaje de commit estÃ¡ vacÃ­o".to_string());
    }
    run_git(&root, &["commit", "-m", &message])
}

#[tauri::command]
pub fn git_push(root: String) -> Result<String, String> {
    run_git(&root, &["push"])
}

#[tauri::command]
pub fn git_pull(root: String) -> Result<String, String> {
    run_git(&root, &["pull"])
}

// --- Utilidades del shell (menÃº Archivo, Fase 5 UI) ---

#[tauri::command]
pub fn delete_file(state: State<'_, WorkspaceState>, _root: String, path: String) -> Result<(), String> {
    // Seguridad: solo se puede eliminar contenido estrictamente DENTRO del
    // workspace del BACKEND (el root del frontend se ignora â€” un JS
    // comprometido no puede ampliar el alcance). Se canonizan ambas rutas
    // para resistir '..', symlinks y mezclas de separadores; se prohÃ­be
    // borrar la propia raÃ­z.
    let workspace = backend_workspace(&state)?;
    let root_canon = workspace
        .canonicalize()
        .map_err(|e| format!("No se pudo resolver el workspace: {e}"))?;
    let target_canon = ensure_in_workspace(&workspace, Path::new(&path))?;
    if target_canon == root_canon {
        return Err("No se puede eliminar la raÃ­z del workspace activo".to_string());
    }
    if target_canon.is_dir() {
        fs::remove_dir_all(&target_canon)
            .map_err(|e| format!("No se pudo eliminar la carpeta '{path}': {e}"))
    } else {
        fs::remove_file(&target_canon).map_err(|e| format!("No se pudo eliminar '{path}': {e}"))
    }
}

#[tauri::command]
pub async fn pick_open_file(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, mut rx) = tauri::async_runtime::channel::<Option<String>>(1);
    let _ = app
        .dialog()
        .file()
        .add_filter("Todos los archivos", &["*"])
        .pick_file(move |file| {
            let path = file
                .and_then(|f| f.into_path().ok())
                .map(|p| p.to_string_lossy().to_string());
            let _ = tx.blocking_send(path);
        });
    rx.recv()
        .await
        .ok_or_else(|| "El diÃ¡logo se cerrÃ³ sin completar la selecciÃ³n".to_string())
}

#[tauri::command]
pub async fn pick_save_file(
    app: AppHandle,
    default_name: Option<String>,
) -> Result<Option<String>, String> {
    let (tx, mut rx) = tauri::async_runtime::channel::<Option<String>>(1);
    let dialog = app.dialog().file().add_filter("Todos los archivos", &["*"]);
    let dialog = match default_name {
        Some(name) => dialog.set_file_name(&name),
        None => dialog,
    };
    let _ = dialog.save_file(move |file| {
        let path = file
            .and_then(|f| f.into_path().ok())
            .map(|p| p.to_string_lossy().to_string());
            let _ = tx.blocking_send(path);
    });
    rx.recv()
        .await
        .ok_or_else(|| "El diÃ¡logo se cerrÃ³ sin completar la selecciÃ³n".to_string())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Directorio temporal Ãºnico por test (sin dependencias externas)
    fn tmp_dir(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "aether-test-{label}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn cleanup(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn dentro_del_workspace_ok() {
        let root = tmp_dir("inside");
        let sub = root.join("sub");
        fs::create_dir_all(&sub).unwrap();
        let file = sub.join("a.txt");
        fs::write(&file, "hola").unwrap();
        let resolved = ensure_in_workspace(&root, &file).unwrap();
        assert!(resolved.starts_with(root.canonicalize().unwrap()));
        // La propia raÃ­z tambiÃ©n es vÃ¡lida (read_dir del explorer)
        assert!(ensure_in_workspace(&root, &root).is_ok());
        cleanup(&root);
    }

    #[test]
    fn fuera_del_workspace_rechazado() {
        let root = tmp_dir("root-a");
        let other = tmp_dir("root-b");
        let file = other.join("b.txt");
        fs::write(&file, "x").unwrap();
        assert!(ensure_in_workspace(&root, &file).is_err());
        cleanup(&root);
        cleanup(&other);
    }

    #[test]
    fn traversal_con_puntos_rechazado() {
        let root = tmp_dir("trav");
        let other = tmp_dir("trav-out");
        fs::create_dir_all(root.join("sub")).unwrap();
        let sneaky = root
            .join("sub")
            .join("..")
            .join("..")
            .join(other.file_name().unwrap())
            .join("x.txt");
        assert!(ensure_in_workspace(&root, &sneaky).is_err());
        cleanup(&root);
        cleanup(&other);
    }

    #[test]
    fn archivo_nuevo_requiere_padre_existente() {
        let root = tmp_dir("newfile");
        // Escritura de un archivo que aÃºn no existe: el padre existe â†’ Ok
        assert!(ensure_in_workspace(&root, &root.join("nuevo.txt")).is_ok());
        // Padre inexistente â†’ Err
        assert!(ensure_in_workspace(&root, &root.join("no-existe").join("x.txt")).is_err());
        cleanup(&root);
    }

    #[cfg(windows)]
    #[test]
    fn nombre_reservado_rechazado() {
        let root = tmp_dir("reserved");
        assert!(ensure_in_workspace(&root, &root.join("CON")).is_err());
        assert!(ensure_in_workspace(&root, &root.join("nul.txt")).is_err());
        assert!(ensure_in_workspace(&root, &root.join("COM1")).is_err());
        // Uno legÃ­timo para contrastar
        assert!(ensure_in_workspace(&root, &root.join("config.txt")).is_ok());
        cleanup(&root);
    }

    #[cfg(windows)]
    #[test]
    fn ads_stream_alterno_rechazado() {
        let root = tmp_dir("ads");
        assert!(ensure_in_workspace(&root, &root.join("file.txt:stream")).is_err());
        cleanup(&root);
    }

    #[cfg(windows)]
    #[test]
    fn unc_rechazado() {
        let root = tmp_dir("unc");
        let unc = Path::new("\\\\localhost\\c$\\Windows\\notepad.exe");
        assert!(ensure_in_workspace(&root, unc).is_err());
        cleanup(&root);
    }

    #[cfg(windows)]
    #[test]
    fn junction_hacia_fuera_rechazada() {
        let root = tmp_dir("junc");
        let outside = tmp_dir("junc-out");
        let link = root.join("puente");
        // mklink /J (junction) no requiere privilegios de administrador
        let created = Command::new("cmd")
            .args([
                "/C",
                "mklink",
                "/J",
                &link.to_string_lossy(),
                &outside.to_string_lossy(),
            ])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !created {
            // Sin capacidad de crear junctions en este entorno: se omite
            cleanup(&root);
            cleanup(&outside);
            return;
        }
        // Un archivo "dentro" vÃ­a junction resuelve FUERA â†’ rechazado
        let leak = link.join("leak.txt");
        assert!(ensure_in_workspace(&root, &leak).is_err());
        cleanup(&root);
        cleanup(&outside);
    }

    #[cfg(windows)]
    #[test]
    fn prefijo_verbatim_aceptado_dentro() {
        let root = tmp_dir("verbatim");
        let file = root.join("v.txt");
        fs::write(&file, "x").unwrap();
        let verbatim = format!("\\\\?\\{}", file.display());
        assert!(ensure_in_workspace(&root, Path::new(&verbatim)).is_ok());
        cleanup(&root);
    }

    #[tokio::test]
    async fn execute_command_timeout_mata_el_proceso() {
        // M1: un comando que duerme más que el límite muere con error claro
        let root = tmp_dir("timeout");
        let cmd = if cfg!(windows) {
            "Start-Sleep -Seconds 30"
        } else {
            "sleep 30"
        };
        let start = std::time::Instant::now();
        let result = run_command_with_timeout(cmd, &root, Duration::from_millis(800)).await;
        let elapsed = start.elapsed();
        assert!(result.is_err(), "el comando colgante debe devolver Err");
        assert!(
            result.unwrap_err().contains("timeout"),
            "el error debe indicar que fue por timeout"
        );
        assert!(
            elapsed < Duration::from_secs(15),
            "el kill debió ocurrir a los ~0.8s, tardó {elapsed:?}"
        );
        cleanup(&root);
    }

    #[tokio::test]
    async fn execute_command_comando_rapido_funciona() {
        // Contraste: un comando que termina dentro del timeout devuelve salida
        let root = tmp_dir("quick");
        let cmd = if cfg!(windows) {
            "$env:AETHER_TEST = 'ok'; Write-Output $env:AETHER_TEST"
        } else {
            "echo ok"
        };
        let result = run_command_with_timeout(cmd, &root, Duration::from_secs(30))
            .await
            .unwrap();
        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.contains("ok"), "stdout: {}", result.stdout);
        cleanup(&root);
    }

    #[test]
    fn count_lines_con_y_sin_newline_final() {
        let root = tmp_dir("count");
        let file = root.join("c.txt");
        fs::write(&file, "a\nb\nc\n").unwrap();
        assert_eq!(count_lines(&file).unwrap(), 3);
        fs::write(&file, "a\nb\nc").unwrap();
        assert_eq!(count_lines(&file).unwrap(), 3);
        fs::write(&file, "").unwrap();
        assert_eq!(count_lines(&file).unwrap(), 0);
        cleanup(&root);
    }

    #[test]
    fn capture_lines_rango_medio() {
        let root = tmp_dir("capture");
        let file = root.join("cap.txt");
        fs::write(&file, "uno\ndos\ntres\ncuatro\n").unwrap();
        let (content, truncated) = capture_lines(&file, 2, 3).unwrap();
        assert!(!truncated);
        assert_eq!(content, "dos\ntres");
        cleanup(&root);
    }

    #[test]
    fn capture_lines_crlf_se_normaliza() {
        let root = tmp_dir("crlf");
        let file = root.join("crlf.txt");
        fs::write(&file, "uno\r\ndos\r\n").unwrap();
        let (content, _) = capture_lines(&file, 1, 2).unwrap();
        assert_eq!(content, "uno\ndos");
        cleanup(&root);
    }

    #[test]
    fn read_guard_rechaza_archivo_grande() {
        let root = tmp_dir("guard");
        let file = root.join("big.txt");
        // 21 MB > MAX_READ_BYTES (20 MB)
        let big = vec![b'x'; 21 * 1024 * 1024];
        fs::write(&file, &big).unwrap();
        assert!(read_guard(&file, "big.txt", MAX_READ_BYTES).is_err());
        // Uno pequeño pasa
        fs::write(root.join("small.txt"), "x").unwrap();
        assert!(read_guard(&root.join("small.txt"), "small.txt", MAX_READ_BYTES).is_ok());
        cleanup(&root);
    }
}
