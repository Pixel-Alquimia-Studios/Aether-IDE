import { useEffect, useState } from 'react'

import { useSettingsStore } from '@/stores/settingsStore'
import type { ProviderInfo } from '@/types/ai'

const MODALITY_LABELS: Record<string, string> = {
  text: 'Texto',
  image: 'Imagen',
  audio: 'Audio',
  video: 'Vídeo',
}

function formatTokens(n: number | null): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${n / 1_000_000}M`
  return `${Math.round(n / 1000)}k`
}

export function SettingsView() {
  const providers = useSettingsStore((s) => s.providers)
  const loading = useSettingsStore((s) => s.loading)
  const error = useSettingsStore((s) => s.error)
  const selectedProviderId = useSettingsStore((s) => s.selectedProviderId)
  const keyConfigured = useSettingsStore((s) => s.keyConfigured)
  const loadProviders = useSettingsStore((s) => s.loadProviders)
  const selectProvider = useSettingsStore((s) => s.selectProvider)

  const selected = providers.find((p) => p.id === selectedProviderId) ?? null

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-aether-border px-6 py-4">
        <h1 className="text-base font-semibold text-aether-text">Ajustes</h1>
        <p className="mt-1 text-[13px] text-aether-text-dim">
          Gestiona proveedores de IA, claves de API y el modelo activo
        </p>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Lista de proveedores */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-aether-border p-2">
          {loading && <p className="px-2 py-1 text-[13px] text-aether-text-dim">Cargando…</p>}
          {error && <p className="px-2 py-1 text-xs text-red-400">{error}</p>}
          {providers.map((provider) => {
            const isSelected = provider.id === selectedProviderId
            const badge = provider.requiresKey
              ? keyConfigured[provider.id]
                ? '✓ clave'
                : 'sin clave'
              : 'local'
            return (
              <button
                key={provider.id}
                onClick={() => selectProvider(provider.id)}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[13px] ${
                  isSelected
                    ? 'bg-aether-accent/20 text-white'
                    : 'text-aether-text hover:bg-white/5'
                }`}
              >
                <span className="truncate">{provider.name}</span>
                <span
                  className={`shrink-0 text-[10px] ${
                    badge === 'sin clave' ? 'text-red-400' : 'text-aether-text-dim'
                  }`}
                >
                  {badge}
                </span>
              </button>
            )
          })}
        </div>

        {/* Detalle del proveedor seleccionado */}
        {selected ? (
          <ProviderDetail key={selected.id} provider={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-aether-text-dim">
            Selecciona un proveedor de la lista
          </div>
        )}
      </div>
    </div>
  )
}

// Componente separado con estado propio: con key={provider.id} en el padre se
// reinicializa al cambiar de proveedor, sin effects ni setState en render.
function ProviderDetail({ provider }: { provider: ProviderInfo }) {
  const modelByProvider = useSettingsStore((s) => s.modelByProvider)
  const keyConfigured = useSettingsStore((s) => s.keyConfigured)
  const fetchedModels = useSettingsStore((s) => s.fetchedModels)
  const fetchingModels = useSettingsStore((s) => s.fetchingModels)
  const fetchModelsError = useSettingsStore((s) => s.fetchModelsError)
  const setModel = useSettingsStore((s) => s.setModel)
  const saveKey = useSettingsStore((s) => s.saveKey)
  const deleteKey = useSettingsStore((s) => s.deleteKey)
  const fetchModels = useSettingsStore((s) => s.fetchModels)

  const isConfigured = keyConfigured[provider.id] ?? false

  const models = fetchedModels[provider.id]?.length
    ? fetchedModels[provider.id]
    : provider.defaultModels
  const [apiKeyInput, setApiKeyInput] = useState('')

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div>
        <h2 className="text-sm font-semibold text-aether-text">{provider.name}</h2>
        <p className="mt-1 font-mono text-xs text-aether-text-dim">{provider.baseUrl}</p>
      </div>

      {/* Modelo activo */}
      <section className="mt-6">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
          Modelo activo
        </label>
        <div className="mt-2 flex flex-col gap-2">
          <select
            value={modelByProvider[provider.id] ?? models[0]?.id ?? ''}
            onChange={(e) => setModel(provider.id, e.target.value)}
            className="w-80 rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[13px] text-aether-text outline-none focus:border-aether-accent"
          >
            <option value="" disabled>
              Elegir modelo…
            </option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={modelByProvider[provider.id] ?? ''}
              onChange={(e) => setModel(provider.id, e.target.value)}
              placeholder="…o escribe un model ID personalizado"
              className="w-80 rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[13px] text-aether-text outline-none placeholder:text-aether-text-dim focus:border-aether-accent"
            />
            <button
              onClick={() => void fetchModels(provider.id)}
              disabled={provider.requiresKey && !keyConfigured[provider.id]}
              className="rounded border border-aether-border px-3 py-1.5 text-[13px] text-aether-text-dim hover:bg-white/5 disabled:opacity-40"
            >
              {fetchingModels[provider.id] ? 'Cargando…' : '↻ Refrescar modelos'}
            </button>
          </div>
          {fetchModelsError[provider.id] && (
            <p className="text-xs text-red-400">{fetchModelsError[provider.id]}</p>
          )}
          {(() => {
            const firstModel = models[0]?.id ?? provider.defaultModels[0]?.id ?? ''
            const modelInfo = models.find((m) => m.id === firstModel) ?? models[0]
            if (!modelInfo) return null
            return (
              <p className="mt-2 text-[11px] text-aether-text-dim">
                {modelInfo.maxContextTokens && `${formatTokens(modelInfo.maxContextTokens)} tokens`}
                {modelInfo.modalities.length > 0 && (
                  <span> | {modelInfo.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(' + ')}</span>
                )}
              </p>
            )
          })()}
        </div>
      </section>

      {/* API Key */}
      <section className="mt-6">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
          API Key
        </label>
        {provider.requiresKey ? (
          <div className="mt-2">
            <span
              className={`inline-block rounded px-2 py-0.5 text-[11px] ${
                isConfigured
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-red-500/15 text-red-400'
              }`}
            >
              {isConfigured ? 'Configurada en el keychain del SO' : 'No configurada'}
            </span>
            <div className="mt-3 flex max-w-xl gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Pega tu API key…"
                className="flex-1 rounded border border-aether-border bg-aether-bg px-3 py-1.5 font-mono text-[13px] text-aether-text outline-none placeholder:text-aether-text-dim focus:border-aether-accent"
              />
              <button
                disabled={!apiKeyInput.trim()}
                onClick={() => {
                  void saveKey(provider.id, apiKeyInput.trim())
                  setApiKeyInput('')
                }}
                className="rounded bg-aether-accent px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                Guardar
              </button>
              {isConfigured && (
                <button
                  onClick={() => void deleteKey(provider.id)}
                  className="rounded border border-aether-border px-3 py-1.5 text-[13px] text-aether-text-dim hover:bg-white/5"
                >
                  Borrar
                </button>
              )}
            </div>
            <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-aether-text-dim">
              La clave se guarda en el keychain del sistema operativo (Credential Manager en
              Windows, Keychain en macOS). Nunca se escribe en archivos planos ni se expone al
              frontend.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-aether-text-dim">
            Proveedor local — no requiere API key.
          </p>
        )}
      </section>
    </div>
  )
}