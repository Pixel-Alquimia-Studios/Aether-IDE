# Contexto del Proyecto — Aether IDE

> Este documento describe qué es el proyecto, su arquitectura, estructura y funcionamiento. Sirve como referencia rápida para humanos y agentes de IA que trabajen sobre el código.

---

## 1. ¿Qué es?

**Aether IDE** es un editor de código de escritorio (estilo VS Code, orientado a Windows) con un **gateway de IA multi-proveedor** integrado. Permite programar con asistencia de IA: chat conversacional, modo agente que edita archivos reales del proyecto, autocompletado en línea (ghost text) y edición asistida con diff. Todo corre **localmente**, y las API keys se guardan en el **keychain del sistema operativo** (Credential Manager / Keychain), nunca en archivos planos.

- **Autor:** MBX — Pixel Alquimia Studios
- **Versión actual:** 0.1.4
- **Licencia:** Apache 2.0

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript (strict) |
| Estado | Zustand (con Immer) |
| Build | Vite 8 |
| Editor de código | Monaco Editor (motor de VS Code) via `@monaco-editor/react` |
| Terminal | xterm.js + PTY nativo (ConPTY en Windows) |
| Estilos | Tailwind CSS 4 |
| Markdown (chat) | react-markdown + rehype/remark (GFM, highlight, sanitize) |
| Backend | **Rust** con **Tauri v2** |
| HTTP (backend) | reqwest (streaming, JSON) |
| Terminal nativa | portable-pty |
| Watcher de archivos | notify |
| Secretos | keyring (keychain del SO) |
| Persistencia de chats | SQLite (sqlx) |
| Empaquetado | NSIS / MSI / portable (.exe) |
| Lint | oxlint |
| Tests | Vitest (carpeta `Aether-tests/`) |

---

## 3. Estructura del proyecto

```
Aether IDE/
├── src/                    # Frontend React + TypeScript
│   ├── App.tsx             # Composición principal de la UI
│   ├── components/
│   │   ├── ai/             # Panel de chat/agente, streaming, menciones @
│   │   ├── editor/         # Monaco, pestañas, diff inline
│   │   ├── explorer/       # File explorer con iconos y badges de Git
│   │   ├── extensions/     # Marketplace de extensiones (Open VSX) + Material Icon Theme
│   │   ├── git/            # Panel Source Control
│   │   ├── layout/         # Menú Archivo/Ver, barras, layout general
│   │   ├── palette/        # Command Palette (Ctrl+Shift+P) y quick open
│   │   ├── settings/       # Preferencias y gestión de proveedores/keys
│   │   └── terminal/       # Terminal integrada (xterm.js)
│   ├── stores/             # Estado global Zustand
│   │   ├── editorStore.ts  # Pestañas, modelos Monaco por archivo, undo/redo
│   │   ├── workspaceStore.ts
│   │   ├── chatStore.ts    # Chats de IA
│   │   ├── agentStore.ts   # Modo agente, checkpoints, time travel
│   │   ├── gitStore.ts
│   │   ├── settingsStore.ts
│   │   └── uiStore.ts      # Layout, paneles, tema
│   ├── lib/
│   │   ├── agent/          # tools.ts (tool-calling), rollback.ts (time travel), subagents.ts
│   │   ├── ai/             # Cliente del gateway IPC
│   │   ├── commands/       # Wrappers de invoke() hacia Rust (fs, diálogos...)
│   │   ├── git.ts          # IPC de Git
│   │   ├── monaco/         # Setup de Monaco (tema aether-dark, lenguajes)
│   │   ├── vsx/            # Cliente API Open VSX + caché de iconos
│   │   └── workspace/      # Utilidades del workspace
│   ├── hooks/              # Atajos de teclado, sesión, eventos del watcher
│   ├── types/              # Tipos compartidos
│   └── styles/             # CSS/Tailwind
├── src-tauri/              # Backend Rust (Tauri v2)
│   └── src/
│       ├── lib.rs          # Setup de Tauri, registro de comandos IPC
│       ├── commands.rs     # Sistema de archivos, watcher (notify), Git, diálogos
│       ├── commands_ai.rs  # Comandos de IA (streaming por canal IPC)
│       ├── chat_history.rs # Persistencia de sesiones de chat (SQLite)
│       ├── pty.rs          # Terminal integrada (portable-pty / ConPTY)
│       ├── secrets.rs      # API keys en el keychain del SO (keyring)
│       └── ai/             # Trait `Provider` + adaptadores
│           ├── openai_compatible.rs  # OpenAI, DeepSeek, Mistral, xAI, Groq, NVIDIA, Together, Qwen, MiniMax, LM Studio...
│           ├── anthropic.rs          # Claude
│           ├── gemini.rs             # Google Gemini
│           └── ollama.rs             # Ollama (local)
├── Aether-tests/           # Tests (Vitest)
├── scripts/                # verify-release.ps1 (valida artefactos de release)
├── downloads/              # Instaladores publicados por versión (portable/setup/msi)
└── public/                 # Assets estáticos
```

---

## 4. Funcionalidades

### Editor
- Monaco Editor con **modelo por archivo** (cursor e historial undo/redo preservados por pestaña)
- Detección automática de lenguaje (20+) y tema oscuro propio `aether-dark`
- File Explorer con iconos por extensión, badges de estado Git y gutter diff
- Barra de menú **Archivo**: New/Open/Save/Save As, Auto Save, Preferences, Exit
- Command Palette (`Ctrl+Shift+P`) con búsqueda difusa y quick open

### IA — gateway multi-proveedor (13 proveedores)
OpenAI, Anthropic (Claude), DeepSeek, Mistral, xAI (Grok), Groq, NVIDIA NIM, Together, Qwen, MiniMax, Google Gemini, Ollama y LM Studio (locales).
- **Chat con streaming** por canal IPC nativo, selector de nivel de razonamiento (Low/Medium/High/Max)
- **Bloques de razonamiento** colapsables (chain of thought)
- **Modo Agente con tool-calling**: `read_file`, `search_files`, `list_directory`, `write_file`, `execute_command` — con confirmación del usuario para acciones destructivas y bucle de hasta 20 pasos
- **Agent Time Travel**: checkpoints automáticos antes de cada escritura; editar/eliminar un mensaje anterior revierte los archivos aplicados desde ese punto (`src/lib/agent/rollback.ts`)
- **Menciones `@`**: adjuntar archivos (`@main.ts`), archivo actual (`@current`) o estructura del workspace (`@codebase`)
- **Inline completions** (ghost text con Tab) y **Edit with prompt** (`Ctrl+I`, diff inline con Aceptar/Rechazar)
- Métricas por respuesta (tiempo + tokens aproximados)
- API keys en el keychain del SO; fetch dinámico de modelos con metadatos; retry con backoff exponencial ante 429/503

### Herramientas de desarrollo
- **Git integrado**: staged/unstaged, stage/unstage individual y masivo, commit, push/pull, estados M/U/D/A
- **Terminal integrada** (`Ctrl+J`): PTY real (ConPTY) con PowerShell/pwsh/cmd en Windows, zsh/bash en Unix
- **Marketplace de extensiones** (API de Open VSX): búsqueda, detalle con README sanitizado, Material Icon Theme (descarga y extracción de VSIX con `fflate`)
- **Persistencia completa**: workspace, pestañas, layout, modelos, chats/agentes (SQLite + respaldo localStorage) sobreviven a recargas y reinicios

---

## 5. Arquitectura (cómo funciona)

1. **Frontend (React)** gestiona toda la UI y el estado con stores de Zustand.
2. La UI habla con el backend **exclusivamente vía IPC de Tauri** (`invoke`). Los wrappers están en `src/lib/commands/`.
3. **Backend (Rust)** expone comandos: FS, watcher de archivos, Git, diálogos, PTY, secretos e IA.
4. Las llamadas a proveedores de IA ocurren en Rust (`src-tauri/src/ai/`): un **trait `Provider`** es implementado por adaptadores; la mayoría de proveedores usan la API de OpenAI (`openai_compatible.rs`), con adaptadores dedicados para Anthropic, Gemini y Ollama.
5. El streaming de respuestas llega al frontend por **canales IPC nativos** de Tauri.
6. El **modo agente** vive en el frontend (`src/lib/agent/tools.ts`): ejecuta el bucle de tool-calling (hasta 20 pasos), pide confirmación al usuario para acciones destructivas, y crea checkpoints (`rollback.ts`) antes de escribir archivos para soportar el Time Travel.
7. Los chats/sesiones se persisten en **SQLite** desde Rust (`chat_history.rs`) con respaldo en localStorage.
8. Los secretos nunca tocan el disco: `secrets.rs` usa la crate `keyring` contra el keychain del SO.

---

## 6. Comandos de desarrollo

```bash
npm install             # dependencias del frontend
npm run dev             # solo frontend (Vite)
npm run tauri:dev       # app de escritorio con recarga en vivo
npm run tauri:build     # instaladores .msi / .exe / portable en src-tauri/target/release/bundle
npm run lint            # oxlint
npm run build           # tsc -b && vite build (typecheck + bundle)
npm run verify:release  # valida que los artefactos de la versión existan
```

**Requisitos:** Node.js 18+, toolchain estable de Rust, WebView2 (Windows).

---

## 7. Notas y convenciones

- El build de release usa `opt-level = "z"`, LTO, `codegen-units = 1` y `strip` para minimizar el binario (~5–10 MB).
- La CSP está configurada para permitir solo hosts de confianza (imágenes del marketplace, APIs) — revisarla si se añaden nuevos endpoints.
- Seguridad: `delete_file` canoniza rutas y verifica que el objetivo esté dentro del workspace; las escrituras del agente crean checkpoint previo.
- Historial de releases y changelog detallado en `README.md`; instaladores publicados en `downloads/`.
