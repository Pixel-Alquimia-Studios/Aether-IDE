// Utilidades de arranque (Parte 3, v0.4.0): diferimiento post-primer-render,
// spawn diferido de la terminal y marcas de rendimiento del arranque.
// Módulo puro y sin dependencias — testeable con Node directo.

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
 * Lógica del spawn diferido de la terminal (TerminalView):
 * la PTY se crea la PRIMERA vez que el panel se hace visible (o al montar si
 * la sesión restaurada lo tenía abierto); una vez creada sobrevive a
 * ocultar/mostrar el panel (B4) — solo muere al desmontar o cambiar de workspace.
 */
export function shouldSpawnTerminal(visible: boolean, alreadySpawned: boolean): boolean {
  return visible && !alreadySpawned
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
