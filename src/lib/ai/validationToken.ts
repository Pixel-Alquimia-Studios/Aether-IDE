/**
 * Tokens de carrera para validaciones de keys en vuelo. Cada validación
 * arranca con `start(providerId)` que devuelve un token; el resultado SOLO
 * se aplica si `isValid(providerId, token)` sigue siendo true. Si el usuario
 * reemplaza/borra la key, cambia de proveedor o de host del custom mientras
 * corre, el resultado queda descartado.
 */
export interface ValidationTracker {
  start(providerId: string): number
  isValid(providerId: string, token: number): boolean
  discard(providerId: string): void
}

export function createValidationTracker(): ValidationTracker {
  let seq = 0
  const pending: Record<string, number> = {}
  return {
    start(providerId: string): number {
      const token = ++seq
      pending[providerId] = token
      return token
    },
    isValid(providerId: string, token: number): boolean {
      return pending[providerId] === token
    },
    discard(providerId: string): void {
      delete pending[providerId]
    },
  }
}
