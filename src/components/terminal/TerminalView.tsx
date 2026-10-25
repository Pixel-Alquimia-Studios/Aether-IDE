import { useEffect, useRef, useState } from 'react'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { invoke } from '@tauri-apps/api/core'

import { useTerminalStore, subscribeOutput, drainPending } from '@/stores/terminalStore'
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

  return (
    <div className="relative h-full w-full px-1">
      <div ref={containerRef} className="h-full w-full" data-tid={terminal.id ?? 'conectando'} />
      {!terminal.id && terminal.status === 'creating' && (
        <div className="absolute top-1 right-2 text-[10px] text-aether-text-dim">
          {t('term.conectando')}
        </div>
      )}
      {/* Reiniciar con el MISMO shell de esta terminal (req. 6) */}
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
    </div>
  )
}
