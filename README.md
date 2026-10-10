# ✦ Aether IDE

**Editor de código nativo (Windows) con integración profunda de APIs de IA** — construido con Tauri v2 + React + Monaco Editor + Rust.

![Versión](https://img.shields.io/badge/versión-0.1.2-aa3bff) ![Stack](https://img.shields.io/badge/Tauri_v2-React_19-24c8d8) ![Licencia](https://img.shields.io/badge/licencia-MIT-green)

---

## 📦 Descargas (v0.1.2)

Los instaladores se generan con el build de producción y se publican en la [sección de Releases](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases) de este repositorio:

| Artefacto | Archivo | Tamaño |
|---|---|---|
| Instalador NSIS | `Aether IDE_0.1.2_x64-setup.exe` | ~5 MB |
| Instalador MSI (Windows Installer) | `Aether IDE_0.1.2_x64_en-US.msi` | ~6 MB |
| Ejecutable portable | `aether-ide.exe` (en `src-tauri/target/release/`) | ~10 MB |

> **Nota:** la v0.1.2 no tiene binarios firmados — Windows SmartScreen puede mostrar un aviso al ejecutar el instalador (doble clic → "Ejecutar de todas formas").

---

## ✨ Características

- **Editor Monaco completo** — modelos por archivo (cursor/undo preservados por pestaña), syntax highlighting universal, tema oscuro propio, *ghost text* de autocompletado con IA (Tab para aceptar, debounce 350ms).
- **Gateway de IA multi-proveedor** (en Rust, las API keys nunca tocan el frontend): 13 proveedores — OpenAI, Anthropic (Claude), Gemini, DeepSeek, Mistral, xAI (Grok), Groq, NVIDIA NIM, Together, Qwen, MiniMax, **Ollama (local)** y **LM Studio (local)**. Streaming por Channel de Tauri v2, rate-limit retry con backoff exponencial (máx. 5), fetch dinámico de modelos con metadatos (contexto/modalidades), selector de nivel de razonamiento (Low/Medium/High/Max) y bloques de razonamiento colapsables (Chain of Thought).
- **Chat conversacional** con markdown + syntax highlighting, "Insertar en Editor" en bloques de código, menciones `@` (archivos, `@codebase`, `@current`), contexto automático del editor activo, métricas por respuesta (⚡ tiempo · tokens), historial persistente con múltiples sesiones (listar/reanudar/renombrar/eliminar).
- **Modo Agente (Tool-Use)**: bucle agéntico con `read_file`, `search_files`, `list_directory`, `write_file` y `execute_command` (las mutaciones **requieren confirmación del usuario**). Ejecución sobre **PowerShell** con salida UTF-8.
- **Agent Time Travel**: checkpoints/snapshots de archivos antes de cada edición del agente; editar o eliminar un mensaje anterior revierte automáticamente los archivos aplicados desde ese punto.
- **Control de fuentes Git**: panel staged/unstaged con badges M/U/D/A en el Explorer, gutter diff de colores en Monaco, stage/unstage individual o masivo, commit, push y pull.
- **Terminal integrada**: xterm.js + PTY nativo (`portable-pty`/ConPTY) con shell por defecto del sistema (PowerShell en Windows).
- **Command Palette** (Ctrl+Shift+P), atajos globales (Ctrl+B/S/I/W/J), barra de menú **Archivo** (New/Open/Save/Save As/Auto Save/Preferences/Exit), explorador con iconos por lenguaje y scrollbars modernos.
- **Persistencia total**: workspace, pestañas, layout, proveedor/modelo activo, modelos obtenidos, chat activo (mensajes + pasos del agente) y sesiones del historial — todo sobrevive recargas y reinicios.

## 🛠️ Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Zustand + Tailwind v4 + Monaco Editor + xterm.js |
| Backend nativo | Rust (Tauri v2) — gateway IA, PTY, watcher FS, Git, keychain (`keyring`), `notify`, `reqwest`, `portable-pty` |
| Persistencia | JSON en app-data (sesión, chats, historial) + keychain del SO para API keys |

## 🚀 Desarrollo

```powershell
npm install
npm run tauri:dev        # app de escritorio con HMR (requiere Rust toolchain)
npm run dev              # solo frontend en el navegador (sin funciones nativas)
npm run lint             # oxlint
npm run build            # build del frontend (tsc + vite)
```

## 📦 Build de producción

```powershell
npm run tauri:build      # genera .exe, .msi y .exe instalador (NSIS)
npm run verify:release   # verifica los artefactos en src-tauri/target/release/bundle/
```

Requisitos: Node.js 20+, Rust toolchain (1.77+), WebView2 (incluido en Windows 11).

## 📝 Changelog

### v0.1.2

**Añadido**
- Barra de menú Archivo (New File, Open File…, Open Folder…, Save, Save As…, Auto Save, Preferences, Exit) con diálogos nativos.
- Rediseño del Explorer/ActivityBar (iconos por lenguaje, indent guides, indicador lateral de vista activa) y scrollbars modernos.
- Time Travel del agente: checkpoints antes de cada escritura; editar/eliminar mensajes anteriores revierte los archivos afectados.
- Persistencia completa: chat activo (mensajes + pasos del agente) sobrevive recargas/reinicios; historial multi-sesión con pasos del agente incluidos; respaldo localStorage si el disco falla.
- Shell dinámica: PowerShell 7 → Windows PowerShell → cmd (Windows); `$SHELL` → zsh → bash (Unix). `execute_command` sobre PowerShell con salida UTF-8 forzada.
- Robustez IPC: reintentos con espera de inicialización del protocolo (3×500ms) ante recargas de HMR; fallback localStorage del historial.

**Corregido**
- Ciclo watcher Git ↔ git status (se ignoran eventos dentro de `.git/`).
- Recargas de página al guardar/editar workspaces dentro del proyecto (watcher de Vite).
- Orden del explorador (carpetas primero, case-insensitive), mojibake UTF-8 en stdout de PowerShell, formato de tiempo de respuestas (`01.4s` / `01m 20s`), pérdida de título del chat en modo agente.
- 9 hallazgos de auditoría: persistencia de `turnId` (Time Travel funcional tras reanudar), rollback que refresca/cierra pestañas afectadas y cancela auto-guardados pendientes, Auto Save con `untitled-N` (Save As forzado), debounce de auto-guardado por pestaña, `delete_file` con validación de ruta dentro del workspace, checkpoints que distinguen "no existe" de "ilegible" (sin checkpoints huérfanos), limpieza de callbacks de ResizeObserver al desmontar, códigos de salida reales de `execute_command` (`$LASTEXITCODE` propagado).

### v0.1.0
- Lanzamiento inicial: editor Monaco, gateway multi-proveedor, chat, agente con tool-use, Git, terminal PTY, command palette.

## 🗺️ Roadmap

- [ ] Firma de binarios y auto-updater (`tauri-plugin-updater`)
- [ ] CI multi-plataforma (macOS .dmg, Linux .AppImage)
- [ ] Búsqueda global (Ctrl+Shift+F)
- [ ] Indexación semántica del workspace con embeddings

---

*Hecho con ✦ por Pixel Alquimia Studios*
