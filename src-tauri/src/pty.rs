use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use portable_pty::native_pty_system;
use portable_pty::{ChildKiller, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

// Terminal integrada (Fase 4.4): PTY nativo con portable-pty (ConPTY en Windows).
// Output → evento Tauri 'terminal-output'; input → comando terminal_write.
//
// v0.3.1 (lote 3): decoder UTF-8 incremental (B5 — un carácter multibyte
// partido entre lecturas ya no produce mojibake), evento 'terminal-exited'
// (M13 — la shell muerta ya no traga teclas), child.kill() real en
// terminal_kill + kill_all_terminals() al cerrar la app (M13 — sin huérfanos).

/// Shell por defecto según el sistema operativo:
/// Windows: PowerShell 7 > Windows PowerShell > cmd.exe
/// macOS: $SHELL > /bin/zsh > /bin/bash
/// Linux: $SHELL > /bin/bash > /bin/sh
fn detect_shell() -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        let pwsh_candidates = [
            r"C:\Program Files\PowerShell\7\pwsh.exe",
            r"C:\Program Files\PowerShell\6\pwsh.exe",
        ];
        for candidate in pwsh_candidates {
            if Path::new(candidate).exists() {
                return CommandBuilder::new(candidate);
            }
        }
        if Path::new(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe").exists() {
            return CommandBuilder::new("powershell.exe");
        }
        CommandBuilder::new("cmd.exe")
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            if !shell.trim().is_empty() {
                return CommandBuilder::new(shell);
            }
        }
        if Path::new("/bin/zsh").exists() {
            return CommandBuilder::new("/bin/zsh");
        }
        CommandBuilder::new("/bin/bash")
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            if !shell.trim().is_empty() {
                return CommandBuilder::new(shell);
            }
        }
        if Path::new("/bin/bash").exists() {
            return CommandBuilder::new("/bin/bash");
        }
        CommandBuilder::new("/bin/sh")
    }
}

/// Decodificador UTF-8 incremental: conserva en la cola los bytes de una
/// secuencia multibyte incompleta entre lecturas. Decodificar cada chunk
/// por separado con from_utf8_lossy partía los caracteres por la mitad
/// (B5: mojibake permanente en cualquier salida larga con acentos/emoji).
/// También lo usa execute_command para drenar los pipes del proceso (M1).
pub(crate) struct Utf8Decoder {
    pending: Vec<u8>,
}

impl Utf8Decoder {
    pub(crate) fn new() -> Self {
        Self { pending: Vec::new() }
    }

    pub(crate) fn feed(&mut self, chunk: &[u8]) -> String {
        self.pending.extend_from_slice(chunk);
        let valid = match std::str::from_utf8(&self.pending) {
            Ok(_) => self.pending.len(),
            Err(e) => e.valid_up_to(),
        };
        let out = String::from_utf8_lossy(&self.pending[..valid]).to_string();
        self.pending.drain(..valid);
        // ¿Quedó una secuencia INVÁLIDA (no incompleta)? Descártala para no
        // atascar el decoder; una incompleta (error_len None) se conserva
        if let Err(e) = std::str::from_utf8(&self.pending) {
            if let Some(bad) = e.error_len() {
                self.pending.drain(..bad);
            }
        }
        out
    }

    /// Flush final (EOF): decodifica lo que quede, sustituyendo secuencias
    /// incompletas por U+FFFD
    pub(crate) fn flush(&mut self) -> String {
        let out = String::from_utf8_lossy(&self.pending).to_string();
        self.pending.clear();
        out
    }
}

// ============ Shells disponibles (Lote B, v0.4.0) ============

/// Shell detectado en el equipo, expuesto al frontend SOLO como id+label —
/// las rutas y argumentos jamás viajan al frontend (seguridad del Lote B)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub id: String,
    pub label: String,
}

/// Candidato interno: exe + args fijos para construir el CommandBuilder
#[derive(Debug, Clone)]
struct ShellCandidate {
    id: String,
    label: String,
    exe: PathBuf,
    args: Vec<String>,
    /// WSL: el cwd del workspace viaja como argumento --cd (no como cwd del proceso)
    wsl_distro: Option<String>,
}

impl ShellCandidate {
    fn info(&self) -> ShellInfo {
        ShellInfo {
            id: self.id.clone(),
            label: self.label.clone(),
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_shell_candidates() -> Vec<ShellCandidate> {
    let mut out = Vec::new();
    // pwsh (PowerShell 7/6)
    for (ver, path) in [
        ("7", r"C:\Program Files\PowerShell\7\pwsh.exe"),
        ("6", r"C:\Program Files\PowerShell\6\pwsh.exe"),
    ] {
        if Path::new(path).exists() {
            out.push(ShellCandidate {
                id: "pwsh".into(),
                label: format!("PowerShell {ver} (pwsh)"),
                exe: PathBuf::from(path),
                args: vec![],
                wsl_distro: None,
            });
            break;
        }
    }
    // Windows PowerShell (siempre presente en Windows)
    let ps = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    if Path::new(ps).exists() {
        out.push(ShellCandidate {
            id: "powershell".into(),
            label: "PowerShell".into(),
            exe: PathBuf::from(ps),
            args: vec![],
            wsl_distro: None,
        });
    }
    // cmd
    let cmd = r"C:\Windows\System32\cmd.exe";
    if Path::new(cmd).exists() {
        out.push(ShellCandidate {
            id: "cmd".into(),
            label: "cmd".into(),
            exe: PathBuf::from(cmd),
            args: vec![],
            wsl_distro: None,
        });
    }
    // Git Bash: x64, x86 y por-usuario (LOCALAPPDATA)
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let git_bash = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
        r"Git\usr\bin\bash.exe",
        r"Git\bin\bash.exe",
    ];
    let mut git_found = None;
    for base in [r"C:\Program Files".to_string(), r"C:\Program Files (x86)".to_string(), local] {
        if base.is_empty() {
            continue;
        }
        for rel in &git_bash {
            let p = PathBuf::from(&base).join(rel);
            if p.exists() {
                git_found = Some(p);
                break;
            }
        }
        if git_found.is_some() {
            break;
        }
    }
    if let Some(exe) = git_found {
        out.push(ShellCandidate {
            id: "gitbash".into(),
            label: "Git Bash".into(),
            exe,
            // --login -i: necesario para que bash lea perfil y funcione bien en ConPTY
            args: vec!["--login".into(), "-i".into()],
            wsl_distro: None,
        });
    }
    // WSL: una entrada por distro instalada (wsl -l -q, con timeout)
    for distro in wsl_distros() {
        out.push(ShellCandidate {
            id: format!("wsl:{distro}"),
            label: format!("WSL: {distro}"),
            exe: PathBuf::from("wsl.exe"),
            args: vec![],
            wsl_distro: Some(distro),
        });
    }
    out
}

#[cfg(not(target_os = "windows"))]
fn unix_shell_candidates() -> Vec<ShellCandidate> {
    let mut out = Vec::new();
    let mut push = |id: &str, path: &str| {
        if Path::new(path).exists() && !out.iter().any(|c: &ShellCandidate| c.id == id) {
            out.push(ShellCandidate {
                id: id.into(),
                label: id.into(),
                exe: PathBuf::from(path),
                args: vec![],
                wsl_distro: None,
            });
        }
    };
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.trim().is_empty() {
            let id = Path::new(shell.trim())
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| shell.trim().to_string());
            push(&id, shell.trim());
        }
    }
    push("zsh", "/bin/zsh");
    push("zsh", "/usr/bin/zsh");
    push("bash", "/bin/bash");
    push("bash", "/usr/bin/bash");
    push("fish", "/usr/bin/fish");
    push("fish", "/bin/fish");
    out
}

#[allow(dead_code)]
fn detect_shell_candidates() -> Vec<ShellCandidate> {
    #[cfg(target_os = "windows")]
    {
        windows_shell_candidates()
    }
    #[cfg(not(target_os = "windows"))]
    {
        unix_shell_candidates()
    }
}

/// Cache de sesión: list_shells se pide al abrir el menú + (no al arrancar) y
/// el resultado se reutiliza para validar los shell_id de terminal_spawn
static SHELLS_CACHE: Mutex<Option<Vec<ShellCandidate>>> = Mutex::new(None);

fn shell_candidates() -> Vec<ShellCandidate> {
    if let Ok(guard) = SHELLS_CACHE.lock() {
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
    }
    let candidates = detect_shell_candidates();
    if let Ok(mut guard) = SHELLS_CACHE.lock() {
        *guard = Some(candidates.clone());
    }
    candidates
}

pub fn available_shells() -> Vec<ShellInfo> {
    shell_candidates().iter().map(|c| c.info()).collect()
}

/// Parseo de `wsl -l -q`: salida en UTF-16LE con BOM posible y finales CRLF
fn parse_wsl_distros(raw: &[u8]) -> Vec<String> {
    let bytes = if raw.starts_with(&[0xFF, 0xFE]) { &raw[2..] } else { raw };
    let mut units = Vec::with_capacity(bytes.len() / 2);
    for pair in bytes.chunks(2) {
        if pair.len() == 2 {
            units.push(u16::from_le_bytes([pair[0], pair[1]]));
        }
    }
    let text = String::from_utf16_lossy(&units);
    text.split(['\r', '\n'])
        .map(|l| l.trim().trim_matches('\0').trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

/// WSL: `wsl -l -q` con timeout de 3 s (en hilo aparte) — si falla o tarda,
/// se omite sin romper el resto de la lista
fn wsl_distros() -> Vec<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let out = Command::new("wsl.exe").args(["-l", "-q"]).output();
        let _ = tx.send(out);
    });
    let Ok(Ok(output)) = rx.recv_timeout(Duration::from_secs(3)) else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    parse_wsl_distros(&output.stdout)
}

/// Resuelve un shell_id contra la lista DETECTADA (seguridad: el frontend
/// solo manda ids; rutas y comandos jamás). None → shell por defecto (auto).
fn shell_command_for(
    shell_id: Option<&str>,
    cwd: &Path,
) -> Result<CommandBuilder, String> {
    let Some(id) = shell_id else {
        let mut cmd = detect_shell();
        cmd.cwd(cwd);
        return Ok(cmd);
    };
    let candidates = shell_candidates();
    let Some(candidate) = candidates.iter().find(|c| c.id == id) else {
        let ids: Vec<&str> = candidates.iter().map(|c| c.id.as_str()).collect();
        return Err(format!(
            "Shell '{id}' no está disponible en este equipo. Shells detectados: {}",
            if ids.is_empty() { "ninguno".into() } else { ids.join(", ") }
        ));
    };
    let mut cmd = CommandBuilder::new(&candidate.exe);
    for arg in &candidate.args {
        cmd.arg(arg);
    }
    match &candidate.wsl_distro {
        // WSL: el cwd del workspace viaja como --cd (ruta de Windows traducida
        // por WSL); el cwd del PROCESO queda en home para no confundir a wsl.exe
        Some(distro) => {
            cmd.arg("--cd");
            cmd.arg(cwd.to_string_lossy().to_string());
            cmd.arg("-d");
            cmd.arg(distro);
        }
        None => {
            cmd.cwd(cwd);
        }
    }
    Ok(cmd)
}

/// Lista los shells DETECTADOS en el equipo (Lote B). No corre al arrancar:
/// el frontend lo pide al abrir el menú +; async + spawn_blocking fuera del
/// hilo principal; el resultado se cachea por sesión en pty.rs
#[tauri::command]
pub async fn list_shells() -> Result<Vec<ShellInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(available_shells()))
        .await
        .map_err(|e| format!("No se pudo detectar las shells: {e}"))?
}

struct PtySession {
    writer: Box<dyn Write + Send>,
    _master: Box<dyn portable_pty::MasterPty + Send>,
    /// Killer del proceso hijo (M13): terminal_kill cierra la sesión Y mata
    /// la shell — soltar el master/child no garantiza terminar los procesos
    killer: Box<dyn ChildKiller + Send + Sync>,
}

static SESSIONS: Mutex<Option<HashMap<String, PtySession>>> = Mutex::new(None);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub terminal_id: String,
    pub data: String,
}

#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<'_, crate::commands::WorkspaceState>,
    shell_id: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("No se pudo abrir el PTY: {e}"))?;

    // CWD del ESTADO DE RUST (workspace), nunca del frontend (Lote B, req. 7);
    // sin workspace → home del usuario (nunca System32). No es un error:
    // Ctrl+J debe funcionar incluso sin carpeta abierta
    let backend_root = crate::commands::backend_workspace(&state).unwrap_or_default();
    let cwd = resolve_cwd(&backend_root.to_string_lossy());

    // shell_id validado contra la lista DETECTADA; None → shell por defecto.
    // Ids desconocidos se rechazan con error claro (seguridad Lote B)
    let shell = shell_command_for(shell_id.as_deref(), &cwd)?;
    let child = pair
        .slave
        .spawn_command(shell)
        .map_err(|e| format!("No se pudo iniciar la shell: {e}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("No se pudo leer el PTY: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("No se pudo escribir al PTY: {e}"))?;
    let killer = child.clone_killer();

    let terminal_id = format!("term-{}", NEXT_ID.fetch_add(1, Ordering::SeqCst));

    {
        let mut guard = SESSIONS
            .lock()
            .map_err(|_| "El lock de la terminal está envenenado".to_string())?;
        guard.get_or_insert_with(HashMap::new).insert(
            terminal_id.clone(),
            PtySession {
                writer,
                _master: pair.master,
                killer,
            },
        );
    }

    // Thread lector: reenvía el output de la shell al frontend
    let app_handle = app.clone();
    let tid = terminal_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut decoder = Utf8Decoder::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = decoder.feed(&buf[..n]);
                    if data.is_empty() {
                        continue;
                    }
                    let _ = app_handle.emit(
                        "terminal-output",
                        TerminalOutput {
                            terminal_id: tid.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let tail = decoder.flush();
        if !tail.is_empty() {
            let _ = app_handle.emit(
                "terminal-output",
                TerminalOutput {
                    terminal_id: tid.clone(),
                    data: tail,
                },
            );
        }
        // La shell terminó: avisa al frontend (M13 — la terminal muerta ya no
        // traga teclas) y limpia la sesión
        let _ = app_handle.emit("terminal-exited", tid.clone());
        let Ok(mut guard) = SESSIONS.lock() else { return };
        if let Some(ref mut sessions) = *guard {
            sessions.remove(&tid);
        }
        // Reap del hijo (evita zombies en Unix)
        let mut child = child;
        let _ = child.wait();
    });

    Ok(terminal_id)
}

/// Resuelve el CWD de la terminal: vacío o '.' → home del usuario
fn resolve_cwd(cwd: &str) -> PathBuf {
    let trimmed = cwd.trim();
    if !trimmed.is_empty() && trimmed != "." {
        return PathBuf::from(trimmed);
    }
    #[cfg(windows)]
    {
        if let Ok(home) = std::env::var("USERPROFILE") {
            if !home.trim().is_empty() {
                return PathBuf::from(home);
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            if !home.trim().is_empty() {
                return PathBuf::from(home);
            }
        }
    }
    std::env::temp_dir()
}

#[tauri::command]
pub fn terminal_write(terminal_id: String, data: String) -> Result<(), String> {
    let mut guard = SESSIONS
        .lock()
        .map_err(|_| "El lock de la terminal está envenenado".to_string())?;
    let session = if let Some(ref mut sessions) = *guard {
        sessions
            .get_mut(&terminal_id)
            .ok_or_else(|| "Terminal no encontrada".to_string())?
    } else {
        return Err("Terminal no encontrada".to_string());
    };
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Error escribiendo a la terminal: {e}"))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Error escribiendo a la terminal: {e}"))
}

#[tauri::command]
pub fn terminal_resize(terminal_id: String, rows: u16, cols: u16) -> Result<(), String> {
    let guard = SESSIONS
        .lock()
        .map_err(|_| "El lock de la terminal está envenenado".to_string())?;
    let session = if let Some(ref sessions) = *guard {
        sessions
            .get(&terminal_id)
            .ok_or_else(|| "Terminal no encontrada".to_string())?
    } else {
        return Err("Terminal no encontrada".to_string());
    };
    session
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Error redimensionando la terminal: {e}"))
}

#[tauri::command]
pub fn terminal_kill(terminal_id: String) -> Result<(), String> {
    let mut guard = SESSIONS
        .lock()
        .map_err(|_| "El lock de la terminal está envenenado".to_string())?;
    if let Some(ref mut sessions) = *guard {
        // M13: mata la shell EXPLÍCITAMENTE antes de soltar la sesión —
        // dropear master/child no garantiza terminar los procesos
        if let Some(mut session) = sessions.remove(&terminal_id) {
            let _ = session.killer.kill();
        }
    }
    Ok(())
}

/// Mata TODAS las sesiones de terminal (al cerrar la app): sin hijos huérfanos
pub fn kill_all_terminals() {
    let Ok(mut guard) = SESSIONS.lock() else { return };
    if let Some(ref mut sessions) = *guard {
        for (_, mut session) in sessions.drain() {
            let _ = session.killer.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_caracter_completo_en_un_chunk() {
        let mut dec = Utf8Decoder::new();
        assert_eq!(dec.feed("hola á emoji 🎉".as_bytes()), "hola á emoji 🎉");
        assert_eq!(dec.flush(), "");
    }

    #[test]
    fn utf8_multibyte_partido_entre_chunks() {
        // 'á' = [0xC3, 0xA1] partido por la mitad: el decoder retiene 0xC3
        // hasta que llegue 0xA1 (B5: sin mojibake)
        let mut dec = Utf8Decoder::new();
        assert_eq!(dec.feed(&[0x61, 0x20, 0xC3]), "a ");
        assert_eq!(dec.feed(&[0xA1, 0x20]), "á ");
        assert_eq!(dec.flush(), "");
    }

    #[test]
    fn utf8_emoji_cuatro_bytes_partido() {
        // '🎉' = [0xF0, 0x9F, 0x8E, 0x89] repartido en 3 chunks
        let mut dec = Utf8Decoder::new();
        assert_eq!(dec.feed(&[0xF0, 0x9F]), "");
        assert_eq!(dec.feed(&[0x8E]), "");
        assert_eq!(dec.feed(&[0x89, 0x21]), "🎉!");
        assert_eq!(dec.flush(), "");
    }

    #[test]
    fn utf8_bytes_invalidos_no_atascan_el_decoder() {
        let mut dec = Utf8Decoder::new();
        // 0xFF es inválido: se descarta y el flujo continúa
        assert_eq!(dec.feed(&[0xFF]), "");
        assert_eq!(dec.feed("ok".as_bytes()), "ok");
        assert_eq!(dec.flush(), "");
    }

    #[test]
    fn utf8_flush_con_cola_incompleta() {
        let mut dec = Utf8Decoder::new();
        assert_eq!(dec.feed(&[0x61, 0xC3]), "a");
        // EOF con secuencia incompleta: se emite como U+FFFD sin colgar
        assert_eq!(dec.flush().chars().count(), 1);
    }

    // ---- Lote B (v0.4.0): shells y validación ----

    #[test]
    fn parse_wsl_utf16le_con_bom_y_crlf() {
        // "Ubuntu-22.04\r\nDebian\r\n" en UTF-16LE con BOM FF FE
        let mut raw: Vec<u8> = vec![0xFF, 0xFE];
        for ch in "Ubuntu-22.04\r\nDebian\r\n".chars() {
            raw.extend_from_slice(&(ch as u16).to_le_bytes());
        }
        let distros = parse_wsl_distros(&raw);
        assert_eq!(distros, vec!["Ubuntu-22.04".to_string(), "Debian".to_string()]);
    }

    #[test]
    fn parse_wsl_utf16_con_nulos_embedidos() {
        // WSL a veces rellena con \0 tras cada línea
        let mut raw: Vec<u8> = vec![0xFF, 0xFE];
        for ch in "Ubuntu\0\r\n\0".chars() {
            raw.extend_from_slice(&(ch as u16).to_le_bytes());
        }
        let distros = parse_wsl_distros(&raw);
        assert_eq!(distros, vec!["Ubuntu".to_string()]);
    }

    #[test]
    fn parse_wsl_vacio_o_basura_no_paniquea() {
        assert!(parse_wsl_distros(&[]).is_empty());
        assert!(parse_wsl_distros(&[0x00]).is_empty()); // byte suelto (chunks impares)
        let bad = vec![0xFF, 0xFE, 0xD8, 0x00, 0x00, 0x00]; // surrogate alto suelto
        assert!(parse_wsl_distros(&bad).len() <= 1);
    }

    #[test]
    fn shell_command_for_none_usa_el_default() {
        // Sin shell_id: shell por defecto con el cwd del workspace
        let cmd = shell_command_for(None, Path::new("C:\\proyecto"));
        assert!(cmd.is_ok());
    }

    #[test]
    fn shell_command_for_id_desconocido_rechazado() {
        let err = shell_command_for(Some("inventada-999"), Path::new("C:\\proyecto")).unwrap_err();
        assert!(err.contains("inventada-999"), "el error nombra el id: {err}");
        assert!(err.contains("Shells detectados"), "lista los disponibles: {err}");
    }

    #[test]
    fn shell_command_for_id_detectado_ok() {
        // Un id del PROPIO equipo pasa la validación (en CI/Windows: powershell o cmd)
        let shells = available_shells();
        if shells.is_empty() {
            return; // entorno sin shells detectables: nada que afirmar
        }
        let id = shells[0].id.clone();
        assert!(shell_command_for(Some(&id), Path::new(".")).is_ok());
    }

    #[test]
    fn shells_detectados_ids_unicos_y_con_label() {
        let shells = available_shells();
        let mut ids: Vec<&str> = shells.iter().map(|s| s.id.as_str()).collect();
        ids.sort();
        let antes = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), antes, "ids duplicados: {shells:?}");
        assert!(shells.iter().all(|s| !s.label.is_empty()));
    }
}
