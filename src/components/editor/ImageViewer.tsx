import { useState } from 'react'

import type { EditorTab } from '@/types/editor'

// Visualizador de imágenes (v0.3.0, fase B): renderiza la imagen de la tab
// con zoom (+/−/100%/ajustar) y una barra de información (dimensiones, peso).
// Solo vista: las imágenes no se editan ni marcan dirty.

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function ImageViewer({ tab }: { tab: EditorTab }) {
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  // Cambiar de tab resetea el zoom (ajuste de estado durante el render,
  // sin effect: https://react.dev/reference/react/You-Might-Not-Need-an-Effect)
  const [prevTabId, setPrevTabId] = useState(tab.id)
  if (prevTabId !== tab.id) {
    setPrevTabId(tab.id)
    setZoom('fit')
    setDimensions(null)
  }

  const scale = zoom === 'fit' ? 1 : zoom
  const sizeBytes = tab.dataUrl
    ? Math.round((tab.dataUrl.length - `data:${''};base64,`.length) * 0.75)
    : 0

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-aether-bg">
      {/* Barra de controles */}
      <div className="flex items-center gap-1.5 border-b border-aether-border bg-aether-surface px-3 py-1.5">
        <button
          title="Alejar"
          onClick={() => setZoom((z) => Math.max(0.1, (z === 'fit' ? 1 : z) - 0.25))}
          className="rounded px-2 py-0.5 text-[14px] text-aether-text-dim transition-colors hover:bg-white/10 hover:text-aether-text"
        >
          −
        </button>
        <span className="min-w-14 text-center text-[11px] tabular-nums text-aether-text-dim">
          {zoom === 'fit' ? 'Ajustar' : `${Math.round(scale * 100)}%`}
        </span>
        <button
          title="Acercar"
          onClick={() => setZoom((z) => Math.min(8, (z === 'fit' ? 1 : z) + 0.25))}
          className="rounded px-2 py-0.5 text-[14px] text-aether-text-dim transition-colors hover:bg-white/10 hover:text-aether-text"
        >
          ＋
        </button>
        <button
          title="Tamaño real (100%)"
          onClick={() => setZoom(1)}
          className={`rounded px-2 py-0.5 text-[11px] transition-colors hover:bg-white/10 ${
            zoom === 1 ? 'text-aether-accent' : 'text-aether-text-dim hover:text-aether-text'
          }`}
        >
          100%
        </button>
        <button
          title="Ajustar al panel"
          onClick={() => setZoom('fit')}
          className={`rounded px-2 py-0.5 text-[11px] transition-colors hover:bg-white/10 ${
            zoom === 'fit' ? 'text-aether-accent' : 'text-aether-text-dim hover:text-aether-text'
          }`}
        >
          ⤢ Ajustar
        </button>
        <span className="flex-1" />
        {dimensions && (
          <span className="text-[11px] tabular-nums text-aether-text-dim">
            {dimensions.w} × {dimensions.h} px
          </span>
        )}
        <span className="text-[11px] tabular-nums text-aether-text-dim">
          {formatBytes(sizeBytes)}
        </span>
      </div>

      {/* Imagen: fit escala dentro del panel; zoom fijo habilita scroll */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={tab.dataUrl}
          alt={tab.title}
          onLoad={(e) => {
            const img = e.currentTarget
            setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          style={
            zoom === 'fit'
              ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
              : { width: `${Math.max(1, Math.round((dimensions?.w ?? 0) * scale))}px`, height: 'auto' }
          }
          className={zoom === 'fit' ? '' : 'shrink-0'}
          draggable={false}
        />
      </div>
    </div>
  )
}
