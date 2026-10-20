import { useEffect, useRef, useState } from 'react'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { listen } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'

import { useWorkspaceStore } from '@/stores/workspaceStore'

// Terminal integrada (Fase 4.4): xterm.js conectado a un PTY nativo en Rust
// vía eventos 'terminal-output' y comandos terminal_write/resize/kill.
//
// v0.3.1 (lote 3): escucha 'terminal-exited' (M13 — la shell muerta ya no
// traga teclas ni spamea rechazos), reintenta el resize perdido tras el spawn
// y ofrece botón de reinicio. El componente lo monta App SIEMPRE (oculto con
// CSS al cerrar el panel — B4: la PTY sobrevive a Ctrl+J).

export function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Sesión: al reiniciar (botón ↻ o cambio de workspace) se remonta el efecto
  const [session, setSession] = useState(0)
  const [exited, setExited] = useState(false)
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  // Cambio de workspace: reinicia la shell con el cwd del nuevo proyecto
  const firstRunRef = useRef(true)
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    setExited(false)
    setSession((s) => s + 1)
  }, [rootPath])

  useEffect(() => {
    if (!isTauri()) return
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      theme: {
        background: '#1e1f26',
        foreground: '#d4d4d8',
        cursor: '#aa3bff',
        selectionBackground: '#aa3bff44',
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
      // fit puede fallar si el contenedor aún no tiene dimensiones
    }
    termRef.current = term
    fitRef.current = fit

    const root = useWorkspaceStore.getState().rootPath ?? ''
    const spawnRows = term.rows
    const spawnCols = term.cols
    let unlistenOutput: (() => void) | null = null
    let unlistenExited: (() => void) | null = null
    let cancelled = false

    void invoke<string>('terminal_spawn', { cwd: root, rows: spawnRows, cols: spawnCols })
      .then((id) => {
        if (cancelled) {
          void invoke('terminal_kill', { terminalId: id })
          return
        }
        terminalIdRef.current = id
        // M13: resize perdido — si el contenedor cambió de tamaño mientras
        // el spawn estaba en vuelo, sincroniza el PTY con xterm ahora
        if (term.rows !== spawnRows || term.cols !== spawnCols) {
          void invoke('terminal_resize', {
            terminalId: id,
            rows: term.rows,
            cols: term.cols,
          }).catch(() => undefined)
        }
        void listen<{ terminalId: string; data: string }>('terminal-output', (event) => {
          if (event.payload.terminalId === terminalIdRef.current) {
            term.write(event.payload.data)
          }
        }).then((fn) => {
          if (cancelled) fn()
          else unlistenOutput = fn
        })
        // M13: la shell terminó → deja de escribir a un PTY muerto
        void listen<string>('terminal-exited', (event) => {
          if (event.payload !== terminalIdRef.current) return
          terminalIdRef.current = null
          setExited(true)
          term.write('\r\n\x1b[90m[Proceso terminado]\x1b[0m\r\n')
        }).then((fn) => {
          if (cancelled) fn()
          else unlistenExited = fn
        })
      })
      .catch((e) => {
        term.write(`\r\nError iniciando la terminal: ${e}\r\n`)
      })

    // Input del usuario → PTY (silencioso si la sesión ya murió)
    term.onData((data) => {
      if (terminalIdRef.current) {
        invoke('terminal_write', { terminalId: terminalIdRef.current, data }).catch(
          () => undefined,
        )
      }
    })

    // Resize del contenedor → fit + PTY resize, con rAF-debounce para
    // silenciar "ResizeObserver loop completed with undelivered notifications"
    let rafHandle: number | null = null
    const resizeHandler = (): void => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle)
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null
        // Solo fit si el contenedor es visible (evita fits con tamaño 0;
        // el panel oculto con CSS tiene clientWidth 0 — B4)
        if (containerRef.current && containerRef.current.clientWidth > 0) {
          try {
            fitRef.current?.fit()
          } catch {
            // fit puede fallar si el contenedor aún no tiene dimensiones
          }
        }
      })
    }
    term.onResize(({ rows, cols }) => {
      if (terminalIdRef.current) {
        invoke('terminal_resize', { terminalId: terminalIdRef.current, rows, cols }).catch(
          () => undefined,
        )
      }
    })
    window.addEventListener('resize', resizeHandler)
    const observer = new ResizeObserver(resizeHandler)
    observer.observe(container)

    return () => {
      cancelled = true
      if (rafHandle !== null) cancelAnimationFrame(rafHandle)
      window.removeEventListener('resize', resizeHandler)
      observer.disconnect()
      unlistenOutput?.()
      unlistenExited?.()
      if (terminalIdRef.current) {
        invoke('terminal_kill', { terminalId: terminalIdRef.current }).catch(() => undefined)
      }
      terminalIdRef.current = null
      term.dispose()
    }
  }, [session])

  if (!isTauri()) {
    return (
      <div className="flex h-full items-center justify-center text-aether-text-dim">
        La terminal requiere la app de escritorio (Tauri)
      </div>
    )
  }

  return (
    <div className="relative h-full w-full px-1">
      <div ref={containerRef} className="h-full w-full" />
      {/* M13: reiniciar la shell (tras un exit o cuando el usuario quiera) */}
      <button
        title="Reiniciar terminal"
        onClick={() => {
          setExited(false)
          setSession((s) => s + 1)
        }}
        className={`absolute top-1 right-2 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
          exited
            ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
            : 'bg-white/[0.06] text-aether-text-dim hover:bg-white/10 hover:text-aether-text'
        }`}
      >
        ↻ Reiniciar
      </button>
    </div>
  )
}
