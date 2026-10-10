<div align="center">

# ✦ Aether IDE

**Editor de código de escritorio con integración y gestión de APIs de IA**

React + TypeScript · Rust (Tauri v2) · Monaco Editor

[![Descargas](https://img.shields.io/badge/⬇_Descargas-v0.1.2-blue)](#-descargas) [![Licencia](https://img.shields.io/badge/Licencia-MIT-green)](LICENSE)

</div>

---

Aether IDE es un editor de código nativo (Windows, estilo VS Code) con un **gateway de IA multi-proveedor** integrado: chat conversacional, modo **agente con herramientas** que edita archivos reales de tu proyecto, autocompletado en línea y edición asistida con diff — todo ejecutándose localmente, con tus API keys guardadas en el **keychain del sistema operativo**.

## ✨ Características

### Editor
- **Monaco Editor** (el motor de VS Code) con modelos por archivo: cursor e historial undo/redo preservados por pestaña
- Detección automática de lenguaje (20+ lenguajes) y tema oscuro propio (`aether-dark`)
- File Explorer con iconos por extensión, badges de estado Git y gutter diff (líneas añadidas/modificadas)
- Barra de menú **Archivo**: New File, Open File/Folder, Save, Save As, **Auto Save**, Preferences, Exit
- Command Palette (`Ctrl+Shift+P`) con búsqueda difusa + quick open de archivos

### IA (gateway multi-proveedor)
- **13 proveedores**: OpenAI, Anthropic (Claude), DeepSeek, Mistral, xAI (Grok), Groq, NVIDIA NIM, Together, Qwen, MiniMax, Google Gemini, Ollama y LM Studio (locales)
- **Chat con streaming** por canal IPC nativo, con selector de **nivel de razonamiento** (Low/Medium/High/Max) para modelos thinking
- **Bloques de razonamiento** colapsables (Chain of Thought de DeepSeek R1, Claude, o-series…)
- **Modo Agente con tool-calling**: `read_file`, `search_files`, `list_directory`, `write_file` y `execute_command` — con **confirmación del usuario** para acciones destructivas y bucle de hasta 20 pasos
- **Agent Time Travel**: checkpoints automáticos antes de cada escritura; editar/eliminar un mensaje anterior **revierte los archivos** aplicados desde ese punto
- **Menciones `@`**: adjunta archivos (`@main.ts`), el archivo actual (`@current`) o la estructura del workspace (`@codebase`) al contexto del LLM
- **Inline completions** (ghost text) aceptables con Tab, con debounce inteligente
- **Edit with prompt** (`Ctrl+I`): diff editor inline sobre la selección con Aceptar/Rechazar
- Métricas por respuesta: `⚡ 1.4s · ~320 tokens`
- API keys en el **keychain del SO** (Credential Manager / Keychain) — nunca en archivos planos; fetch dinámico de modelos con metadatos (contexto, modalidades) y retry con backoff exponencial ante rate limits (429/503)

### Herramientas de desarrollo
- **Integración Git completa**: staged/unstaged, stage/unstage individual y masivo, commit, push/pull
- **Terminal integrada** (`Ctrl+J`): PTY real (ConPTY en Windows) con PowerShell, conectada a `xterm.js`
- Persistencia completa: workspace, pestañas, layout, modelos obtenidos y **sesiones de chat/agentes** sobreviven a recargas y reinicios
- Historial de conversaciones con renombrar/eliminar; los chats del agente se guardan con sus pasos completos

## ⬇ Descargas

> Los instaladores son *self-contained* (no requieren instalación previa de nada) e incluyen toda la app empaquetada localmente.

### v0.1.2 *(actual)*

| Archivo | Tipo | Tamaño |
|---|---|---|
| [aether-ide-0.1.2-x64-portable.exe](downloads/0.1.2/aether-ide-0.1.2-x64-portable.exe) | **Portable** — ejecutable suelto, sin instalación (Windows x64) | 9,86 MB |
| [aether-ide-0.1.2-x64-setup.exe](downloads/0.1.2/aether-ide-0.1.2-x64-setup.exe) | Instalador NSIS (Windows x64) | 4,91 MB |
| [aether-ide-0.1.2-x64.msi](downloads/0.1.2/aether-ide-0.1.2-x64.msi) | Instalador MSI (Windows x64) | 5,73 MB |

### v0.1.0

| Archivo | Tipo | Tamaño |
|---|---|---|
| [aether-ide-0.1.0-x64-setup.exe](downloads/0.1.0/aether-ide-0.1.0-x64-setup.exe) | Instalador NSIS (Windows x64) | 4,89 MB |
| [aether-ide-0.1.0-x64.msi](downloads/0.1.0/aether-ide-0.1.0-x64.msi) | Instalador MSI (Windows x64) | 5,71 MB |

> ℹ️ El ejecutable **portable** de esta versión no está disponible — los portables existen a partir de **v0.1.2**.

## 📋 Changelog

### v0.1.2

**Añadido**
- Barra de menú **Archivo** (New/Open/Save/Save As/Auto Save/Preferences/Exit) con diálogos nativos
- **Agent Time Travel**: checkpoints por escritura + rollback de archivos al editar/eliminar mensajes anteriores
- Acciones de **Git**: stage/unstage (individual y masivo), commit con mensaje, push/pull
- **Terminal integrada**: PTY nativo (ConPTY) + xterm.js, con detección de shell por SO (PowerShell/pwsh → cmd en Windows; zsh/bash en Unix)
- Panel de **Source Control** con estados M/U/D/A coloreados y gutter diff en Monaco
- Menú contextual de **menciones `@`** con filtrado difuso y pills de contexto eliminables
- Métricas por respuesta (tiempo medido en Rust + tokens aproximados) y bloques de razonamiento colapsables
- Persistencia completa de sesiones: chats del agente con sus pasos, chat activo restaurado tras reloads, respaldo localStorage

**Corregido** (auditoría de 9 hallazgos)
- `turnId` persistido en los mensajes guardados → el rollback del Time Travel funciona tras reanudar/recargar
- El rollback de archivos ahora recarga las pestañas afectadas y cierra las de archivos eliminados (Auto Save ya no puede deshacer un rollback)
- Auto Save + pestañas `untitled`: ya no fallan ("Directorio padre inexistente"); Save de un untitled abre Save As
- Debounce de auto-guardado por pestaña (Map en vez de timer global), cancelado al cerrar/guardar
- `delete_file` seguro: canonización de rutas y verificación de que el objetivo esté dentro del workspace
- Checkpoints de escritura: `file_exists` distingue "no existe" de "ilegible" — sin checkpoints huérfanos que borren archivos en el rollback
- `ResizeObserver` (Monaco/xterm) silenciado y cancelado correctamente en unmount
- Códigos de salida reales de `execute_command` en PowerShell (`$LASTEXITCODE` propagado)
- Ciclo del watcher de Git (`.git/` filtrado), reintentos de IPC ante recargas (`invokeWithRetry` 3×500ms), mojibake UTF-8 en stdout de PowerShell y orden carpetas-primero en el Explorer

### v0.1.0

- Lanzamiento inicial: editor Monaco, gateway multi-proveedor (13 proveedores), chat con streaming, command palette, file explorer, temas oscuros

## 🚀 Desarrollo

```bash
npm install          # dependencias del frontend
npm run tauri:dev    # app de escritorio con recarga en vivo
npm run tauri:build  # instaladores .msi / .exe en src-tauri/target/release/bundle
npm run verify:release  # verifica que los artefactos de la versión existan
```

Requisitos: Node.js 18+, Rust (toolchain estable), WebView2 (Windows).

## 🏗 Arquitectura

```
Aether IDE/
├── src/                  # Frontend React + TypeScript
│   ├── components/       # layout, editor, explorer, palette, ai, git, settings, terminal
│   ├── stores/           # Zustand: editor, workspace, ui, settings, chat, agent, git
│   ├── lib/              # IPC (fs, ai, git, chats), monaco setup, agent tools, rollback
│   └── hooks/            # atajos, sesión, eventos del watcher
└── src-tauri/            # Backend Rust
    └── src/
        ├── ai/           # Trait Provider + adaptadores (13 proveedores) + tool-calling
        ├── commands.rs   # FS, watcher (notify), Git, diálogos
        ├── chat_history.rs
        ├── pty.rs        # Terminal integrada (portable-pty / ConPTY)
        └── secrets.rs    # Keychain del SO (keyring)
```

---

<div align="center">

**Pixel Alquimia Studios** — construido con Tauri v2

</div>
