<div align="center">

# ✦ Aether IDE

**Editor de código de escritorio con integración y gestión de APIs de IA**

React + TypeScript · Rust (Tauri v2) · Monaco Editor

[![Descargas](https://img.shields.io/badge/⬇_Descargas-v0.2.2-blue)](#-descargas) [![Licencia](https://img.shields.io/badge/Licencia-Apache_2.0-blue.svg)](LICENSE)

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
- **Modo Agente con tool-calling**: `read_file`, `search_files`, `list_directory`, `write_file` y `execute_command` — con **confirmación del usuario** para acciones destructivas
- **Subagentes de análisis de solo lectura**: `/qa` (BugBot 🐛), `/security` (SecBot 🛡) y `/audit` (AuditBot 📋) — reportan hallazgos con badges de severidad (critical/high/medium/low) sin tocar tu código
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
- **Panel Plan / Agente** con timeline unificado: la conversación y los pasos del agente permanecen visibles al alternar de modo
- Los **chats son por carpeta**: cada workspace tiene su propio historial de conversaciones y sesiones de agente

## ⬇ Descargas

> Los instaladores son *self-contained* (no requieren instalación previa de nada) e incluyen toda la app empaquetada localmente.

### v0.2.2 *(actual)*

> 🚀 **A partir de esta versión los releases se publican automáticamente con GitHub Actions** — los instaladores y el archivo `latest.json` del actualizador automático viven en [GitHub Releases](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest).

| Archivo | Tipo |
|---|---|
| [aether-ide-0.2.2-x64-setup.exe](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest) | Instalador NSIS (Windows x64) |
| [aether-ide-0.2.2-x64.msi](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest) | Instalador MSI (Windows x64) |
| [aether-ide-0.2.2-x64-portable.exe](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest) | **Portable** — ejecutable suelto, sin instalación |

> ⬆ Los usuarios de v0.2.1+ recibirán esta actualización automáticamente (botón **⬆ Actualizar** en la esquina superior derecha).

### v0.2.1

| Archivo | Tipo | Tamaño |
|---|---|---|
| [aether-ide-0.2.1-x64-portable.exe](downloads/0.2.1/aether-ide-0.2.1-x64-portable.exe) | **Portable** — ejecutable suelto, sin instalación (Windows x64) | 11,7 MB |
| [aether-ide-0.2.1-x64-setup.exe](downloads/0.2.1/aether-ide-0.2.1-x64-setup.exe) | Instalador NSIS (Windows x64) | 5,62 MB |
| [aether-ide-0.2.1-x64.msi](downloads/0.2.1/aether-ide-0.2.1-x64.msi) | Instalador MSI (Windows x64) | 6,62 MB |

### v0.2.0

| Archivo | Tipo | Tamaño |
|---|---|---|
| [aether-ide-0.2.0-x64-portable.exe](downloads/0.2.0/aether-ide-0.2.0-x64-portable.exe) | **Portable** — ejecutable suelto, sin instalación (Windows x64) | 11,7 MB |
| [aether-ide-0.2.0-x64-setup.exe](downloads/0.2.0/aether-ide-0.2.0-x64-setup.exe) | Instalador NSIS (Windows x64) | 5,61 MB |
| [aether-ide-0.2.0-x64.msi](downloads/0.2.0/aether-ide-0.2.0-x64.msi) | Instalador MSI (Windows x64) | 6,61 MB |

### v0.1.4

| Archivo | Tipo | Tamaño |
|---|---|---|
| [aether-ide-0.1.4-x64-portable.exe](downloads/0.1.4/aether-ide-0.1.4-x64-portable.exe) | **Portable** — ejecutable suelto, sin instalación (Windows x64) | 9,93 MB |
| [aether-ide-0.1.4-x64-setup.exe](downloads/0.1.4/aether-ide-0.1.4-x64-setup.exe) | Instalador NSIS (Windows x64) | 4,97 MB |
| [aether-ide-0.1.4-x64.msi](downloads/0.1.4/aether-ide-0.1.4-x64.msi) | Instalador MSI (Windows x64) | 5,79 MB |

### v0.1.3

| Archivo | Tipo | Tamaño |
|---|---|---|
| [aether-ide-0.1.3-x64-portable.exe](downloads/0.1.3/aether-ide-0.1.3-x64-portable.exe) | **Portable** — ejecutable suelto, sin instalación (Windows x64) | 9,91 MB |
| [aether-ide-0.1.3-x64-setup.exe](downloads/0.1.3/aether-ide-0.1.3-x64-setup.exe) | Instalador NSIS (Windows x64) | 4,96 MB |
| [aether-ide-0.1.3-x64.msi](downloads/0.1.3/aether-ide-0.1.3-x64.msi) | Instalador MSI (Windows x64) | 5,78 MB |

### v0.1.2

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

### v0.2.2

**Añadido**
- **Actualizador automático funcional**: workflow de GitHub Actions (`.github/workflows/release.yml`) que al pushear un tag `v*` compila, **firma con minisign**, genera `latest.json` y publica el GitHub Release con instaladores + portable — los usuarios de v0.2.1+ ya reciben el botón **⬆ Actualizar**
- Artefactos de updater habilitados (`createUpdaterArtifacts` en tauri.conf.json)

**Corregido**
- El badge de versión de la barra superior ya no está hardcodeado: se lee de `package.json` en tiempo de compilación (con `resolveJsonModule`)

### v0.2.1

**Añadido**
- **Overhaul estético completo** (tema "Aether Night"): nueva paleta de alto contraste, tema Monaco propio con sintaxis distintiva (keywords violetas bold, funciones azul, tipos cyan), scrollbars ultra finos, focus rings y animación de entrada en mensajes del chat
- **Identidad visual por subagente**: 🐛 BugBot (rosa), 🛡 SecBot (esmeralda) y 📋 AuditBot (ámbar) con avatar circular y glow de su color
- **Glassmorphism** en Command Palette, menús flotantes, overlay de actualización y diálogo de términos (backdrop con blur + paneles translúcidos)
- **Barra de estado mejorada**: contador de cambios Git pendientes (punto ámbar), lenguaje del archivo activo y badge ✦ Aether
- Botón **Enviar** con gradiente violeta que brilla al hover; indicador activo de la sidebar con glow

**Corregido** (5 hallazgos del Bugbot)
- **CRITICAL**: la cancelación de streams estaba rota — el mapa de tareas nunca se inicializaba en Rust, por lo que todo chat/stream del agente fallaba al instante con "cancelado por el usuario"
- Errores de proveedor ya no se entregan dos veces al frontend (solo por el canal IPC; el comando siempre resuelve `Ok`)
- Salida única en `chat_stream`: el desregistro de tareas se ejecuta siempre, evitando entradas obsoletas en el mapa de cancelación
- Tooltips del chat restaurados al sistema i18n (renombrar/eliminar/cerrar)
- Dependencia circular `i18n ↔ settingsStore` rota definitivamente (módulo compartido `language.ts`)

### v0.2.0

**Añadido**
- **i18n bilingüe** (Español latino / Inglés): detección automática por SO + override manual en Ajustes → General
- **Ajustes reestructurado** con navegación lateral: General (Idioma, Auto Save) / Proveedores (API keys, modelos, fetch)
- **Chat de IA como panel derecho cerrable** (dock): coexiste con el Explorer, con botón 💬 en la barra superior
- **Selector de modo en botón desplegable** (Plan / Agente) en la cabecera del chat
- **Botón ■ Detener**: aborta el stream del chat y el bucle del agente en el siguiente paso (`chat_stop` en Rust con task abortable)
- **Subagentes con identidad propia**: 🐛 BugBot (/qa), 🛡 SecBot (/security), 📋 AuditBot (/audit) — análisis de solo lectura con reporte de hallazgos
- **Lectura de archivos por secciones** (`read_file_range` en Rust) para análisis de archivos grandes sin truncados
- **Sistema de actualizaciones automáticas** (tauri-plugin-updater): verificación al abrir, botón ⬆ en la barra superior, overlay con progreso
- **Instalador NSIS personalizado**: selector de idioma, imágenes de branding, Aether IDE en el wizard
- **Documentos legales**: Política de Privacidad y Términos de Servicio (docs/PRIVACY.md, docs/TERMS.md) con diálogo de aceptación al primer arranque
- Engranaje ⚙️ de Ajustes en la esquina superior derecha del MenuBar

**Corregido**
- Truncado de archivos al escribir con el agente: validación estricta de argumentos (`__truncated` marker) — el archivo ya no se vacía si el modelo corta la respuesta
- Chats aislados por workspace: cada carpeta tiene su propio historial (el chat activo se guarda y limpia al cambiar de proyecto)
- Carreras de búsqueda y detalle en el marketplace de extensiones
- `ResizeObserver` (Monaco/xterm) silenciado globalmente y con cancelación correcta
- El 💬 de la ActivityBar ya no depende de `activeView`: es un toggle puro del dock derecho

### v0.1.4

**Añadido**
- **Subagentes de análisis de solo lectura**: `/qa` (**🐛 BugBot** — bugs y edge cases), `/security` (**🛡 SecBot** — vulnerabilidades estilo white-hat) y `/audit` (**📋 AuditBot** — fusión de ambos), disponibles en ambos modos y **sin límite de pasos** (no pueden modificar nada)
- **Reporte de hallazgos con tarjetas y badges de severidad** (critical/high/medium/low) con archivo, línea y detalle — parseados del bloque `aether-findings` del subagente
- **Panel unificado Plan / Agente** con timeline cronológico compartido: al alternar de modo, la conversación y los pasos del agente **permanecen visibles** (solo cambia el comportamiento del input)
- **Lectura de archivos por secciones**: `read_file` acepta `start_line`/`end_line` (`read_file_range` en Rust) para analizar archivos grandes sin truncados a ciegas

**Corregido**
- **Truncado de archivos** al escribir con el agente: si los argumentos de una herramienta llegan cortados por límite de tokens (`__truncated`), la escritura se **rechaza con error claro** en vez de vaciar el archivo (validación estricta de `content`/`command` en `runTool`)
- Los subagentes ya no "reconstruyen" archivos con `search_files`: las reglas de lectura enseñan el uso de secciones y el límite de pasos ya no corta el análisis
- Límite de pasos del agente elevado a 40 (con protección anti-bucle de escrituras)

### v0.1.3

**Añadido**
- Menú **Ver** en la barra superior: Terminal Integrada (`Ctrl+J`), Barra Lateral (`Ctrl+B`) y Command Palette
- **Marketplace de Extensiones** conectado a la API pública de Open VSX: búsqueda con debounce, vista de detalle con README/versión/autor/icono oficial (`Ctrl+Shift+X`)
- **Material Icon Theme** integrado: descarga y extracción del VSIX (con `fflate`), iconos SVG oficiales para archivos y carpetas (incluyendo variantes expandidas) en el Explorer, con whitelist de instalación e instalar/desinstalar
- Filtros de **Readme renderizado** (HTML embebido sanitizado) e imágenes remotas del marketplace

**Corregido** (auditoría de 9 hallazgos del Bugbot)
- CSP con `connect-src`: los fetch a Open VSX ya no son bloqueados por el WebView
- Persistencia del **modo agente/chat**: al reiniciar, el panel vuelve al modo con el que se cerró
- Carreras de búsqueda y detalle en el marketplace (guards por secuencia), `searchError` limpio en éxito
- Iconos de carpeta con variante abierta/cerrada y `img-src` de CSP restringido a hosts de confianza
- README de Open VSX con verificación HTTP y caché de iconos v3 (invalida caches con mappings vacíos)

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
