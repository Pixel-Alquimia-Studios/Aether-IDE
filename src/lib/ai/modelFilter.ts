import type { ModelInfo } from '@/types/ai'

/**
 * Filtra el catálogo de modelos por id y nombre (si el proveedor lo publica),
 * case-insensitive. Con query vacía devuelve el catálogo completo.
 * Sin dependencias: la búsqueda es includes sobre strings normalizados.
 */
export function filterModels(models: ModelInfo[], query: string): ModelInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return models
  return models.filter(
    (m) => m.id.toLowerCase().includes(q) || (m.name?.toLowerCase().includes(q) ?? false),
  )
}
