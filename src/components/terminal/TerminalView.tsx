import { useEffect, useRef } from 'react'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { listen } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'

import { useWorkspaceStore } from '@/stores/workspaceStore'

// Terminal integrada (Fase 4.4): xterm.js conectado a un PTY nativo en Rust
// vía eventos 'terminal-output' y comandos terminal_write/resize/kill.

export function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

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
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const root = useWorkspaceStore.getState().rootPath ?? '.'
    let unlistenOutput: (() => void) | null = null
    let cancelled = false

    void invoke<string>('terminal_spawn', { cwd: root, rows: term.rows, cols: term.cols })
      .then((id) => {
        if (cancelled) {
          void invoke('terminal_kill', { terminalId: id })
          return
        }
        terminalIdRef.current = id
        void listen<{ terminalId: string; data: string }>('terminal-output', (event) => {
          if (event.payload.terminalId === terminalIdRef.current) {
            term.write(event.payload.data)
          }
        }).then((fn) => {
          if (cancelled) fn()
          else unlistenOutput = fn
        })
      })
      .catch((e) => {
        term.write(`\r\nError iniciando la terminal: ${e}\r\n`)
      })

    // Input del usuario → PTY
    term.onData((data) => {
      if (terminalIdRef.current) {
        void invoke('terminal_write', { terminalId: terminalIdRef.current, data })
      }
    })

    // Resize del contenedor → fit + PTY resize, con rAF-debounce para
    // silenciar "ResizeObserver loop completed with undelivered notifications"
    let rafHandle: number | null = null
    const resizeHandler = (): void => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle)
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null
        // Solo fit si el contenedor es visible (evita fits con tamaño 0)
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
        void invoke('terminal_resize', { terminalId: terminalIdRef.current, rows, cols })
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
      if (terminalIdRef.current) {
        void invoke('terminal_kill', { terminalId: terminalIdRef.current })
      }
      term.dispose()
    }
  }, [])

  if (!isTauri()) {
    return (
      <div className="flex h-full items-center justify-center text-aether-text-dim">
        La terminal requiere la app de escritorio (Tauri)
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full px-1" />
}
