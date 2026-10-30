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

const PROTECTED_PATTERNS = [/^\.git\//, /^\.github\//, /^\.vscode\//, /^\.env/]

/**
 * ¿La ruta (relativa al workspace) es una ruta protegida que SIEMPRE
 * requiere confirmación, incluso con permiso 'allow'?
 */
export function isProtectedPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/[\\/]+/g, '/').toLowerCase()
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized))
}

// ============ Allowlist de execute en modo 'safe' ============

/** Comandos de inspección SIN efectos secundarios permitidos en modo 'safe' */
const SAFE_COMMANDS = new Set([
  'git status', 'git diff', 'git log', 'git show', 'git branch', 'git tag',
  'ls', 'ls -la', 'ls -l', 'ls -al', 'dir', 'dir /b',
  'cat', 'type', 'head', 'tail', 'wc',
  'pwd', 'whoami', 'hostname', 'date', 'echo',
])

/**
 * Parser que FALLA CERRADO: determina si un comando es seguro para
 * auto-ejecución en modo 'safe'. Cualquier duda → false (pregunta).
 *
 * Rechaza: redirecciones, subshells, backticks, background &, encoded,
 * comillas sin cerrar, y comandos que no están en la allowlist.
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
  const normalized = segment.replace(/\s+/g, ' ').trim().toLowerCase()
  for (const safe of SAFE_COMMANDS) {
    if (normalized === safe) return true
    if (normalized.startsWith(safe + ' ')) {
      if (safe.startsWith('git ') || ['ls', 'cat', 'type', 'head', 'tail'].includes(safe)) {
        return true
      }
      if (['echo', 'pwd', 'whoami', 'date'].includes(safe)) return true
    }
  }
  return false
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
      decision.auto = isCommandSafe(options.command)
    }
  }

  return decision
}
