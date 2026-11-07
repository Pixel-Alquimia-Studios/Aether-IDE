// Utilidades de arranque (Parte 3, v0.4.0): diferimiento post-primer-render,
// spawn diferido de la terminal, pantalla de carga mínima y marcas de
// rendimiento del arranque. Módulo puro y sin dependencias — testeable con Node.

/**
 * Ejecuta `cb` cuando el navegador está inactivo (post-primer-paint).
 * `requestIdleCallback` si existe; fallback a setTimeout de 1 s.
 * Solo invoca `cb` una vez.
 */
export function scheduleIdle(cb: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback
  if (typeof ric === 'function') {
    ric(() => cb())
  } else {
    setTimeout(cb, 1_000)
  }
}

/**
 * Cerrar la última terminal cierra el panel (transición, no estado inicial)
 */
export function panelShouldClose(prevCount: number, nextCount: number): boolean {
  return prevCount > 0 && nextCount === 0
}

// ============ Pantalla de carga (Lote H): duración mínima ============

/**
 * Mínimo de tiempo que el placeholder de index.html permanece visible desde
 * el arranque. Si el arranque real tarda más, NO se añade espera ninguna.
 * Cambia SOLO este valor para ajustar la duración.
 */
export const BOOT_MIN_MS = 1000

/**
 * Milisegundos que aún faltan para cumplir el mínimo desde `bootStartMs`.
 * Puro y testeable: devuelve 0 si el mínimo ya se cumplió (o se pasó).
 * Un reloj anómalo (now < start) se trata como arranque recién empezado.
 */
export function bootMinRemaining(bootStartMs: number, nowMs?: number): number {
  const now = nowMs ?? performance.now()
  const elapsed = Math.max(0, now - bootStartMs)
  return Math.max(0, BOOT_MIN_MS - elapsed)
}

// Estado del placeholder: guard de teclado instalado y retirado del DOM
let bootGuardCleanup: (() => void) | null = null
let bootRemoved = false

/**
 * Bloquea el teclado mientras el placeholder está visible (captura en window,
 * antes de los atajos de la app): sin Ctrl+J ni escrituras que disparen
 * acciones ocultas. Los clics ya no pasan: #boot cubre la ventana entera.
 */
export function installBootScreenGuard(): void {
  if (bootGuardCleanup) return
  const guard = (e: Event) => {
    if (!bootRemoved && document.getElementById('boot')) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }
  window.addEventListener('keydown', guard, { capture: true })
  bootGuardCleanup = () => {
    window.removeEventListener('keydown', guard, { capture: true })
    bootGuardCleanup = null
  }
}

/**
 * Retira el placeholder de index.html cuando se cumplan AMBAS condiciones:
 * React hizo su primer render (esta función se llama desde ese efecto) Y
 * han pasado BOOT_MIN_MS desde el arranque (la marca `aether:start`, o el
 * instante inyectado en tests). Si el arranque ya tardó más que el mínimo,
 * el retiro es inmediato (sin espera añadida al final). NO bloquea nada:
 * la restauración de sesión, Monaco y git siguen en vuelo detrás del
 * placeholder. Idempotente (StrictMode lo llama dos veces).
 */
export function removeBootScreenAfterMin(bootStartMs?: number): void {
  if (bootRemoved) return
  let start = bootStartMs
  if (start === undefined) {
    try {
      start = performance.getEntriesByName('aether:start')[0]?.startTime
    } catch {
      start = undefined
    }
  }
  if (start === undefined || Number.isNaN(start)) start = performance.now()
  const remove = () => {
    if (bootRemoved) return
    bootRemoved = true
    try {
      document.getElementById('boot')?.remove()
    } catch {
      // sin DOM (tests): nada que retirar
    }
    bootGuardCleanup?.()
    try {
      const elapsed = performance.now() - start
      console.info(
        `[aether arranque] pantalla de carga retirada ${fmt(elapsed)} (mínimo ${fmt(BOOT_MIN_MS)})`,
      )
    } catch {
      // medición best-effort
    }
  }
  const remaining = bootMinRemaining(start)
  if (remaining === 0) remove()
  else setTimeout(remove, remaining)
}

// ============ Marcas de arranque ============
// Hitos: aether:start (eval del módulo principal) → aether:first-render
// (primer commit de React) → aether:editor-usable (sesión restaurada).
// Log ÚNICO al completar el tercero; funciona igual en dev y prod.

let logged = false

export function markStartup(name: 'aether:start' | 'aether:first-render' | 'aether:editor-usable'): void {
  try {
    performance.mark(name)
  } catch {
    // entornos sin performance API: la medición es best-effort
  }
  logStartupIfComplete()
}

function fmt(ms: number): string {
  return `${Math.round(ms)}ms`
}

export function logStartupIfComplete(): void {
  if (logged) return
  const entries = (name: string) => performance.getEntriesByName(name)[0]
  const start = entries('aether:start')
  const render = entries('aether:first-render')
  const usable = entries('aether:editor-usable')
  if (!start || !render || !usable) return
  logged = true
  console.info(
    `[aether arranque] total ${fmt(usable.startTime - start.startTime)}` +
      ` | primer render ${fmt(render.startTime - start.startTime)}` +
      ` | restauración ${fmt(usable.startTime - render.startTime)}`,
  )
}
