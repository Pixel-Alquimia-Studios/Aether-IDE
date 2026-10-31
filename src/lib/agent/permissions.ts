// Permisos del agente (Lote C, v0.4.0): escritura y ejecución de comandos.
// Módulo PURO — sin zustand ni tauri — testeable con Node directo.
//
// Modelo: 2 categorías (write_file, execute_command). Sin nivel global:
// los permisos se keyan por workspace normalizado. Sin entrada = 'ask'.
//
// Seguridad:
// - Fail-closed: valor corrupto o desconocido = 'ask'
// - Raíz de unidad / home del usuario: NO se puede permitir (rechazado)
// - Rutas protegidas (.git/, .github/, .vscode/, .env*) SIEMPRE preguntan
// - execute en 'safe' usa ALLOWLIST de inspección sin efectos; parser que
//   falla cerrado (redirección, subshell, encoded, comillas sin cerrar = ask)
// - La contención de rutas de Rust aplica SIEMPRE independientemente del permiso

export type WritePermission = 'ask' | 'allow'
export type ExecutePermission = 'ask' | 'safe'

export interface WorkspacePermissions {
  write: WritePermission
  execute: ExecutePermission
}

export const DEFAULT_PERMISSIONS: WorkspacePermissions = { write: 'ask', execute: 'ask' }

const STORAGE_KEY = 'aether-ide-agent-permissions'

// ============ Normalización de clave de workspace ============

/**
 * Normaliza una ruta de workspace para usarla como clave de permisos:
 * sin prefijo \\?\, separadores unificados a /, sin barra final.
 * En Windows: lowercase (insensible a mayúsculas).
 * Devuelve null si la ruta es una raíz de unidad o está vacía.
 */
export function normalizeWorkspaceKey(path: string, isWindows = true): string | null {
  if (!path || !path.trim()) return null
  let normalized = path.trim()
  normalized = normalized.replace(/^\\\\\?\\/, '')
  normalized = normalized.replace(/[\\/]+/g, '/')
  if (normalized.length > 3) normalized = normalized.replace(/\/+$/, '')
  if (isWindows) normalized = normalized.toLowerCase()
  if (/^[a-z]:\/?$/i.test(normalized)) return null
  if (normalized === '/' || normalized === '') return null
  return normalized
}

/** Rechaza workspaces que son el directorio home del usuario */
export function isUnsafeWorkspace(path: string, homeDir: string): boolean {
  const norm = normalizeWorkspaceKey(path)
  const normHome = normalizeWorkspaceKey(homeDir)
  if (!norm || !normHome) return true
  return norm === normHome
}

// ============ Persistencia (localStorage) ============

interface PermissionsStorage {
  workspaces: Record<string, WorkspacePermissions>
}

function readStorage(): PermissionsStorage {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return { workspaces: {} }
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.workspaces !== 'object') {
      return { workspaces: {} }
    }
    return parsed as PermissionsStorage
  } catch {
    return { workspaces: {} }
  }
}

function writeStorage(storage: PermissionsStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch {
    // localStorage no disponible
  }
}

/**
 * Lee los permisos para un workspace. Fail-closed: cualquier valor
 * corrupto o desconocido → 'ask'.
 */
export function getPermissions(rootPath: string, isWindows = true): WorkspacePermissions {
  const key = normalizeWorkspaceKey(rootPath, isWindows)
  if (!key) return { ...DEFAULT_PERMISSIONS }
  const storage = readStorage()
  const perms = storage.workspaces[key]
  if (!perms || typeof perms !== 'object') return { ...DEFAULT_PERMISSIONS }
  return {
    write: perms.write === 'allow' ? 'allow' : 'ask',
    execute: perms.execute === 'safe' ? 'safe' : 'ask',
  }
}

/**
 * Guarda los permisos para un workspace. Solo acepta valores válidos;
 * cualquier otro valor se guarda como 'ask' (fail-closed).
 */
export function setPermissions(
  rootPath: string,
  perms: Partial<WorkspacePermissions>,
  isWindows = true,
): void {
  const key = normalizeWorkspaceKey(rootPath, isWindows)
  if (!key) return
  const storage = readStorage()
  storage.workspaces[key] = {
    write: perms.write === 'allow' ? 'allow' : 'ask',
    execute: perms.execute === 'safe' ? 'safe' : 'ask',
  }
  writeStorage(storage)
}

/** Revoca los permisos de un workspace (vuelve a 'ask') */
export function revokePermissions(rootPath: string, isWindows = true): void {
  setPermissions(rootPath, { write: 'ask', execute: 'ask' }, isWindows)
}

// ============ Rutas protegidas (SIEMPRE preguntan) ============

/**
 * Prefijos de directorios protegidos: cualquier archivo DENTRO de estos
 * directorios requiere confirmación, incluso con permiso 'allow'.
 */
const PROTECTED_PREFIXES = [
  /^\.git\//,
  /^\.github\//,
  /^\.vscode\//,
  /^\.husky\//,
  /^\.cargo\//,
  /^\.env/,
]

/**
 * Archivos protegidos por nombre exacto (la modificación de estos archivos
 * ejecuta código en la siguiente corrida o filtra credenciales)
 */
const PROTECTED_FILES = new Set(['.npmrc', '.gitmodules', 'package.json'])

/**
 * Normaliza una ruta relativa para el chequeo de rutas protegidas:
 * resuelve segmentos `..` y `.`, unifica separadores a `/`, lowercase.
 * Insensible a mayúsculas (seguridad en Windows).
 */
export function normalizeRelativePath(relativePath: string): string {
  let normalized = relativePath.replace(/[\\/]+/g, '/').toLowerCase()
  const parts: string[] = []
  for (const segment of normalized.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.' && segment !== '') parts.push(segment)
  }
  return parts.join('/')
}

/**
 * ¿La ruta (relativa al workspace) es una ruta protegida que SIEMPRE
 * requiere confirmación, incluso con permiso 'allow'?
 * El chequeo se hace sobre la ruta normalizada (resuelve `..`, unifica
 * separadores, lowercase) para resistir `.GIT/config`, `src/../.git/config`,
 * `.Git\hooks\pre-commit`, `.ENV.local`, etc.
 */
export function isProtectedPath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) return false
  if (PROTECTED_FILES.has(normalized)) return true
  return PROTECTED_PREFIXES.some((pattern) => pattern.test(normalized))
}

// ============ Allowlist de execute en modo 'safe' ============

/**
 * Allowlist CON ARGUMENTOS: cada comando define qué argumentos acepta.
 * Todo lo que no esté en la lista => pregunta (fail-closed).
 */
interface SafeCommandSpec {
  /** git: subcomandos permitidos */
  subcommands?: Set<string>
  /** git branch: únicamente estos flags */
  branchFlags?: Set<string>
  /** git: flags que escriben archivos o son peligrosos — SIEMPRE rechazados */
  rejectedFlags?: RegExp
  /** git: flags seguros (desactivan comportamiento peligroso) */
  safeFlags?: Set<string>
  /** true = el comando NO acepta ningún argumento */
  noArgs?: boolean
  /** true = el comando acepta argumentos libres (sin efectos) */
  allowArgs?: boolean
  /** true = el comando LEE archivos → los args-ruta deben estar en el workspace */
  readsFiles?: boolean
}

const GIT_SUBCOMMANDS = new Set(['status', 'diff', 'log', 'show', 'branch'])
const GIT_BRANCH_FLAGS = new Set(['--list', '-a', '-v'])
const GIT_REJECTED_FLAGS = /--output|-o[\s=]|--ext-diff|--textconv|--output-dir|--output-indicator|--patch|--stdin/
const GIT_GLOBAL_OPTIONS = /^(-c|-C|--git-dir|--work-tree|--exec-path|--namespace|--config-env|-p|--paginate|--no-index|--no-replace-objects)/
const GIT_SAFE_FLAGS = new Set(['--no-ext-diff', '--no-textconv', '--stat', '--shortstat', '--name-only', '--name-status'])

const SAFE_EXECUTABLES: Record<string, SafeCommandSpec> = {
  git: {
    subcommands: GIT_SUBCOMMANDS,
    branchFlags: GIT_BRANCH_FLAGS,
    rejectedFlags: GIT_REJECTED_FLAGS,
    safeFlags: GIT_SAFE_FLAGS,
  },
  ls: { readsFiles: true },
  dir: { readsFiles: true },
  cat: { readsFiles: true },
  type: { readsFiles: true },
  head: { readsFiles: true },
  tail: { readsFiles: true },
  wc: { readsFiles: true },
  echo: { allowArgs: true },
  pwd: { noArgs: true },
  whoami: { noArgs: true },
  hostname: { noArgs: true },
  date: { noArgs: true },
}

/**
 * Parser que FALLA CERRADO: determina si un comando es seguro para
 * auto-ejecución en modo 'safe'. Cualquier duda → false (pregunta).
 */
export function isCommandSafe(command: string, rootPath?: string): boolean {
  if (!command || !command.trim()) return false

  const trimmed = command.trim()

  // Rechazar codificación
  if (/-EncodedCommand/i.test(trimmed)) return false
  if (/base64/i.test(trimmed) && /decode|exec/i.test(trimmed)) return false

  // Rechazar redirecciones
  if (/[^|>&<>][>|]{1,2}[^|>&<>]/.test(trimmed)) return false
  if (/<[^|]/.test(trimmed) && !/<-/.test(trimmed)) return false

  // Rechazar subshells y backticks
  if (/\$\(/.test(trimmed)) return false
  if (trimmed.includes('`')) return false

  // Rechazar & en segundo plano (pero no && que es encadenado)
  if (/[^&]&[^&]/.test(trimmed)) return false

  // Comillas sin cerrar
  const singleQuotes = (trimmed.match(/'/g) || []).length
  const doubleQuotes = (trimmed.match(/"/g) || []).length
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) return false

  // Rechazar variables y expansiones en cualquier posición (req. 2)
  if (/\$\{/.test(trimmed)) return false
  if (/\$env:/i.test(trimmed)) return false
  if (/\$[a-zA-Z_]/.test(trimmed)) return false
  if (/%[a-zA-Z_][a-zA-Z_0-9]*%/.test(trimmed)) return false
  if (/@\(/.test(trimmed)) return false

  // Dividir por encadenadores y verificar cada segmento
  const segments = trimmed.split(/\s*(?:;|&&|\|\||\||\r?\n)\s*/)
  for (const segment of segments) {
    const clean = segment.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!clean) continue
    if (!isSegmentSafe(clean, rootPath)) return false
  }
  return true
}

function isSegmentSafe(segment: string, rootPath?: string): boolean {
  const tokens = segment.replace(/\s+/g, ' ').trim().toLowerCase().split(' ')
  const cmd = tokens[0]
  const spec = SAFE_EXECUTABLES[cmd]
  if (!spec) return false

  if (spec.noArgs) return tokens.length === 1
  if (cmd === 'git') return isGitSafe(tokens.slice(1))

  const args = tokens.slice(1)

  // Comandos que LEEN archivos: contención de rutas en los argumentos (req. 1)
  if (spec.readsFiles) return areArgsInWorkspace(args, rootPath)

  if (spec.allowArgs) return true

  return false
}

function isGitSafe(args: string[]): boolean {
  if (args.length === 0) return false

  // Rechazar opciones globales antes del subcomando (req. 3)
  if (GIT_GLOBAL_OPTIONS.test(args[0])) return false

  const subcommand = args[0]
  if (!GIT_SUBCOMMANDS.has(subcommand)) return false

  const rest = args.slice(1)

  // git branch: únicamente --list, -a o -v
  if (subcommand === 'branch') {
    if (rest.length === 0) return true
    return rest.every((arg) => GIT_BRANCH_FLAGS.has(arg.toLowerCase()))
  }

  // Filtrar flags seguros antes de chequear los rechazados
  const filtered = rest.filter((arg) => !GIT_SAFE_FLAGS.has(arg.toLowerCase()))
  const joined = filtered.join(' ')
  if (GIT_REJECTED_FLAGS.test(joined)) return false

  return true
}

/**
 * Contención de rutas para comandos que LEEN archivos (req. 1):
 * cada argumento que NO es un flag se verifica para que NO escape del workspace.
 * Rechaza: rutas absolutas, .., ~, variables, UNC, ADS, nombres reservados,
 * rutas protegidas (.env, .git/, package.json…).
 */
function areArgsInWorkspace(args: string[], rootPath?: string): boolean {
  for (const arg of args) {
    if (arg.startsWith('-')) continue

    // Variables y expansiones
    if (/[$%@]/.test(arg)) return false

    // Rutas absolutas (Windows o Unix) — fuera del workspace
    if (/^[a-z]:/i.test(arg)) return false
    if (arg.startsWith('/')) return false

    // UNC
    if (arg.startsWith('\\\\')) return false

    // Home shortcut
    if (arg.startsWith('~')) return false

    // Segmentos .. (escape del workspace)
    const segments = arg.replace(/[\\/]+/g, '/').split('/')
    if (segments.includes('..')) return false

    // ADS (alternate data streams)
    const fileName = segments[segments.length - 1] ?? ''
    if (fileName.includes(':') && !/^[a-z]:$/i.test(fileName)) return false

    // Nombres reservados de Windows
    const stem = fileName.split('.')[0] ?? ''
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(stem)) return false

    // Rutas protegidas (.env, .git/, package.json…)
    const relative = segments.join('/')
    if (isProtectedPath(relative)) return false

    // Contención completa si tenemos el rootPath
    if (rootPath) {
      const normalizedRoot = normalizeWorkspaceKey(rootPath)
      if (normalizedRoot) {
        const resolved = normalizeWorkspaceKey(normalizedRoot + '/' + relative)
        if (!resolved || !resolved.startsWith(normalizedRoot + '/')) return false
      }
    }
  }
  return true
}

// ============ Evaluación de permisos para una acción ============

export type AgentActionType = 'write_file' | 'execute_command'

export interface PermissionDecision {
  auto: boolean
  protectedPath: boolean
  permissions: WorkspacePermissions
}

/**
 * Evalúa si una acción del agente puede ejecutarse automáticamente.
 * Se llama en el momento de CADA tool call con el workspace ACTUAL.
 */
export function evaluatePermission(
  action: AgentActionType,
  rootPath: string,
  options?: { relativePath?: string; command?: string },
): PermissionDecision {
  const perms = getPermissions(rootPath)
  const decision: PermissionDecision = {
    auto: false,
    protectedPath: false,
    permissions: perms,
  }

  if (action === 'write_file') {
    if (options?.relativePath && isProtectedPath(options.relativePath)) {
      decision.protectedPath = true
      return decision
    }
    decision.auto = perms.write === 'allow'
  }

  if (action === 'execute_command') {
    if (perms.execute === 'safe' && options?.command) {
      decision.auto = isCommandSafe(options.command, rootPath)
    }
  }

  return decision
}
