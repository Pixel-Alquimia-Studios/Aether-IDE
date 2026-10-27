import { useEffect, useRef, useState } from 'react'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { invoke } from '@tauri-apps/api/core'

import {
  useTerminalStore,
  subscribeOutput,
  drainPending,
  initListeners,
} from '@/stores/terminalStore'
import type { TerminalEntry } from '@/stores/terminalStore'
import { useT } from '@/lib/i18n'
import { useWorkspaceStore } from '@/stores/workspaceStore'

// Terminal integrada (Fase 4.4): xterm.js conectado a un PTY nativo en Rust.
//
// v0.3.1 (lote 3): 'terminal-exited' + botón ↻ + resize sincronizado.
// v0.4.0 (Lote B): CONEXIÓN POR ID — el store crea la PTY (spawn diferido al
// pulsar +) y esta vista se suscribe al output de su id, replayerando el
// buffer pendiente (el prompt inicial no se pierde). Cada terminal es una
// instancia montada; la activa se muestra por CSS (B4: las ocultas viven).
// fix(Lote B): initListeners se llama al montar la primera instancia (antes
// NUNCA se llamaba → output perdido). Errores de spawn visibles con ↻ y
// timeout de conexión de 5 s (nunca "conectando…" infinito).

const CONNECT_TIMEOUT_MS = 5_000

export function TerminalView({
  terminal,
  active,
}: {
  terminal: TerminalEntry
  active: boolean
}) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(terminal.id ?? null)
  terminalIdRef.current = terminal.id ?? null
  const [exited, setExited] = useState(terminal.status === 'exited')
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  // Registrar los listeners CENTRALES de terminal-output/terminal-exited al
  // montar la primera instancia (fix: antes NUNCA se llamaban → output perdido)
  useEffect(() => {
    initListeners()
  }, [])

  // Cambio de workspace: reinicia la shell con el cwd del nuevo proyecto
  const firstRunRef = useRef(true)
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    if (terminal.status === 'exited') return
    useTerminalStore.getState().restart(terminal.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath])

  // Crear xterm una vez por instancia (montada siempre; activa visible)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const term = new Terminal({
      theme: {
        background: '#16161d',
        foreground: '#d4d4d8',
        cursor: '#a78bfa',
        selectionBackground: '#a78bfa44',
      },
      fontSize: 12,
      fontFamily: "'Cascadia Code', Consolas, monospace",
      cursorBlink: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    try {
      fit.fit()
    } catch {
      // contenedor sin dimensiones aún (instancia no activa)
    }
    termRef.current = term
    fitRef.current = fit

    let rafHandle: number | null = null
    const resizeHandler = (): void => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle)
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null
        if (containerRef.current && containerRef.current.clientWidth > 0) {
          try {
            fitRef.current?.fit()
          } catch {
            // fit puede fallar si el contenedor aún no tiene dimensiones
          }
        }
      })
    }
    term.onData((data) => {
      const id = terminalIdRef.current
      if (id) {
        invoke('terminal_write', { terminalId: id, data }).catch(() => undefined)
      }
    })
    term.onResize(({ rows, cols }) => {
      const id = terminalIdRef.current
      if (id) {
        invoke('terminal_resize', { terminalId: id, rows, cols }).catch(() => undefined)
      }
    })
    const observer = new ResizeObserver(resizeHandler)
    observer.observe(container)

    return () => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle)
      observer.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [])

  // Conexión por id: suscripción al output central + replay del buffer
  useEffect(() => {
    if (!terminal.id) return
    const unOutput = subscribeOutput(terminal.id, (data) => {
      termRef.current?.write(data)
    })
    const buffered = drainPending(terminal.id)
    if (buffered) termRef.current?.write(buffered)
    return unOutput
  }, [terminal.id])

  // Timeout de conexión (Parte 3 fix): si la PTY no entrega id en 5 s → error
  useEffect(() => {
    if (terminal.status !== 'creating' || terminal.id) return
    const timer = setTimeout(() => {
      const current = useTerminalStore.getState().terminals.find((t) => t.key === terminal.key)
      if (current && current.status === 'creating' && !current.id) {
        useTerminalStore
          .getState()
          .markError(terminal.key, `${t('term.connectTimeout')} (${CONNECT_TIMEOUT_MS / 1000}s)`)
      }
    }, CONNECT_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal.status, terminal.id, terminal.key])

  // Proceso terminado (llegó terminal-exited) → aviso en el buffer
  useEffect(() => {
    setExited(terminal.status === 'exited')
    if (terminal.status === 'exited') {
      termRef.current?.writeln('')
      termRef.current?.writeln(`\x1b[90m[${t('term.terminado')}]\x1b[0m`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal.status])

  // Al activarse: fit (la instancia pudo estar oculta con dimensiones 0)
  useEffect(() => {
    if (!active) return
    const raf = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        // sin dimensiones aún
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [active])

  const isCreating = terminal.status === 'creating' && !terminal.id
  const hasError = terminal.status === 'exited' && !!terminal.error

  return (
    <div className="relative h-full w-full px-1">
      <div ref={containerRef} className="h-full w-full" data-tid={terminal.id ?? 'conectando'} />
      {isCreating && !hasError && (
        <div className="absolute top-1 right-2 text-[10px] text-aether-text-dim">
          {t('term.conectando')}
        </div>
      )}
      {hasError && (
        <div className="absolute inset-x-2 bottom-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-400">
          <p className="min-w-0 break-words">{terminal.error}</p>
          <button
            title={t('term.restart')}
            onClick={() => useTerminalStore.getState().restart(terminal.key)}
            className="mt-1 rounded border border-red-500/40 px-2 py-0.5 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
          >
            ↻ {t('term.restart')}
          </button>
        </div>
      )}
      {/* Reiniciar con el MISMO shell de esta terminal (req. 6) */}
      {!hasError && (
        <button
          title={t('term.restart')}
          onClick={() => useTerminalStore.getState().restart(terminal.key)}
          className={`absolute top-1 right-2 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            exited
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'bg-white/[0.06] text-aether-text-dim hover:bg-white/10 hover:text-aether-text'
          }`}
        >
          ↻ {t('term.restart')}
        </button>
      )}
    </div>
  )
}
