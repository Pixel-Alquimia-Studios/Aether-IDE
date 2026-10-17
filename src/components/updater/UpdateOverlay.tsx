import { useState } from 'react'

import type { Update } from '@tauri-apps/plugin-updater'

type UpdatePhase = 'confirm' | 'downloading' | 'installing' | 'restarting' | 'error'

export function UpdateOverlay({ update, onClose }: { update: Update; onClose: () => void }) {
  const [phase, setPhase] = useState<UpdatePhase>('confirm')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const startUpdate = async (): Promise<void> => {
    setPhase('downloading')
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setProgress(0)
            break
          case 'Progress':
            setProgress((p) => Math.min(p + 10, 95))
            break
          case 'Finished':
            setProgress(100)
            break
        }
      })

      setPhase('installing')
      setPhase('restarting')
      setTimeout(() => {
        onClose()
        window.location.reload()
      }, 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  const phaseLabel =
    phase === 'downloading'
      ? `Descargando… ${progress}%`
      : phase === 'installing'
        ? 'Instalando…'
        : phase === 'restarting'
          ? 'Reiniciando…'
          : phase === 'error'
            ? `Error: ${error ?? 'desconocido'}`
            : ''

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[420px] max-w-[90vw] rounded-xl border border-white/10 bg-aether-surface/85 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-aether-accent/30 to-aether-accent/5 text-lg text-aether-accent shadow-[0_0_14px_rgba(167,139,250,0.3)]">
          ✦
        </div>
        <h2 className="text-[18px] font-semibold text-white">
          Aether IDE — Actualización disponible
        </h2>
        <p className="mt-2 text-[13px] text-aether-text-dim">
          Nueva versión <span className="font-mono font-bold text-aether-accent">v{update.version}</span>
        </p>
        {update.body && (
          <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-aether-text-dim">
            {update.body}
          </p>
        )}

        {phase === 'confirm' && (
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => void startUpdate()}
              className="flex-1 rounded bg-gradient-to-br from-aether-accent to-aether-accent-strong px-3 py-2 text-[13px] font-medium text-white transition-shadow hover:shadow-[0_0_14px_rgba(167,139,250,0.4)]"
            >
              Actualizar ahora
            </button>
            <button
              onClick={onClose}
              className="rounded border border-aether-border px-3 py-2 text-[13px] text-aether-text-dim hover:bg-white/5"
            >
              Más tarde
            </button>
          </div>
        )}

        {phase !== 'confirm' && phase !== 'error' && (
          <div className="mt-6">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-aether-accent-strong to-aether-accent transition-all duration-300"
                style={{ width: `${phase === 'downloading' ? progress : 100}%` }}
              />
            </div>
            <p className="mt-2 text-center text-[12px] text-aether-text-dim">{phaseLabel}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="mt-4">
            <p className="text-[12px] text-red-400">{phaseLabel}</p>
            <button
              onClick={onClose}
              className="mt-2 w-full rounded border border-aether-border px-3 py-2 text-[12px] text-aether-text-dim hover:bg-white/5"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
