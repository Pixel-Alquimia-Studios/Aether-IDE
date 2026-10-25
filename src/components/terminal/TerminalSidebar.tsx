import { useEffect, useRef, useState } from 'react'

import { useTerminalStore, canOpenTerminal } from '@/stores/terminalStore'
import { useT } from '@/lib/i18n'

// Barra lateral derecha del panel de terminal (Lote B, v0.4.0): lista de
// terminales abiertas con nombre, indicador de estado (viva/terminó), cierre
// por terminal y botón + con menú de shells DETECTADOS (list_shells, que NO
// corre al arrancar: se pide al abrir el menú; cache de sesión en Rust+store).

export function TerminalSidebar(): React.ReactElement {
  const t = useT()
  const terminals = useTerminalStore((s) => s.terminals)
  const activeKey = useTerminalStore((s) => s.activeKey)
  const shells = useTerminalStore((s) => s.shells)
  const shellsLoading = useTerminalStore((s) => s.shellsLoading)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const canOpen = canOpenTerminal(terminals.length)

  // list_shells: al abrir el menú + (no al arrancar); cache de sesión
  useEffect(() => {
    if (menuOpen) void useTerminalStore.getState().loadShells()
  }, [menuOpen])

  // Cerrar el menú al hacer click fuera
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <div className="flex w-44 shrink-0 flex-col border-l border-aether-border bg-aether-surface">
      <div className="flex items-center justify-between border-b border-aether-border px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-aether-text-dim">
          {t('term.terminal')}
        </span>
        <div className="relative">
          <button
            title={canOpen ? t('term.new') : t('term.limit')}
            disabled={!canOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-5 w-5 items-center justify-center rounded text-[13px] leading-none text-aether-text-dim transition-colors hover:bg-white/10 hover:text-aether-text disabled:cursor-not-allowed disabled:opacity-30"
          >
            ＋
          </button>
          {/* Menú de shells DETECTADOS (solo ids; nunca rutas) */}
          {menuOpen && (
            <div
              ref={menuRef}
              className="absolute top-full right-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-aether-border bg-aether-surface/90 py-1 shadow-2xl backdrop-blur-xl"
            >
              {shellsLoading && (
                <p className="px-3 py-2 text-[12px] text-aether-text-dim">{t('term.loadingShells')}</p>
              )}
              {!shellsLoading && shells?.length === 0 && (
                <p className="px-3 py-2 text-[12px] text-aether-text-dim">{t('term.noShells')}</p>
              )}
              {shells?.map((shell) => (
                <button
                  key={shell.id}
                  onClick={() => {
                    useTerminalStore.getState().open(shell.id, shell.label)
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-aether-text transition-colors hover:bg-aether-accent/20"
                >
                  <span className="text-[11px] text-aether-text-dim">›_</span>
                  {shell.label}
                </button>
              ))}
              {!shellsLoading && canOpen === false && (
                <p className="border-t border-aether-border px-3 py-1.5 text-[10px] text-amber-400/80">
                  {t('term.limit')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-1">
        {terminals.map((entry) => {
          const isActive = entry.key === activeKey
          const isExited = entry.status === 'exited'
          return (
            <div
              key={entry.key}
              onClick={() => useTerminalStore.getState().setActive(entry.key)}
              className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                isActive
                  ? 'bg-aether-accent/15 text-white'
                  : 'text-aether-text-dim hover:bg-white/[0.04] hover:text-aether-text'
              }`}
            >
              {/* Indicador de estado en vivo: viva (esmeralda) / terminó (gris) */}
              <span
                title={isExited ? t('term.statusExited') : t('term.statusRunning')}
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  isExited ? 'bg-zinc-500' : 'bg-emerald-400'
                } ${isActive && !isExited ? 'animate-pulse' : ''}`}
              />
              <span
                className={`min-w-0 flex-1 truncate ${isExited ? 'opacity-60 line-through' : ''}`}
                title={entry.label}
              >
                {entry.label}
              </span>
              {isExited && (
                <button
                  title={t('term.restart')}
                  onClick={(e) => {
                    e.stopPropagation()
                    useTerminalStore.getState().restart(entry.key)
                  }}
                  className="rounded px-1 text-[10px] text-aether-text-dim opacity-0 transition-opacity hover:text-aether-text group-hover:opacity-100"
                >
                  ↻
                </button>
              )}
              <button
                title={t('term.closeTab')}
                onClick={(e) => {
                  e.stopPropagation()
                  useTerminalStore.getState().close(entry.key)
                }}
                className="rounded px-1 text-[11px] opacity-0 transition-opacity hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
