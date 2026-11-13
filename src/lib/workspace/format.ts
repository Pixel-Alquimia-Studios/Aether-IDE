// Utilidades de rutas del workspace (0.4.1-B). Módulo puro y sin dependencias
// — testeable con Node directo.

/**
 * Formatea una ruta SOLO PARA MOSTRAR (UI y contexto del modelo).
 *
 * - `\\?\C:\x`  → `C:\x`      (prefijo verbatim de Windows)
 * - `\\?\UNC\srv\share` → `\\srv\share`
 * - Cualquier otra ruta pasa tal cual.
 *
 * IMPORTANTE: el resultado NUNCA se usa como clave de estado ni para
 * comparar rutas — para eso están las rutas internas tal cual llegan
 * (pestañas, checkpoints de Time Travel, estado de Git, menciones y
 * rollback siguen usando la cadena original). Rust aplica la contención
 * real con canonicalize, no con esta función.
 */
export function formatDisplayPath(p: string): string {
  if (!p) return p
  if (p.startsWith('\\\\?\\UNC\\')) return '\\' + p.slice(7)
  if (p.startsWith('\\\\?\\')) return p.slice(4)
  return p
}

/**
 * Resuelve la ruta pedida por el modelo contra la raíz del workspace.
 *
 * - `''`, `'.'` y `'./'` son la RAÍZ del workspace (las herramientas de
 *   análisis las aceptan como raíz).
 * - Una ruta absoluta (drive, UNC o `/`) pasa tal cual: la contención REAL
 *   la aplica Rust con `ensure_in_workspace` (canonicalize) — esta función
 *   jamás la salta.
 * - Una ruta con prefijo `\\?\` se NORMALIZA (se quita el prefijo) antes de
 *   decidir: el backend la recibe limpia y sigue conteniendo.
 *
 * NO trata `/` como raíz del workspace: una ruta que empieza por `/` es
 * absoluta (Unix) y pasa tal cual para que Rust la rechace si sale del
 * workspace.
 */
export function resolvePath(path: string, root: string): string {
  let p = (path ?? '').trim()
  // Normaliza el prefijo verbatim antes de decidir (nunca salta contención:
  // Rust re-canonicaliza y verifica el prefijo real)
  if (p.startsWith('\\\\?\\UNC\\')) p = '\\' + p.slice(7)
  else if (p.startsWith('\\\\?\\')) p = p.slice(4)
  if (!p || p === '.' || p === './') return root
  if (p.startsWith('./')) p = p.slice(2)
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/')) return p
  return `${root.replace(/[\\/]+$/, '')}/${p}`
}
