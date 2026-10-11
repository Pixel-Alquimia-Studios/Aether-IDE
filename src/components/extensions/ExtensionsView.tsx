import { useEffect, useRef, useState } from 'react'

import { MarkdownRenderer } from '@/components/ai/MarkdownRenderer'
import {
  fetchVsxDetail,
  isWhitelisted,
  searchVsx,
  useVsxStore,
  type VsxExtensionDetail,
  type VsxSearchResult,
} from '@/lib/vsx/materialIcons'

const FEATURED = {
  namespace: 'PKief',
  name: 'material-icon-theme',
  displayName: 'Material Icon Theme',
  description:
    'Temas de iconos de archivo y carpeta de Material Design para VS Code — el más popular.',
}

function ExtensionIcon({ iconUrl, size = 20 }: { iconUrl?: string; size?: number }) {
  if (!iconUrl) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded bg-white/[0.06]"
        style={{ width: size, height: size }}
      >
        🧩
      </span>
    )
  }
  return (
    <img
      src={iconUrl}
      alt=""
      width={size}
      height={size}
      onError={(e) => {
        ;(e.target as HTMLImageElement).style.visibility = 'hidden'
      }}
      className="shrink-0 rounded"
    />
  )
}

function formatDownloads(n?: number): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export function ExtensionsView() {
  // Estado del theme instalado (Material): si hay datos en el store → instalado
  const materialData = useVsxStore((s) => s.data)
  const materialLoading = useVsxStore((s) => s.loading)
  const materialError = useVsxStore((s) => s.error)
  const loadMaterial = useVsxStore((s) => s.load)
  const uninstallMaterial = useVsxStore((s) => s.uninstall)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VsxSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [detail, setDetail] = useState<VsxExtensionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Guards de carrera: solo la última búsqueda/detalle puede actualizar la UI
  const searchRequestIdRef = useRef(0)
  const detailRequestIdRef = useRef(0)

  // Buscar con debounce al escribir (sin setState síncrono en el effect)
  useEffect(() => {
    const q = query.trim()
    if (q === '') return
    const requestId = ++searchRequestIdRef.current
    const timer = window.setTimeout(() => {
      setSearching(true)
      void searchVsx(q)
        .then((exts) => {
          if (searchRequestIdRef.current !== requestId) return
          setResults(exts)
          setSearchError(null)
        })
        .catch((e) => {
          if (searchRequestIdRef.current !== requestId) return
          setSearchError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (searchRequestIdRef.current === requestId) setSearching(false)
        })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [query])

  const handleQueryChange = (value: string): void => {
    setQuery(value)
    if (value.trim() === '') {
      setResults([])
      setSearching(false)
      setSearchError(null)
    }
  }

  const openDetail = (namespace: string, name: string): void => {
    const requestId = ++detailRequestIdRef.current
    setDetailLoading(true)
    setDetail(null)
    void fetchVsxDetail(namespace, name)
      .then((d) => {
        if (detailRequestIdRef.current !== requestId) return
        setDetail(d)
        setDetailLoading(false)
      })
      .catch((e) => {
        if (detailRequestIdRef.current !== requestId) return
        setDetail({
          name,
          namespace,
          displayName: name,
          description: e instanceof Error ? e.message : String(e),
        })
        setDetailLoading(false)
      })
  }

  const materialInstalled = materialData !== null

  // Vista de detalle de una extensión
  if (detail) {
    const whitelisted = isWhitelisted(detail.namespace, detail.name)
    const isMaterial = detail.namespace === FEATURED.namespace && detail.name === FEATURED.name
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <button
          onClick={() => setDetail(null)}
          className="mx-2 mt-2 self-start rounded px-2 py-1 text-[12px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
        >
          ← Volver
        </button>

        <div className="flex items-start gap-3 px-3 pt-3">
          <ExtensionIcon iconUrl={detail.iconUrl} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-white">
              {detail.displayName ?? detail.name}
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-aether-text-dim">
              {detail.publisher ?? detail.namespace}.{detail.name}
            </p>
            <p className="mt-1 text-[11px] text-aether-text-dim">
              v{detail.version ?? '?'}
              {detail.downloadCount != null && ` · ⬇ ${formatDownloads(detail.downloadCount)}`}
            </p>
          </div>
        </div>

        {detail.description && (
          <p className="px-3 pt-2 text-[12px] text-aether-text">{detail.description}</p>
        )}

        <div className="px-3 pt-3">
          {isMaterial ? (
            materialInstalled ? (
              <>
                <button
                  disabled
                  className="w-full rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-400"
                >
                  ✓ Instalado y Habilitado
                </button>
                <button
                  onClick={() => uninstallMaterial()}
                  className="mt-1.5 w-full rounded border border-red-500/40 px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10"
                >
                  Desinstalar
                </button>
              </>
            ) : (
              <button
                onClick={() => void loadMaterial()}
                disabled={materialLoading}
                className="w-full rounded bg-aether-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-aether-accent/80 disabled:opacity-40"
              >
                {materialLoading ? 'Instalando…' : 'Instalar'}
              </button>
            )
          ) : whitelisted ? (
            <button
              onClick={() => void loadMaterial()}
              className="w-full rounded bg-aether-accent px-3 py-1.5 text-[12px] font-medium text-white"
            >
              Instalar
            </button>
          ) : (
            <button
              disabled
              title="Solo las extensiones de la whitelist pueden instalarse"
              className="w-full cursor-not-allowed rounded border border-aether-border px-3 py-1.5 text-[12px] text-aether-text-dim"
            >
              🔒 No disponible (whitelist)
            </button>
          )}
          {isMaterial && materialError && (
            <p className="mt-1 text-[10px] text-red-400">{materialError}</p>
          )}
          {!whitelisted && (
            <p className="mt-1 text-[10px] text-aether-text-dim">
              Aether IDE solo instala extensiones autorizadas por su whitelist.
            </p>
          )}
        </div>

        <div className="mt-4 flex-1 border-t border-aether-border px-3 py-3">
          {detailLoading && (
            <p className="text-[12px] text-aether-text-dim">Cargando README…</p>
          )}
          {detail.readme ? (
            <div className="text-[12px]">
              <MarkdownRenderer content={detail.readme} />
            </div>
          ) : (
            !detailLoading && (
              <p className="text-[12px] text-aether-text-dim">Sin README disponible.</p>
            )
          )}
        </div>
      </div>
    )
  }

  // Vista principal: buscador + destacada + resultados
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="p-2">
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Buscar en Open VSX…"
          className="w-full rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[12px] text-aether-text outline-none placeholder:text-aether-text-dim focus:border-aether-accent"
        />
      </div>

      {/* Whitelist: destacada como Instalada o Disponible según estado */}
      <div className="px-2">
        <div className="text-[10px] font-semibold tracking-wider text-aether-text-dim uppercase">
          {materialInstalled ? 'Instaladas' : 'Disponibles (whitelist)'}
        </div>
        <button
          onClick={() => openDetail(FEATURED.namespace, FEATURED.name)}
          className="mt-1 flex w-full items-start gap-2 rounded border border-aether-border bg-aether-bg px-2 py-2 text-left hover:border-aether-accent/50"
        >
          <ExtensionIcon />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-aether-text">
                {FEATURED.displayName}
              </span>
              {materialInstalled && (
                <span className="shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-400">
                  ✓
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-aether-text-dim">{FEATURED.description}</p>
            <p className="mt-0.5 text-[10px] text-aether-text-dim">
              {FEATURED.namespace}.{FEATURED.name}
              {materialLoading && ' · instalando…'}
            </p>
          </div>
        </button>
      </div>

      {/* Resultados de búsqueda */}
      {query.trim() !== '' && (
        <div className="mt-3 px-2">
          <div className="text-[10px] font-semibold tracking-wider text-aether-text-dim uppercase">
            Resultados en Open VSX
          </div>
          {searching && <p className="py-1 text-[12px] text-aether-text-dim">Buscando…</p>}
          {searchError && <p className="py-1 text-[11px] text-red-400">{searchError}</p>}
          {!searching && !searchError && results.length === 0 && (
            <p className="py-1 text-[12px] text-aether-text-dim">Sin resultados.</p>
          )}
          {results.map((ext) => (
            <button
              key={`${ext.namespace}.${ext.name}`}
              onClick={() => openDetail(ext.namespace, ext.name)}
              className="mt-1 flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/[0.04]"
            >
              <ExtensionIcon iconUrl={ext.iconUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-aether-text">
                    {ext.displayName ?? ext.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-aether-text-dim">
                    {formatDownloads(ext.downloadCount)}
                  </span>
                </div>
                <p className="truncate text-[11px] text-aether-text-dim">{ext.description}</p>
                <p className="truncate text-[10px] text-aether-text-dim">
                  {ext.namespace}.{ext.name} · v{ext.version ?? '?'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
