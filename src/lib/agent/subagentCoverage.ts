// Cobertura de revisión para los subagentes de solo lectura (0.4.1-C).
// Módulo PURO y sin dependencias — testeable con Node directo.
//
// Objetivo: que un subagente no concluya "revisión limpia" sin haber leído
// los archivos de código del alcance. El bucle (agentStore) registra qué
// archivos leyó y este módulo decide qué hacer con la respuesta final:
// recordatorio (máx 2), cierre como parcial, o aceptar.

export const MAX_SCOPE_FOR_REMINDERS = 30
export const MAX_REMINDERS = 2
export const MAX_ROUTES_PER_REMINDER = 15
/** Tope de llamadas a herramientas por ejecución de subagente */
export const MAX_TOOL_CALLS_SUBAGENT = 60

// Extensiones de código que cuentan para el alcance
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'rs', 'py', 'go', 'java', 'kt',
  'rb', 'php', 'cs', 'c', 'cpp', 'h', 'hpp', 'swift', 'vue', 'svelte',
  'scala', 'dart',
])

// Lockfiles que NO cuentan como código
const LOCKFILES = new Set([
  'package-lock.json', 'cargo.lock', 'yarn.lock', 'pnpm-lock.yaml',
  'poetry.lock', 'gemfile.lock', 'composer.lock',
])

// Directorios excluidos del alcance (segmentos de ruta)
const EXCLUDED_DIRS = new Set([
  'node_modules', 'target', 'dist', 'build', 'out', '.next', '.venv',
  '__pycache__', 'coverage', 'vendor', '.git',
])

/**
 * Normaliza una ruta interna para comparaciones de cobertura:
 * relativa a la raíz, barras unificadas, minúsculas (Windows).
 * Las comparaciones usan esta forma, NUNCA formatDisplayPath.
 */
export function normalizeForCoverage(resolvedPath: string, root: string): string {
  let p = resolvedPath.replace(/\\/g, '/').toLowerCase()
  const r = root.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
  if (p.startsWith(r + '/')) p = p.slice(r.length + 1)
  return p.replace(/^\/+/, '')
}

/** ¿El archivo cuenta para el alcance de revisión? */
export function isCodeFile(relativePath: string): boolean {
  const p = relativePath.toLowerCase()
  const segments = p.split('/')
  const name = segments[segments.length - 1] ?? ''
  if (segments.some((s) => EXCLUDED_DIRS.has(s))) return false
  if (LOCKFILES.has(name)) return false
  if (name.endsWith('.min.') || p.includes('.min.')) return false
  if (name.endsWith('.d.ts')) return false
  if (name.endsWith('.generated.') || /\.generated\.[a-z]+$/.test(name)) return false
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : ''
  return CODE_EXTENSIONS.has(ext)
}

/**
 * Alcance de revisión a partir de los paths internos del fileTree.
 * Devuelve rutas relativas normalizadas.
 */
export function codeScope(paths: string[], root: string): string[] {
  const out = new Set<string>()
  for (const abs of paths) {
    const rel = normalizeForCoverage(abs, root)
    if (!rel || !isCodeFile(rel)) continue
    out.add(rel)
  }
  return [...out].sort()
}

/** Archivos del alcance que NO se han leído */
export function pendingForReview(scope: string[], read: Set<string>): string[] {
  return scope.filter((f) => !read.has(f))
}

export interface CoverageDecision {
  /** 'remind' = no aceptar la respuesta y pedir lectura; 'accept-partial' = aceptar marcando parcial; 'accept' = aceptar normal */
  action: 'accept' | 'remind' | 'accept-partial'
  /** Pendientes totales (para el contador de la tarjeta) */
  missing: string[]
  /** Rutas que se muestran en el mensaje de recordatorio */
  shown: string[]
  /** Cuántas quedaron fuera del mensaje ("y N más") */
  hiddenCount: number
}

/**
 * Decide qué hacer con la respuesta final del subagente según la cobertura.
 * - Alcance > MAX_SCOPE_FOR_REMINDERS → sin recordatorios: parcial directo.
 * - Sin pendientes → aceptar normal.
 * - Pendientes y recordatorios < MAX_REMINDERS → recordatorio.
 * - Recordatorios agotados → aceptar como parcial.
 * - `hasContextHeadroom` false (historial > 70% del contexto del modelo) →
 *   sin recordatorios: parcial directo.
 */
export function decideCoverage(
  scope: string[],
  read: Set<string>,
  reminders: number,
  hasContextHeadroom: boolean,
): CoverageDecision {
  const missing = pendingForReview(scope, read)
  if (missing.length === 0) {
    return { action: 'accept', missing: [], shown: [], hiddenCount: 0 }
  }
  const partial = {
    action: 'accept-partial' as const,
    missing,
    shown: missing.slice(0, MAX_ROUTES_PER_REMINDER),
    hiddenCount: Math.max(0, missing.length - MAX_ROUTES_PER_REMINDER),
  }
  if (scope.length > MAX_SCOPE_FOR_REMINDERS) return partial
  if (!hasContextHeadroom) return partial
  if (reminders >= MAX_REMINDERS) return partial
  return { action: 'remind', missing, shown: partial.shown, hiddenCount: partial.hiddenCount }
}

/**
 * Detección de repetición: la misma herramienta con los mismos argumentos
 * N veces seguidas. 3ª consecutiva → aviso; 4ª → cerrar.
 */
export interface RepeatState {
  key: string
  count: number
}

export function trackRepeat(
  prev: RepeatState | null,
  name: string,
  args: unknown,
): { state: RepeatState; warn: boolean; stop: boolean } {
  const key = name + '|' + JSON.stringify(args ?? {})
  if (prev && prev.key === key) {
    const count = prev.count + 1
    return { state: { key, count }, warn: count === 3, stop: count >= 4 }
  }
  return { state: { key, count: 1 }, warn: false, stop: false }
}
