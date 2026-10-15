import { useState } from 'react'

import { useT } from '@/lib/i18n'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'
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

type SettingsSection = 'general' | 'providers'

export function SettingsView() {
  const [section, setSection] = useState<SettingsSection>('general')
  const t = useT()

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-aether-border px-6 py-4">
        <h1 className="text-base font-semibold text-aether-text">{t('settings.title')}</h1>
        <p className="mt-1 text-[13px] text-aether-text-dim">{t('settings.subtitle')}</p>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-56 shrink-0 border-r border-aether-border p-2">
          <button
            onClick={() => setSection('general')}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] ${
              section === 'general'
                ? 'bg-aether-accent/20 text-white'
                : 'text-aether-text hover:bg-white/5'
            }`}
          >
            ⚙️ {t('settings.general')}
          </button>
          <button
            onClick={() => setSection('providers')}
            className={`mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] ${
              section === 'providers'
                ? 'bg-aether-accent/20 text-white'
                : 'text-aether-text hover:bg-white/5'
            }`}
          >
            🔌 {t('settings.providers')}
          </button>
        </div>
        {section === 'general' ? <GeneralSection /> : <ProvidersSection />}
      </div>
    </div>
  )
}

function GeneralSection() {
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const autoSave = useUiStore((s) => s.autoSave)
  const toggleAutoSave = useUiStore((s) => s.toggleAutoSave)
  const setTermsDialogOpen = useUiStore((s) => s.setTermsDialogOpen)
  const t = useT()

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <section>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
          {t('settings.language')}
        </label>
        <div className="mt-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'es' | 'en')}
            className="w-80 rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[13px] text-aether-text outline-none focus:border-aether-accent"
          >
            <option value="es">{t('settings.languageEs')}</option>
            <option value="en">{t('settings.languageEn')}</option>
          </select>
        </div>
      </section>
      <section className="mt-6">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
          {t('menu.autoSave')}
        </label>
        <div className="mt-2">
          <button
            onClick={() => toggleAutoSave()}
            className={`rounded border px-3 py-1.5 text-[12px] font-medium ${
              autoSave
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-aether-border text-aether-text-dim hover:bg-white/5'
            }`}
          >
            {autoSave ? '✓ ON' : 'OFF'}
          </button>
        </div>
      </section>
      <section className="mt-6">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
          {t('terms.dialogTitle')}
        </label>
        <div className="mt-2">
          <button
            onClick={() => setTermsDialogOpen(true)}
            className="rounded border border-aether-border px-3 py-1.5 text-[12px] text-aether-text-dim hover:bg-white/5"
          >
            📄 {t('terms.dialogTitle')}
          </button>
        </div>
      </section>
    </div>
  )
}

function ProvidersSection() {
  const providers = useSettingsStore((s) => s.providers)
  const selectedProviderId = useSettingsStore((s) => s.selectedProviderId)
  const keyConfigured = useSettingsStore((s) => s.keyConfigured)
  const selectProvider = useSettingsStore((s) => s.selectProvider)
  const t = useT()

  const selected = providers.find((p) => p.id === selectedProviderId) ?? null

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-aether-border px-3 py-2">
        {providers.map((provider) => {
          const badge = provider.requiresKey
            ? keyConfigured[provider.id]
              ? '✓'
              : '·'
            : 'local'
          return (
            <button
              key={provider.id}
              onClick={() => selectProvider(provider.id)}
              className={`rounded px-2 py-1 text-[12px] ${
                provider.id === selectedProviderId
                  ? 'bg-aether-accent/20 font-medium text-white'
                  : 'text-aether-text-dim hover:bg-white/5'
              }`}
            >
              {provider.name} {badge}
            </button>
          )
        })}
      </div>
      {selected ? (
        <ProviderDetail key={selected.id} provider={selected} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-[13px] text-aether-text-dim">
          {t('settings.noProvider')}
        </div>
      )}
    </div>
  )
}

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
  const t = useT()

  const model = modelByProvider[provider.id] ?? ''
  const isConfigured = keyConfigured[provider.id] ?? false

  const models = fetchedModels[provider.id]?.length
    ? fetchedModels[provider.id]
    : provider.defaultModels
  const isFetching = fetchingModels[provider.id] ?? false
  const [apiKeyInput, setApiKeyInput] = useState('')

  const effectiveModel = model || models[0]?.id || provider.defaultModels[0]?.id
  const modelInfo = models.find((m) => m.id === effectiveModel) ?? models[0]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div>
        <h2 className="text-sm font-semibold text-aether-text">{provider.name}</h2>
        <p className="mt-1 font-mono text-xs text-aether-text-dim">{provider.baseUrl}</p>
      </div>

      <section className="mt-6">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
          {t('settings.activeModel')}
        </label>
        <div className="mt-2 flex flex-col gap-2">
          <select
            value={models.some((m) => m.id === effectiveModel) ? effectiveModel : ''}
            onChange={(e) => setModel(provider.id, e.target.value)}
            className="w-80 rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[13px] text-aether-text outline-none focus:border-aether-accent"
          >
            <option value="" disabled>
              {t('settings.pickModel')}
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
              placeholder={t('settings.customModel')}
              className="w-80 rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[13px] text-aether-text outline-none placeholder:text-aether-text-dim focus:border-aether-accent"
            />
            <button
              onClick={() => void fetchModels(provider.id)}
              disabled={provider.requiresKey && !keyConfigured[provider.id]}
              className="rounded border border-aether-border px-3 py-1.5 text-[13px] text-aether-text-dim hover:bg-white/5 disabled:opacity-40"
            >
              {isFetching ? t('settings.loadingModels') : t('settings.refreshModels')}
            </button>
          </div>
          {fetchModelsError[provider.id] && (
            <p className="text-xs text-red-400">{fetchModelsError[provider.id]}</p>
          )}
          {modelInfo && (
            <p className="mt-2 text-[11px] text-aether-text-dim">
              {modelInfo.maxContextTokens && `${formatTokens(modelInfo.maxContextTokens)} tokens`}
              {modelInfo.modalities.length > 0 && (
                <span> | {modelInfo.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(' + ')}</span>
              )}
            </p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
          {t('settings.apiKey')}
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
              {isConfigured ? t('settings.keyConfigured') : t('settings.keyNotConfigured')}
            </span>
            <div className="mt-3 flex max-w-xl gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={t('settings.pasteKey')}
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
                {t('settings.save')}
              </button>
              {isConfigured && (
                <button
                  onClick={() => void deleteKey(provider.id)}
                  className="rounded border border-aether-border px-3 py-1.5 text-[13px] text-aether-text-dim hover:bg-white/5"
                >
                  {t('settings.delete')}
                </button>
              )}
            </div>
            <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-aether-text-dim">
              {t('settings.keychainNote')}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-aether-text-dim">{t('settings.localProvider')}</p>
        )}
      </section>
    </div>
  )
}
