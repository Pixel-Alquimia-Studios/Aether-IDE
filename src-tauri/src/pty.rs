use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use portable_pty::native_pty_system;
use portable_pty::{ChildKiller, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

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

    // CWD seguro: sin workspace, '.' resolvía al directorio del proceso
    // (System32 al lanzar desde el menú Inicio)
    let cwd = resolve_cwd(&cwd);
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
}
