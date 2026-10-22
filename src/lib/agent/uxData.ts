// Capa de datos del buscador UX (fase 2, v0.4.0): separada del motor puro
// (designSearch.ts) porque usa import.meta.glob de Vite — así el motor sigue
// siendo testeable con Node directo.
//
// Carga perezosa: los ~414 KB de CSV quedan en chunks separados y solo se
// descargan la primera vez que se usa design_search (no inflan el arranque).
// Los CSV viven en src/resources/ux/data/ (copiados de ui-ux-pro-max, MIT) —
// la carpeta de referencia original está gitignoreada y NUNCA se lee en
// runtime ni en build.

import { parseCsv, searchRows, formatResult, UX_DOMAINS, detectDomain } from '@/lib/agent/designSearch'
import type { CsvRow } from '@/lib/agent/designSearch'

// RUTA (fix v0.4.0): dos niveles desde src/lib/agent/ hasta src/resources/
const LOADERS = import.meta.glob('../../resources/ux/data/*.csv', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

const rowsCache = new Map<string, CsvRow[]>()

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

async function loadRows(file: string): Promise<CsvRow[]> {
  const cached = rowsCache.get(file)
  if (cached) return cached
  for (const [path, loader] of Object.entries(LOADERS)) {
    if (fileName(path) !== file) continue
    const raw = (await loader()) as string
    const rows = parseCsv(raw)
    rowsCache.set(file, rows)
    return rows
  }
  throw new Error(`Datos UX no encontrados: ${file}`)
}

/**
 * Búsqueda UX empaquetada: carga los CSV bajo demanda y devuelve texto
 * formateado para el LLM. Dominios: style, color, typography, ux, charts,
 * icons, ui-reasoning (auto-detectados si no se especifican).
 */
export async function searchUx(
  query: string,
  domain?: string,
  maxResults = 3,
): Promise<string> {
  const trimmed = query.trim()
  if (!trimmed) return 'Error: query vacía'
  let searchDomain = domain?.trim().toLowerCase()
  if (searchDomain && !UX_DOMAINS.includes(searchDomain)) {
    return `Error: dominio desconocido '${searchDomain}'. Dominios: ${UX_DOMAINS.join(', ')}`
  }

  const rowsByDomain: Record<string, CsvRow[]> = {}

  if (searchDomain) {
    rowsByDomain[searchDomain] = await loadRows(`${searchDomain}.csv`)
  } else {
    // Auto-detección: carga style (atajo de identidad exacta, como el
    // original) y el dominio detectado si es otro
    rowsByDomain.style = await loadRows('styles.csv')
    searchDomain = detectDomain(trimmed).domain
    if (searchDomain !== 'style' && !rowsByDomain[searchDomain]) {
      rowsByDomain[searchDomain] = await loadRows(`${searchDomain}.csv`)
    }
  }

  const result = searchRows(rowsByDomain, trimmed, searchDomain, maxResults)
  return formatResult(result)
}
