import type { Language } from '@/lib/language'
import { useSettingsStore } from '@/stores/settingsStore'

// Sistema de i18n casero (v0.2.0): diccionarios Español latino / Inglés con
// claves tipadas. El idioma vive en settingsStore (arranque auto por SO con
// override manual en Ajustes → General → Idioma).

export type { Language }

const en = {
  // MenuBar — Archivo
  'menu.file': 'File',
  'menu.newFile': 'New File',
  'menu.openFile': 'Open File...',
  'menu.openFolder': 'Open Folder...',
  'menu.save': 'Save',
  'menu.saveAs': 'Save As...',
  'menu.autoSave': 'Auto Save',
  'menu.preferences': 'Preferences',
  'menu.exit': 'Exit',
  // MenuBar — Ver
  'menu.view': 'View',
  'menu.terminal': 'Integrated Terminal',
  'menu.sidebar': 'Sidebar',
  'menu.palette': 'Command Palette',
  'menu.settings': 'Settings',
  // ActivityBar / Sidebar
  'side.explorer': 'Explorer',
  'side.search': 'Search',
  'side.git': 'Source Control',
  'side.extensions': 'Extensions',
  'side.ai': 'AI Chat',
  'side.settings': 'Settings',
  'side.noFolder': 'No folder open',
  'side.loading': 'Loading…',
  'side.openFolderHint': 'Open a folder with 📂 or File → Open Folder...',
  'side.newFile': 'New File',
  'side.refresh': 'Refresh Explorer',
  'side.openFolder': 'Open folder…',
  'side.useChat': 'Use the AI chat panel 💬',
  'side.settingsCentral': 'Settings live in the central view',
  // GitView
  'git.staged': 'Staged changes',
  'git.unstaged': 'Changes (unstaged)',
  'git.loading': 'Loading…',
  'git.clean': 'No pending changes',
  'git.more': 'Show more',
  'git.stageAll': 'Stage all (＋)',
  'git.unstageAll': 'Unstage all (−)',
  'git.stage': 'Stage (+)',
  'git.unstage': 'Unstage (−)',
  'git.pull': 'Pull (⬇)',
  'git.push': 'Push (⬆)',
  'git.refresh': 'Refresh',
  'git.commitPlaceholder': 'Commit message…',
  'git.commit': 'Commit',
  // ExtensionsView
  'ext.installed': 'Installed',
  'ext.available': 'Available (whitelist)',
  'ext.searchPlaceholder': 'Search Open VSX…',
  'ext.searching': 'Searching…',
  'ext.noResults': 'No results.',
  'ext.back': '← Back',
  'ext.installedEnabled': '✓ Installed and Enabled',
  'ext.install': 'Install',
  'ext.installing': 'Installing…',
  'ext.uninstall': 'Uninstall',
  'ext.notAvailable': '🔒 Not available (whitelist)',
  'ext.whitelistNote':
    'Aether IDE only installs extensions authorized by its whitelist.',
  'ext.readmeLoading': 'Loading README…',
  'ext.readmeMissing': 'No README available.',
  'ext.resultsHeader': 'Results in Open VSX',
  // ChatPanel
  'chat.newChat': 'New chat',
  'chat.renameChat': 'Rename chat',
  'chat.deleteChat': 'Delete chat',
  'chat.historyEmpty': '— New chat —',
  'chat.plan': 'Plan',
  'chat.agent': 'Agent',
  'chat.reasoning': 'Reasoning',
  'chat.send': 'Send',
  'chat.run': 'Run',
  'chat.analyze': 'Analyze',
  'chat.busy': '…',
  'chat.close': 'Close panel',
  'chat.cachedTokens': 'cached',
  'chat.commands': 'Commands',
  'chat.noMatches': 'No commands',
  'chat.placeholderCommands': 'Type / for commands, @ to attach context…',
  'chat.confirmRequired': 'Confirmation required',
  'chat.approvalWrite': 'Write file',
  'chat.approvalCommand': 'Run command',
  'chat.approve': 'Approve',
  'chat.deny': 'Deny',
  'chat.placeholderPlan': 'Write your plan or question… (use @ and /qa, /security, /audit)',
  'chat.placeholderAgent': 'Task for the agent… (/qa, /security, /audit for analysis)',
  'chat.placeholderNoProvider': 'Select a provider in Settings…',
  'chat.placeholderProvider': 'Message…',
  'chat.emptyPlan': 'Write your plan or question — use @ to attach context',
  'chat.emptyAgent': 'Describe a task for the agent or use /qa, /security, /audit',
  'chat.emptyNoProvider': 'Select a provider above',
  'chat.emptyProvider': 'Ask a question',
  'chat.viewResult': 'view result',
  'chat.running': 'running…',
  'chat.selectProviderTop': 'Select a provider above',
  'chat.selectProviderSettings': 'Select a provider in Settings…',
  'chat.providerMessage': 'Message',
  'chat.selectProvider': 'Provider…',
  'chat.noModels': 'No models',
  'chat.tokens': 'tokens',
  'chat.detenido': 'Stopped by the user',
  'chat.stop': 'Stop',
  // Subagentes
  'subagent.header': 'subagent · read-only analysis',
  'subagent.online': 'online — starting',
  // Findings
  'findings.title': 'Findings report',
  // CommandPalette
  'palette.placeholder': 'Type a command or search a file…',
  // Settings
  'settings.title': 'Settings',
  'settings.subtitle': 'Manage AI providers, API keys and the active model',
  'settings.general': 'General',
  'settings.providers': 'Providers',
  'settings.language': 'Language',
  'settings.languageEs': 'Español (Latino)',
  'settings.languageEn': 'English',
  'settings.autoSave': 'Auto Save',
  'settings.activeModel': 'Active model',
  'settings.pickModel': 'Choose a model…',
  'settings.customModel': '…or type a custom model ID',
  'settings.refreshModels': '↻ Refresh models',
  'settings.loadingModels': 'Loading…',
  'settings.apiKey': 'API Key',
  'settings.keyConfigured': 'Configured in the OS keychain',
  'settings.keyNotConfigured': 'Not configured',
  'settings.pasteKey': 'Paste your API key…',
  'settings.save': 'Save',
  'settings.delete': 'Delete',
  'settings.keychainNote':
    'The key is stored in the OS keychain (Credential Manager on Windows, Keychain on macOS). It is never written to plain files nor exposed to the frontend.',
  'settings.localProvider': 'Local provider — no API key required.',
  // Terms (Fase F: legal)
  'terms.dialogTitle': 'Terms of Service and Privacy Policy',
  'terms.summary':
    'Aether IDE runs entirely on your machine: your code, conversations and keys never pass through our servers (we run none).',
  'terms.privacyTitle': 'Privacy',
  'terms.privacyBody':
    'No telemetry, no tracking, no accounts. API keys are stored in the OS keychain. Extension icons are optionally downloaded from Open VSX.',
  'terms.aiTitle': 'AI providers',
  'terms.aiBody':
    'When you use AI features, requests go DIRECTLY from your machine to the provider you select with your own API key (OpenAI, Anthropic, etc.). Aether IDE never proxies or logs them.',
  'terms.agentTitle': 'Agent tools',
  'terms.agentBody':
    'The Agent mode can read, create and modify files in your opened workspace, always with your prior confirmation for writes and command execution. Analysis subagents are read-only.',
  'terms.docs': 'Full documents in the repository:',
  'terms.accept': 'Accept and continue',
  'settings.noProvider': 'Select a provider from the list',
  // StatusBar
  'status.noFile': 'No file open',
  // Misc
  'common.yes': 'Yes',
} as const

export type TranslationKey = keyof typeof en

const es: Record<TranslationKey, string> = {
  // MenuBar — Archivo
  'menu.file': 'Archivo',
  'menu.newFile': 'Nuevo archivo',
  'menu.openFile': 'Abrir archivo...',
  'menu.openFolder': 'Abrir carpeta...',
  'menu.save': 'Guardar',
  'menu.saveAs': 'Guardar como...',
  'menu.autoSave': 'Autoguardado',
  'menu.preferences': 'Preferencias',
  'menu.exit': 'Salir',
  // MenuBar — Ver
  'menu.view': 'Ver',
  'menu.terminal': 'Terminal integrada',
  'menu.sidebar': 'Barra lateral',
  'menu.palette': 'Paleta de comandos',
  'menu.settings': 'Ajustes',
  // ActivityBar / Sidebar
  'side.explorer': 'Explorador',
  'side.search': 'Búsqueda',
  'side.git': 'Control de código',
  'side.extensions': 'Extensiones',
  'side.ai': 'Chat de IA',
  'side.settings': 'Ajustes',
  'side.noFolder': 'Sin carpeta abierta',
  'side.loading': 'Cargando…',
  'side.openFolderHint': 'Abre una carpeta con 📂 o Archivo → Abrir carpeta...',
  'side.newFile': 'Nuevo archivo',
  'side.refresh': 'Actualizar explorador',
  'side.openFolder': 'Abrir carpeta…',
  'side.useChat': 'Usa el panel de chat de IA 💬',
  'side.settingsCentral': 'Los ajustes están en la vista central',
  // GitView
  'git.staged': 'Cambios preparados (staged)',
  'git.unstaged': 'Cambios (unstaged)',
  'git.loading': 'Cargando…',
  'git.clean': 'Sin cambios pendientes',
  'git.more': 'Mostrar más',
  'git.stageAll': 'Preparar todos (＋)',
  'git.unstageAll': 'Despreparar todos (−)',
  'git.stage': 'Preparar (+)',
  'git.unstage': 'Despreparar (−)',
  'git.pull': 'Traer (⬇)',
  'git.push': 'Enviar (⬆)',
  'git.refresh': 'Actualizar',
  'git.commitPlaceholder': 'Mensaje de commit…',
  'git.commit': 'Commit',
  // ExtensionsView
  'ext.installed': 'Instaladas',
  'ext.available': 'Disponibles (whitelist)',
  'ext.searchPlaceholder': 'Buscar en Open VSX…',
  'ext.searching': 'Buscando…',
  'ext.noResults': 'Sin resultados.',
  'ext.back': '← Volver',
  'ext.installedEnabled': '✓ Instalado y Habilitado',
  'ext.install': 'Instalar',
  'ext.installing': 'Instalando…',
  'ext.uninstall': 'Desinstalar',
  'ext.notAvailable': '🔒 No disponible (whitelist)',
  'ext.whitelistNote':
    'Aether IDE solo instala extensiones autorizadas por su whitelist.',
  'ext.readmeLoading': 'Cargando README…',
  'ext.readmeMissing': 'Sin README disponible.',
  'ext.resultsHeader': 'Resultados en Open VSX',
  // ChatPanel
  'chat.newChat': 'Nuevo chat',
  'chat.renameChat': 'Renombrar chat',
  'chat.deleteChat': 'Eliminar chat',
  'chat.historyEmpty': '— Chat nuevo —',
  'chat.plan': 'Plan',
  'chat.agent': 'Agente',
  'chat.reasoning': 'Razonamiento',
  'chat.send': 'Enviar',
  'chat.run': 'Ejecutar',
  'chat.analyze': 'Analizar',
  'chat.busy': '…',
  'chat.close': 'Cerrar panel',
  'chat.cachedTokens': 'cacheados',
  'chat.commands': 'Comandos',
  'chat.noMatches': 'Sin comandos',
  'chat.placeholderCommands': 'Escribe / para comandos, @ para adjuntar contexto…',
  'chat.confirmRequired': 'Confirmación requerida',
  'chat.approvalWrite': 'Escribir archivo',
  'chat.approvalCommand': 'Ejecutar comando',
  'chat.approve': 'Aprobar',
  'chat.deny': 'Denegar',
  'chat.placeholderPlan': 'Escribe tu plan o pregunta… (usa @ y /qa, /security, /audit)',
  'chat.placeholderAgent': 'Tarea para el agente… (/qa, /security, /audit para análisis)',
  'chat.placeholderNoProvider': 'Selecciona un proveedor en Ajustes…',
  'chat.placeholderProvider': 'Mensaje…',
  'chat.emptyPlan': 'Escribe tu plan o pregunta — usa @ para adjuntar contexto',
  'chat.emptyAgent': 'Describe una tarea para el agente o usa /qa, /security, /audit',
  'chat.emptyNoProvider': 'Selecciona un proveedor arriba',
  'chat.emptyProvider': 'Haz una pregunta',
  'chat.viewResult': 'ver resultado',
  'chat.running': 'ejecutando…',
  'chat.selectProviderTop': 'Selecciona un proveedor arriba',
  'chat.selectProviderSettings': 'Selecciona un proveedor en Ajustes…',
  'chat.providerMessage': 'Mensaje',
  'chat.selectProvider': 'Proveedor…',
  'chat.noModels': 'Sin modelos',
  'chat.tokens': 'tokens',
  'chat.detenido': 'Detenido por el usuario',
  'chat.stop': 'Detener',
  // Subagentes
  'subagent.header': 'subagente · análisis de solo lectura',
  'subagent.online': 'en línea — iniciando',
  // Findings
  'findings.title': 'Reporte de hallazgos',
  // CommandPalette
  'palette.placeholder': 'Escribe un comando o busca un archivo…',
  // Settings
  'settings.title': 'Ajustes',
  'settings.subtitle': 'Gestiona proveedores de IA, claves de API y el modelo activo',
  'settings.general': 'General',
  'settings.providers': 'Proveedores',
  'settings.language': 'Idioma',
  'settings.languageEs': 'Español (Latino)',
  'settings.languageEn': 'Inglés',
  'settings.autoSave': 'Autoguardado',
  'settings.activeModel': 'Modelo activo',
  'settings.pickModel': 'Elegir modelo…',
  'settings.customModel': '…o escribe un model ID personalizado',
  'settings.refreshModels': '↻ Refrescar modelos',
  'settings.loadingModels': 'Cargando…',
  'settings.apiKey': 'Clave de API',
  'settings.keyConfigured': 'Configurada en el keychain del SO',
  'settings.keyNotConfigured': 'No configurada',
  'settings.pasteKey': 'Pega tu API key…',
  'settings.save': 'Guardar',
  'settings.delete': 'Borrar',
  'settings.keychainNote':
    'La clave se guarda en el keychain del sistema operativo (Credential Manager en Windows, Keychain en macOS). Nunca se escribe en archivos planos ni se expone al frontend.',
  'settings.localProvider': 'Proveedor local — no requiere API key.',
  // Terms (Fase F: legal)
  'terms.dialogTitle': 'Términos del Servicio y Política de Privacidad',
  'terms.summary':
    'Aether IDE se ejecuta íntegramente en tu equipo: tu código, tus conversaciones y tus claves nunca pasan por servidores nuestros (no operamos ninguno).',
  'terms.privacyTitle': 'Privacidad',
  'terms.privacyBody':
    'Sin telemetría, sin rastreo, sin cuentas. Las API keys se guardan en el keychain del SO. Los iconos de extensiones se descargan opcionalmente desde Open VSX.',
  'terms.aiTitle': 'Proveedores de IA',
  'terms.aiBody':
    'Al usar las funciones de IA, las solicitudes van DIRECTAMENTE de tu equipo al proveedor que selecciones con tu propia API key (OpenAI, Anthropic, etc.). Aether IDE nunca actúa como intermediario ni las registra.',
  'terms.agentTitle': 'Herramientas del agente',
  'terms.agentBody':
    'El modo Agente puede leer, crear y modificar archivos del workspace que abras, siempre con tu confirmación previa para escrituras y ejecución de comandos. Los subagentes de análisis son de solo lectura.',
  'terms.docs': 'Documentos completos en el repositorio:',
  'terms.accept': 'Aceptar y continuar',
  'settings.noProvider': 'Selecciona un proveedor de la lista',
  // StatusBar
  'status.noFile': 'Ningún archivo abierto',
  // Misc
  'common.yes': 'Sí',
}

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, es }



/** Hook reactivo: lee el idioma del settingsStore (reactivo a cambios) */
export function useT(): (key: TranslationKey) => string {
  const language = useSettingsStore((s) => s.language)
  return (key) => {
    const dict = dictionaries[language] ?? en
    return dict[key] ?? en[key] ?? key
  }
}

/** Versión no reactiva (para código fuera de componentes) */
export function tSync(key: TranslationKey): string {
  const language = useSettingsStore.getState().language
  const dict = dictionaries[language] ?? en
  return dict[key] ?? en[key] ?? key
}

