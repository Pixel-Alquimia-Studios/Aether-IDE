use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use portable_pty::native_pty_system;
use portable_pty::{CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

// Terminal integrada (Fase 4.4): PTY nativo con portable-pty (ConPTY en Windows).
// Output → evento Tauri 'terminal-output'; input → comando terminal_write.

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

struct PtySession {
    writer: Box<dyn Write + Send>,
    _master: Box<dyn portable_pty::MasterPty + Send>,
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
    cwd: String,
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

    let mut shell = detect_shell();

    shell.cwd(&cwd);
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

    let terminal_id = format!("term-{}", NEXT_ID.fetch_add(1, Ordering::SeqCst));

    // Thread lector: reenvía el output de la shell al frontend
    let app_handle = app.clone();
    let tid = terminal_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
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
        // La shell terminó: limpia la sesión
        let Ok(mut guard) = SESSIONS.lock() else { return };
        if let Some(ref mut sessions) = *guard {
            sessions.remove(&tid);
        }
        drop(child);
    });

    {
        let mut guard = SESSIONS
            .lock()
            .map_err(|_| "El lock de la terminal está envenenado".to_string())?;
        guard
            .get_or_insert_with(HashMap::new)
            .insert(terminal_id.clone(), PtySession {
                writer,
                _master: pair.master,
            });
    }
    Ok(terminal_id)
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
        sessions.remove(&terminal_id);
    }
    Ok(())
}
