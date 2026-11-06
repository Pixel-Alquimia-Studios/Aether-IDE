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
 * RECHAZA permitir en un workspace inseguro (raíz de unidad o el directorio
 * home del usuario): se guarda 'ask' en ambos.
 */
export function setPermissions(
  rootPath: string,
  perms: Partial<WorkspacePermissions>,
  isWindows = true,
): void {
  const key = normalizeWorkspaceKey(rootPath, isWindows)
  if (!key) return
  // Raíz de unidad (key null ya la cubre) o HOME del usuario: nunca permitir
  if (homeDirCache && isUnsafeWorkspace(rootPath, homeDirCache)) return
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

// ============ Workspace inseguro (Lote G: isUnsafeWorkspace cableado) ============

// Home resuelto desde Rust (user_home_dir) UNA vez al arrancar; mientras no
// llegue, evaluatePermission falla cerrado (no auto-aprueba nada)
let homeDirCache: string | null = null

/** App.tsx inyecta el home real del usuario aquí al arrancar */
export function setHomeDir(home: string | null): void {
  homeDirCache = home?.trim() ? home.trim() : null
}

/** Home cacheado (o null si aún no llegó) */
export function getHomeDir(): string | null {
  return homeDirCache
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
 *
 * DELIBERADAMENTE REDUCIDA (Lote G): NO hay comandos que lean archivos
 * (cat, type, head, tail, wc, ls, dir). El agente tiene read_file,
 * list_directory y search_files, contenidas por Rust con canonicalize.
 *
 * LÍMITE CONOCIDO (A4, diferido): la contención de rutas aquí es LÉXICA —
 * un symlink/junction DENTRO del workspace que apunte afuera sería seguido
 * por la shell sin que este chequeo lo vea. El write_file del backend sí
 * canonicaliza (ensure_in_workspace); para execute la mitigación actual es
 * la superficie mínima de esta allowlist (solo comandos sin rutas).
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
export function isCommandSafe(command: string): boolean {
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
    if (!isSegmentSafe(clean)) return false
  }
  return true
}

function isSegmentSafe(segment: string): boolean {
  const tokens = segment.replace(/\s+/g, ' ').trim().toLowerCase().split(' ')
  const cmd = tokens[0]
  const spec = SAFE_EXECUTABLES[cmd]
  if (!spec) return false

  if (spec.noArgs) return tokens.length === 1
  if (cmd === 'git') return isGitSafe(tokens.slice(1))

  if (spec.allowArgs) return true

  return false
}

/**
 * Extrae la parte de ruta de un argumento de git: la forma `rev:ruta`
 * (`HEAD:.env`, `:.env`, `master:src/.env`) deja solo la ruta; cualquier
 * otro arg se devuelve tal cual.
 */
function gitArgPath(arg: string): string {
  const idx = arg.indexOf(':')
  // Los flags con ':' (p. ej. --foo:bar) no llegan aquí: solo args no-flag
  if (idx === -1) return arg
  return arg.slice(idx + 1)
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

  // Rutas protegidas: cualquier arg no-flag — incluyendo lo que sigue a `--`
  // y la forma `rev:ruta` — que, normalizado, apunte a una ruta protegida
  // (.env, .git/, package.json…) => pregunta. Los comodines también (un
  // pathspec `.*` puede expandirse a .env). Lote G: git show HEAD:.env,
  // git show :.env, git log -p -- .env, git diff -- .env,
  // git diff HEAD -- .git/config pasan a 'ask'.
  for (const arg of filtered) {
    if (arg.startsWith('-')) continue
    const pathPart = gitArgPath(arg)
    if (/[?*[\]]/.test(pathPart)) return false
    if (isProtectedPath(pathPart)) return false
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
 * FAIL-CLOSED: si el workspace es inseguro (raíz de unidad o el HOME del
 * usuario) devuelve 'ask' AUNQUE haya un valor guardado de antes.
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

  // Workspace inseguro (home del usuario o raíz): SIEMPRE preguntar, incluso
  // con un permiso guardado de una sesión anterior. Sin home resuelto aún,
  // fail-closed igualmente (no se auto-aprueba nada)
  if (!homeDirCache || isUnsafeWorkspace(rootPath, homeDirCache)) {
    return decision
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
      decision.auto = isCommandSafe(options.command)
    }
  }

  return decision
}
