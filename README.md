<div align="center">

# ✦ Aether IDE

**Editor de código de escritorio con integración y gestión de APIs de IA**

React + TypeScript · Rust (Tauri v2) · Monaco Editor

[![Descargas](https://img.shields.io/badge/⬇_Descargas-v0.3.1-blue)](#-descargas) [![Licencia](https://img.shields.io/badge/Licencia-Apache_2.0-blue.svg)](LICENSE)

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

### v0.3.1 *(actual)*

> 🚀 Los releases se publican automáticamente con GitHub Actions ([GitHub Releases](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest)) y se espejan en `downloads/` del repo por si acaso.

| Archivo | Tipo |
|---|---|
| [aether-ide-0.3.1-x64-setup.exe](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest) | Instalador NSIS (Windows x64) |
| [aether-ide-0.3.1-x64.msi](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest) | Instalador MSI (Windows x64) |
| [aether-ide-0.3.1-x64-portable.exe](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest) | **Portable** — ejecutable suelto, sin instalación |

> ⬆ Los usuarios de v0.3.0+ reciben esta actualización automáticamente (botón **⬆ Actualizar**).

### v0.3.0

| Archivo | Tipo | Tamaño |
|---|---|---|
| [aether-ide-0.3.0-x64-portable.exe](downloads/0.3.0/aether-ide-0.3.0-x64-portable.exe) | **Portable** — ejecutable suelto, sin instalación (Windows x64) | 11,72 MB |
| [aether-ide-0.3.0-x64-setup.exe](downloads/0.3.0/aether-ide-0.3.0-x64-setup.exe) | Instalador NSIS (Windows x64) | 5,62 MB |
| [aether-ide-0.3.0-x64.msi](downloads/0.3.0/aether-ide-0.3.0-x64.msi) | Instalador MSI (Windows x64) | 6,63 MB |

> 🚀 Los releases se publican automáticamente con GitHub Actions ([GitHub Releases](https://github.com/Pixel-Alquimia-Studios/Aether-IDE/releases/latest)) y se espejan en `downloads/` del repo por si acaso.

### v0.2.2

| Archivo | Tipo | Tamaño |
|---|---|---|
| [aether-ide-0.2.2-x64-portable.exe](downloads/0.2.2/aether-ide-0.2.2-x64-portable.exe) | **Portable** — ejecutable suelto, sin instalación (Windows x64) | 11,7 MB |
| [aether-ide-0.2.2-x64-setup.exe](downloads/0.2.2/aether-ide-0.2.2-x64-setup.exe) | Instalador NSIS (Windows x64) | 5,61 MB |
| [aether-ide-0.2.2-x64.msi](downloads/0.2.2/aether-ide-0.2.2-x64.msi) | Instalador MSI (Windows x64) | 6,63 MB |

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

### v0.3.1

Release de **endurecimiento (hardening)**: sin features nuevas — auditoría completa de seguridad y bugs (40+ hallazgos, todos verificados contra el código) y sus correcciones.

**Corregido — Seguridad**
- **CRÍTICO**: el diálogo de confirmación del agente estaba **muerto desde la v0.1.4** — el primer `write_file`/`execute_command` colgaba el bucle para siempre y la confirmación prometida en la UI no existía. Restaurado en el panel de chat mostrando la ruta y el **contenido completo** antes de aprobar, con **auto-denegación** al pulsar Detener o cambiar de workspace
- **Contención de rutas en el backend**: el workspace ahora vive en el estado de Rust (se fija al abrir carpeta o restaurar sesión) y los comandos usados por el agente (`read_file`, `read_file_range`, `read_file_base64`, `write_file`, `read_dir`, `search_files`, `execute_command`, `delete_file`, `file_exists`) **ignoran el root que envíe el frontend** y se contienen contra él — resiste `..`, symlinks/junctions hacia fuera, UNC, nombres reservados de Windows (CON, NUL…), streams alternos (`file.txt:ads`) y prefijos `\\?\` (9 tests). Archivo → Abrir archivo sigue funcionando mediante comandos de usuario separados
- **Subagentes de solo lectura con hard-deny**: aunque el modelo alucine una herramienta mutadora que no le fue ofrecida, el bucle la rechaza
- **Workflow de release**: las 6 GitHub Actions fijadas por SHA de commit (la de tauri-action corría con el token de publicación y la llave de firma del updater en su entorno); CSP recortada — fuera `github.com`/`api.github.com`/`raw.githubusercontent.com` de `connect-src` (canales de exfiltración muertos)
- Los cuerpos de error de los proveedores se truncan antes de mostrarse en el chat (texto controlado por terceros)

**Corregido — Streams y agente**
- **Reintentos del gateway ante errores transitorios**: 408, 429, 500, 502, 503, **504** y 529 (más errores de conexión/reset) se reintentan con backoff 2 s → 5 s → 10 s — antes solo se reintentaban 429/503 y un "HTTP 504 Gateway Timeout" del proveedor mataba el turno sin más. Se respeta la cabecera `Retry-After` del proveedor (con tope de 30 s); 400/401/403/404 y errores de contenido jamás se reintentan
- El reintento de la fase de stream **solo ocurre si aún no llegó contenido** al chat (imposible duplicar texto); un corte a mitad de respuesta ya no se silencia — antes se devolvía como si la respuesta estuviera completa
- **Inactividad del stream**: 120 s sin recibir ni un byte = stream muerto (antes colgaba eternamente); un stream que sigue emitiendo tokens no se corta (tope de seguridad total: 10 min)
- El backoff entre reintentos es **cancelable al instante**: Detener o cambiar de workspace aborta la espera y no se hace ninguna llamada más
- Estados claros en el chat mientras se reintenta: *"El proveedor no respondió (HTTP 504). Reintentando 1/3…"* (i18n ES/EN); al agotarse, error legible con el cuerpo del proveedor truncado
- Stop del chat ya no falla en silencio durante la ventana de reintentos de IPC: token de generación por stream — un stream "resucitado" no puede pisar el mensaje nuevo ni romper el Stop del siguiente
- Cambiar de workspace con un stream o el agente en vuelo **cancela todo** (antes el agente seguía escribiendo en la carpeta vieja y `streaming` quedaba pegado)
- Reanudar un chat o cambiar de modo ya no es posible mientras el agente corre (contaminación cruzada de chats); borrar el chat activo limpia sus pasos de agente
- Stop del agente aborta también el paso LLM en vuelo (`chat_stop` en Rust) — antes solo era cooperativo
- Doble Enter rápido ya no lanza dos streams concurrentes (`streaming` síncrono)
- El timeline unificado conserva el orden real tras reanudar (los `ts` de los mensajes ahora se persisten)
- Time Travel ya no puede ser deshecho por Auto Save (los timers se cancelan **antes** de restaurar); `saveTab` ya no pierde keystrokes escritos durante su propia escritura

**Corregido — Terminal, Git y robustez**
- **La terminal sobrevive a Ctrl+J** (queda montada y oculta — `npm run dev` ya no muere al cerrar el panel); shell muerta avisa con `[Proceso terminado]` + botón ↻ Reiniciar; todas las shells se matan al cerrar la app (sin procesos huérfanos); resize perdido tras el spawn se sincroniza; CWD sin workspace → home del usuario (antes System32)
- **Terminal sin mojibake**: decoder UTF-8 incremental — un carácter multibyte partido entre lecturas ya no se corrompe
- **Git con rutas unicode** (`core.quotepath=off`): "José/año.md" ya no llega escapado — stage/diff/delete funcionaban mal con acentos
- **execute_command con timeout**: 120 s por defecto, el agente puede subirlo a 600 s (`timeout`); al vencer se mata el **árbol** del proceso y se avisa; salida leída incrementalmente (sin buffer completo antes de truncar)
- El watcher ya no vigila `node_modules`/`target`/`dist` (tormentas de refresh en installs/builds)
- **Límites de lectura**: archivos >20 MB se rechazan con error claro (antes congelaban/reventaban el WebView); `read_file_range` escanea por bytes con captura acotada (2 MB/sección) en archivos grandes
- `session.json` corrupto se **cuarentena** y la app arranca limpia (antes rompía la restauración para siempre)
- Los errores del editor ya son visibles (banner rojo descartable — antes fallaba en silencio); `activeTab` colgante validado al restaurar; fallos de `saveSession` sin rechazos no manejados; Stop sin línea fantasma "⏹ Detenido" en modo agente

**Añadido**
- Parámetro `timeout` (1–600 s) en la herramienta `execute_command` del agente
- **25 tests unitarios de Rust**: contención de rutas (9), decoder UTF-8 (5), timeout/kill de comandos (2), límites y captura por secciones (4), reintentos del gateway (5: clasificación de códigos, backoff, Retry-After y contrato transitorio)

**Limitaciones conocidas** (diferidas a 0.4.x)
- Los checkpoints del Time Travel **no sobreviven a un reinicio** de la app (viven en memoria): tras recargar, editar/eliminar un mensaje anterior revierte el historial del chat pero no los archivos
- Archivos UTF-16 no se abren (error visible ahora); el BOM UTF-8 se preserva solo si no se edita la primera línea
- Sin backpressure en el PTY (una salida masiva puede crecer en memoria del webview)
- El modo agente/subagentes no reporta tokens reales ni cacheados (solo el chat streaming)

### v0.3.0

**Añadido**
- **Cache de prompt (context cache)**: Anthropic con `cache_control` efímero sobre system y último mensaje user; `stream_options.include_usage` en los 10 proveedores OpenAI-compatibles; métricas con **tokens reales** (adiós a la estimación chars/4) e indicador `💰 N cacheados` por respuesta — las conversaciones largas con Claude cuestan ~10× menos
- **Skills especializadas para subagentes**: checklists de QA/seguridad inyectados al system prompt de BugBot/SecBot/AuditBot, adaptados de [affaan-m/ECC](https://github.com/affaan-m/ECC) (MIT, ver `THIRD_PARTY_NOTICES.md`); carga determinista (orden alfabético) dentro del prefijo cacheable
- **Prompts base de subagentes en recursos versionados** (`src/resources/subagents/`) — un skill nuevo `.md` con frontmatter "aparece solo" vía `import.meta.glob`
- **Menú de comandos `/`** en el chat: filtrado difuso, avatares con color de cada bot, navegación por teclado (↑/↓/Enter/Tab/Esc) — reemplaza los 3 chips
- **Visualizador de imágenes en el editor**: png/jpg/gif/webp/bmp/ico/svg/avif con zoom (+/−/100%/ajustar), barra de dimensiones y peso; lectura binaria segura (`read_file_base64` en Rust)
- Evaluación de **Velopack** documentada (`docs/VELOPACK_EVAL.md`): deltas medidos de 20 KB vs 8,3 MB full

**Corregido**
- Lint warnings de React (set-state-in-effect, exhaustive-deps) en el visor y el gutter diff

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
