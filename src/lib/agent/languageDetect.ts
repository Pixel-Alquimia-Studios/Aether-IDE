// Detección de lenguajes del proyecto (fase 4, v0.4.0) para la carga
// condicional de skills. Cálculo BARATO y determinista: sin red, sin comandos,
// solo el fileTree ya cargado en el workspace + las pestañas abiertas.
//
// Se calcula UNA VEZ por invocación del subagente (en agentStore.runAgent,
// ANTES de armar el system prompt) para que el prefijo sea estable y cacheable.

import type { FileNode } from '../../types/workspace'

// ============ Tabla única extensión -> lenguaje ============
// Ampliable: añadir entradas aquí es todo lo que hace falta para soportar un
// lenguaje nuevo en la detección por extensión.
export const EXT_LANGUAGE: Record<string, string> = {
  // TypeScript / JavaScript (ecosistema TS)
  ts: 'typescript',
  tsx: 'typescript',
  js: 'typescript',
  jsx: 'typescript',
  mjs: 'typescript',
  cjs: 'typescript',
  // Rust
  rs: 'rust',
  // Python
  py: 'python',
  pyi: 'python',
  // Go
  go: 'go',
  // Java
  java: 'java',
  // Kotlin (SOLO .kt — build.gradle.kts NO cuenta: ver marcadores)
  kt: 'kotlin',
  // C++ (y C como parte del ecosistema C++)
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  c: 'cpp',
  h: 'cpp',
  // Ruby
  rb: 'ruby',
  rake: 'ruby',
  erb: 'ruby',
}

// ============ Marcadores de raíz -> lenguaje ============
// Archivos que, si están en la RAÍZ del workspace, delatan el lenguaje.
export const ROOT_MARKERS: Record<string, string> = {
  'pyproject.toml': 'python',
  'requirements.txt': 'python',
  Pipfile: 'python',
  'setup.py': 'python',
  'go.mod': 'go',
  'pom.xml': 'java',
  'build.gradle': 'java',
  // build.gradle.kts -> java (si el proyecto es Kotlin real, los .kt lo
  // detectan por extensión; regla del plan: KTS solo es Kotlin con .kt)
  'build.gradle.kts': 'java',
  'settings.gradle.kts': 'java',
  'CMakeLists.txt': 'cpp',
  Gemfile: 'ruby',
  'Cargo.toml': 'rust',
  'package.json': 'typescript',
}

// Directorios excluidos de la detección (defensa en profundidad: el fileTree
// ya no los incluye, pero las pestañas abiertas podrían apuntar dentro)
const EXCLUDED_SEGMENTS = ['node_modules', 'target', 'dist', 'build', '.git', '.venv', '__pycache__']

function isExcluded(path: string): boolean {
  const normalized = path.replace(/[\\/]+/g, '/')
  return EXCLUDED_SEGMENTS.some(
    (seg) => normalized.includes(`/${seg}/`) || normalized.includes(`/${seg}`) && normalized.endsWith(`/${seg}`),
  )
}

// ============ Detección ============

function detectFromTree(nodes: FileNode[], depth: number, found: Set<string>, isRoot: boolean): void {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      // Marcadores solo en la RAÍZ del workspace
      if (isRoot && ROOT_MARKERS[node.name]) {
        found.add(ROOT_MARKERS[node.name])
      }
      if (node.children) {
        detectFromTree(node.children, depth + 1, found, false)
      }
      continue
    }
    // Archivo: marcador en raíz (ej. requirements.txt) o por extensión
    if (isRoot && ROOT_MARKERS[node.name]) {
      found.add(ROOT_MARKERS[node.name])
    }
    const ext = node.name.includes('.') ? (node.name.split('.').pop() ?? '').toLowerCase() : ''
    const lang = EXT_LANGUAGE[ext]
    if (lang) found.add(lang)
  }
}

/**
 * Detecta los lenguajes del proyecto UNA vez por invocación de subagente.
 * Fuentes (baratas, sin red):
 *   - fileTree completo (hasta profundidad 8; ya excluye node_modules/target/dist)
 *   - pestañas abiertas del editor (por extensión; se ignoran rutas dentro de
 *     directorios excluidos)
 */
export function detectProjectLanguages(
  fileTree: FileNode[],
  openTabPaths: string[],
): Set<string> {
  const found = new Set<string>()
  try {
    detectFromTree(fileTree, 0, found, true)
  } catch {
    // Árbol anómalo: seguimos con las pestañas
  }
  for (const tabPath of openTabPaths) {
    if (isExcluded(tabPath)) continue
    const name = tabPath.split(/[\\/]/).pop() ?? ''
    const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
    const lang = EXT_LANGUAGE[ext]
    if (lang) found.add(lang)
  }
  return found
}
