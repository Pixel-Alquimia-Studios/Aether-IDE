// Capa de datos del buscador UX (fase 2, v0.4.0): separada del motor puro
// (designSearch.ts) porque usa import.meta.glob de Vite â€” asÃ­ el motor sigue
// siendo testeable con Node directo.
//
// Carga perezosa: los ~414 KB de CSV quedan en chunks separados y solo se
// descargan la primera vez que se usa design_search (no inflan el arranque).
// Los CSV viven en src/resources/ux/data/ (copiados de ui-ux-pro-max, MIT) â€”
// la carpeta de referencia original estÃ¡ gitignoreada y NUNCA se lee en
// runtime ni en build.

import {
  parseCsv,
  searchRows,
  formatResult,
  UX_DOMAINS,
  detectDomain,
  DOMAIN_CONFIG,
} from './designSearch.ts'
import type { CsvRow } from './designSearch.ts'

// RUTA (fix v0.4.0): dos niveles desde src/lib/agent/ hasta src/resources/.
// La llamada vive en una función e inicializa perezosamente: import.meta.glob
// solo existe en Vite — en el smoke test de Node el loader se inyecta con
// setUxLoadersForTests y esta función jamás se invoca.
function viteGlob(): Record<string, () => Promise<string>> {
  return import.meta.glob('../../resources/ux/data/*.csv', {
    query: '?raw',
    import: 'default',
  }) as unknown as Record<string, () => Promise<string>>
}

// Inyección para el smoke test en Node (import.meta.glob no existe fuera de
// Vite): el test alimenta los MISMO loaders con los bytes de los CSV y pasa
// por searchUx, el camino exacto de la herramienta
let loaderOverride: Record<string, () => Promise<string>> | null = null
export function setUxLoadersForTests(loaders: Record<string, () => Promise<string>> | null): void {
  loaderOverride = loaders
}

let appLoaders: Record<string, () => Promise<string>> | null = null
function activeLoaders(): Record<string, () => Promise<string>> {
  if (loaderOverride) return loaderOverride
  if (!appLoaders) appLoaders = viteGlob()
  return appLoaders
}

const rowsCache = new Map<string, CsvRow[]>()

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

async function loadRows(domain: string): Promise<CsvRow[]> {
  const file = DOMAIN_CONFIG[domain]?.file
  if (!file) {
    throw new Error(
      `design_search: dominio '${domain}' desconocido. Dominios disponibles: ${UX_DOMAINS.join(', ')}`,
    )
  }
  const cached = rowsCache.get(file)
  if (cached) return cached
  for (const [path, loader] of Object.entries(activeLoaders())) {
    if (fileName(path) !== file) continue
    const raw = (await loader()) as string
    const rows = parseCsv(raw)
    if (rows.length === 0) {
      throw new Error(
        `design_search: el archivo '${file}' del dominio '${domain}' estÃ¡ vacÃ­o o no se pudo interpretar`,
      )
    }
    rowsCache.set(file, rows)
    return rows
  }
  throw new Error(
    `design_search: dominio '${domain}' â†’ archivo esperado '${file}' no estÃ¡ empaquetado. ` +
      `Dominios disponibles: ${UX_DOMAINS.join(', ')}`,
  )
}

/**
 * BÃºsqueda UX empaquetada: carga los CSV bajo demanda y devuelve texto
 * formateado para el LLM. Dominios: style, color, typography, ux, charts,
 * icons, ui-reasoning (auto-detectados si no se especifican).
 */
export async function searchUx(
  query: string,
  domain?: string,
  maxResults = 3,
): Promise<string> {
  const trimmed = query.trim()
  if (!trimmed) return 'Error: query vacÃ­a'
  let searchDomain = domain?.trim().toLowerCase()
  if (searchDomain && !UX_DOMAINS.includes(searchDomain)) {
    return `Error: dominio desconocido '${searchDomain}'. Dominios: ${UX_DOMAINS.join(', ')}`
  }

  const rowsByDomain: Record<string, CsvRow[]> = {}

  if (searchDomain) {
    // La resoluciÃ³n dominioâ†’archivo vive en DOMAIN_CONFIG (tabla Ãºnica)
    rowsByDomain[searchDomain] = await loadRows(searchDomain)
  } else {
    // Auto-detecciÃ³n: carga style (atajo de identidad exacta, como el
    // original) y el dominio detectado si es otro
    rowsByDomain.style = await loadRows('style')
    searchDomain = detectDomain(trimmed).domain
    if (searchDomain !== 'style' && !rowsByDomain[searchDomain]) {
      rowsByDomain[searchDomain] = await loadRows(searchDomain)
    }
  }

  const result = searchRows(rowsByDomain, trimmed, searchDomain, maxResults)
  return formatResult(result)
}
