import { useEffect, useState } from 'react'

import { useT, type TranslationKey } from '@/lib/i18n'
import { saveCustomBaseUrl } from '@/lib/ai/api'
import { filterModels } from '@/lib/ai/modelFilter'
import { getPermissions, setPermissions } from '@/lib/agent/permissions'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
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

type SettingsSection = 'general' | 'providers' | 'permissions'

export function SettingsView() {
  const [section, setSection] = useState<SettingsSection>('general')
  const t = useT()
  const settingsFocus = useUiStore((s) => s.settingsFocus)
  const setSettingsFocus = useUiStore((s) => s.setSettingsFocus)
  const selectProvider = useSettingsStore((s) => s.selectProvider)

  // Chat 401/403 → botón "Abrir Ajustes": abre la sección de proveedores con
  // el proveedor afectado seleccionado, y limpia el foco
  useEffect(() => {
    if (!settingsFocus) return
    setSection('providers')
    selectProvider(settingsFocus)
    setSettingsFocus(null)
  }, [settingsFocus, selectProvider, setSettingsFocus])

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
          <button
            onClick={() => setSection('permissions')}
            className={`mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] ${
              section === 'permissions'
                ? 'bg-aether-accent/20 text-white'
                : 'text-aether-text hover:bg-white/5'
            }`}
          >
            🔐 {t('perm.title')}
          </button>
        </div>
        {section === 'general' ? <GeneralSection /> : section === 'permissions' ? <PermissionsSection /> : <ProvidersSection />}
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

/** Badge de estado de la API key: configurada+hint, comprobando, rechazada
 *  (con Reintentar), no verificable (con motivo breve), no configurada */
function KeyBadge({ providerId, isConfigured }: { providerId: string; isConfigured: boolean }) {
  const t = useT()
  const status = useSettingsStore((s) => s.keyStatuses[providerId])
  const validation = useSettingsStore((s) => s.keyValidation[providerId])
  const checking = useSettingsStore((s) => s.keyChecking[providerId] ?? false)
  const validateKey = useSettingsStore((s) => s.validateKey)

  // Comprobando (validación en vuelo): spinner + texto
  if (checking) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-aether-accent/15 px-2 py-0.5 text-[11px] text-aether-text-dim">
        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-aether-text-dim border-t-transparent" />
        {t('settings.keyChecking')}
      </span>
    )
  }

  // Validación rechazada: el proveedor devolvió 401/403
  if (validation?.estado === 'rejected') {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-block rounded bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">
          {t('settings.keyRejected')}
        </span>
        <button
          onClick={() => void validateKey(providerId)}
          className="rounded border border-aether-border px-2 py-0.5 text-[11px] text-aether-text-dim hover:bg-white/5"
        >
          {t('settings.keyRetry')}
        </button>
      </span>
    )
  }

  // No verificable: sin red, sin /models, timeout… (con explicación breve)
  if (validation?.estado === 'unverifiable' && validation.motivo !== 'noKey') {
    const reason = t(`settings.reason.${validation.motivo}` as TranslationKey)
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-block rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-400">
          {t('settings.keyUnverifiable')}
          {validation.httpStatus ? ` (HTTP ${validation.httpStatus})` : ''} — {reason}
        </span>
        <button
          onClick={() => void validateKey(providerId)}
          className="rounded border border-aether-border px-2 py-0.5 text-[11px] text-aether-text-dim hover:bg-white/5"
        >
          {t('settings.keyRetry')}
        </button>
      </span>
    )
  }

  // Configurada (+ hint de últimos 4 si Rust lo calculó, y verificada si aplica)
  if (isConfigured) {
    const verified = validation?.estado === 'valid'
    const withHint = status?.hint ? ` · …${status.hint}` : ''
    return (
      <span className="inline-block rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-400">
        {verified ? t('settings.keyValidated') : t('settings.keyConfigured')}
        {withHint}
      </span>
    )
  }

  return (
    <span className="inline-block rounded bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">
      {t('settings.keyNotConfigured')}
    </span>
  )
}

/** Borrar key con confirmación inline de dos pasos (vuelve a normal tras ~5 s) */
function DeleteKeyButton({ providerId }: { providerId: string }) {
  const t = useT()
  const deleteKey = useSettingsStore((s) => s.deleteKey)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(false), 5000)
    return () => window.clearTimeout(timer)
  }, [confirming])

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded border border-aether-border px-3 py-1.5 text-[13px] text-aether-text-dim hover:bg-white/5"
      >
        {t('settings.delete')}
      </button>
    )
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1">
        <span className="text-[11px] text-amber-400">{t('settings.deleteConfirm')}</span>
        <button
          onClick={() => {
            setConfirming(false)
            void deleteKey(providerId)
          }}
          className="rounded bg-red-500/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500"
        >
          {t('settings.deleteYes')}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded border border-aether-border px-2 py-1 text-[11px] text-aether-text-dim hover:bg-white/5"
        >
          {t('settings.deleteNo')}
        </button>
      </span>
      {providerId === 'custom' && (
        <span className="max-w-xs text-[10px] leading-snug text-aether-text-dim">
          {t('settings.customDeleteWarning')}
        </span>
      )}
    </span>
  )
}

function CustomBaseUrlSection({ savedUrl }: { savedUrl: string }) {
  const t = useT()
  const [urlInput, setUrlInput] = useState(savedUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [keyRemoved, setKeyRemoved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadProviders = useSettingsStore((s) => s.loadProviders)

  // Host:puerto exacto al que se enviará la key (feedback en vivo)
  let host: string | null = null
  try {
    if (urlInput.trim()) host = new URL(urlInput.trim()).host || null
  } catch {
    host = null
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    setKeyRemoved(false)
    try {
      const keyWasRemoved = await saveCustomBaseUrl(urlInput.trim() || null)
      setSaved(true)
      if (keyWasRemoved) {
        setKeyRemoved(true)
        // Cambio de host: la key se borró — descarta validaciones en vuelo
        // del custom y refresca estados (badge pasa a "sin key")
        useSettingsStore.getState().discardValidation('custom')
        void loadProviders()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
        {t('settings.customUrl')}
      </label>
      <div className="mt-2 flex max-w-xl gap-2">
        <input
          value={urlInput}
          onChange={(e) => {
            setUrlInput(e.target.value)
            setSaved(false)
            setKeyRemoved(false)
          }}
          placeholder={t('settings.customUrlHint')}
          className="flex-1 rounded border border-aether-border bg-aether-bg px-3 py-1.5 font-mono text-[13px] text-aether-text outline-none placeholder:text-aether-text-dim focus:border-aether-accent"
        />
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-aether-accent px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          {t('settings.customSave')}
        </button>
      </div>
      <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-aether-text-dim">
        {t('settings.customKeyWarning')}
      </p>
      {host && (
        <p className="mt-2 max-w-xl text-[12px] text-aether-text">
          {t('settings.customKeyHost')} <span className="font-mono text-amber-400">{host}</span>
        </p>
      )}
      {saved && !error && (
        <p className="mt-2 text-xs text-emerald-400">{t('settings.customUrlSaved')}</p>
      )}
      {keyRemoved && (
        <p className="mt-2 text-xs text-amber-400">{t('settings.customKeyRemoved')}</p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
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
  const fetchModels = useSettingsStore((s) => s.fetchModels)
  const t = useT()

  const model = modelByProvider[provider.id] ?? ''
  const isConfigured = keyConfigured[provider.id] ?? false

  const models = fetchedModels[provider.id]?.length
    ? fetchedModels[provider.id]
    : provider.defaultModels
  const isFetching = fetchingModels[provider.id] ?? false
  const [apiKeyInput, setApiKeyInput] = useState('')
  // Filtro de texto sobre el catálogo (id y nombre del modelo)
  const [modelFilter, setModelFilter] = useState('')
  const filteredModels = filterModels(models, modelFilter)

  const effectiveModel = model || models[0]?.id || provider.defaultModels[0]?.id
  const modelInfo = models.find((m) => m.id === effectiveModel) ?? models[0]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div>
        <h2 className="text-sm font-semibold text-aether-text">{provider.name}</h2>
        <p className="mt-1 font-mono text-xs text-aether-text-dim">
          {provider.baseUrl || t('settings.customNoUrl')}
        </p>
      </div>

      {/* Proveedor personalizado: la URL base se guarda y valida en Rust */}
      {provider.id === 'custom' && <CustomBaseUrlSection savedUrl={provider.baseUrl} />}

      <section className="mt-6">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
          {t('settings.activeModel')}
        </label>
        <div className="mt-2 flex flex-col gap-2">
          {/* Filtro del catálogo: útil con catálogos grandes (OpenRouter 300+) */}
          {models.length > 0 && (
            <input
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              placeholder={t('settings.modelFilter')}
              className="w-80 rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[13px] text-aether-text outline-none placeholder:text-aether-text-dim focus:border-aether-accent"
            />
          )}
          <select
            value={models.some((m) => m.id === effectiveModel) ? effectiveModel : ''}
            onChange={(e) => setModel(provider.id, e.target.value)}
            className="w-80 rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[13px] text-aether-text outline-none focus:border-aether-accent"
          >
            <option value="" disabled>
              {t('settings.pickModel')}
            </option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
                {m.name ? ` — ${m.name}` : ''}
              </option>
            ))}
          </select>
          {models.length > 0 && filteredModels.length === 0 && (
            <p className="text-xs text-amber-400">
              {t('settings.modelFilterEmpty').replace('{query}', modelFilter.trim())}
            </p>
          )}
          {/* Z.ai sin catálogo verificable: el id se escribe a mano */}
          {provider.id === 'zai' && models.length === 0 && (
            <p className="max-w-xl text-[11px] leading-relaxed text-aether-text-dim">
              {t('settings.zaiManualHint')}
            </p>
          )}
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
            {/* Badge con estados: configurada+hint / comprobando / rechazada / no verificable */}
            <KeyBadge providerId={provider.id} isConfigured={isConfigured} />
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
              {isConfigured && <DeleteKeyButton providerId={provider.id} />}
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

function PermissionsSection() {
  const t = useT()
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const current = rootPath ? getPermissions(rootPath) : { write: 'ask' as const, execute: 'ask' as const }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-[14px] font-semibold text-aether-text">{t('perm.title')}</h2>
      <p className="mt-1 text-[12px] text-aether-text-dim">{t('perm.description')}</p>

      {!rootPath && <p className="mt-4 text-[12px] text-amber-400">{t('perm.noWorkspace')}</p>}

      {rootPath && (
        <div className="mt-4 max-w-xl space-y-6">
          <section>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
              {t('perm.writeLabel')}
            </label>
            <div className="mt-2 space-y-1">
              <button
                onClick={() => setPermissions(rootPath, { write: 'ask' })}
                className={`block w-full max-w-md rounded border px-3 py-2 text-left text-[13px] transition-colors ${
                  current.write === 'ask'
                    ? 'border-aether-accent bg-aether-accent/10 text-white'
                    : 'border-aether-border bg-aether-bg text-aether-text-dim hover:border-aether-border hover:text-aether-text'
                }`}
              >
                {t('perm.writeAsk')}
              </button>
              <button
                onClick={() => setPermissions(rootPath, { write: 'allow' })}
                className={`block w-full max-w-md rounded border px-3 py-2 text-left text-[13px] transition-colors ${
                  current.write === 'allow'
                    ? 'border-aether-accent bg-aether-accent/10 text-white'
                    : 'border-aether-border bg-aether-bg text-aether-text-dim hover:border-aether-border hover:text-aether-text'
                }`}
              >
                {t('perm.writeAllow')}
              </button>
            </div>
          </section>

          <section>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-aether-text-dim">
              {t('perm.executeLabel')}
            </label>
            <div className="mt-2 space-y-1">
              <button
                onClick={() => setPermissions(rootPath, { execute: 'ask' })}
                className={`block w-full max-w-md rounded border px-3 py-2 text-left text-[13px] transition-colors ${
                  current.execute === 'ask'
                    ? 'border-aether-accent bg-aether-accent/10 text-white'
                    : 'border-aether-border bg-aether-bg text-aether-text-dim hover:border-aether-border hover:text-aether-text'
                }`}
              >
                {t('perm.executeAsk')}
              </button>
              <button
                onClick={() => setPermissions(rootPath, { execute: 'safe' })}
                className={`block w-full max-w-md rounded border px-3 py-2 text-left text-[13px] transition-colors ${
                  current.execute === 'safe'
                    ? 'border-aether-accent bg-aether-accent/10 text-white'
                    : 'border-aether-border bg-aether-bg text-aether-text-dim hover:border-aether-border hover:text-aether-text'
                }`}
              >
                {t('perm.executeSafe')}
              </button>
            </div>
          </section>

          <p className="text-[11px] leading-relaxed text-aether-text-dim">{t('perm.note')}</p>
        </div>
      )}
    </div>
  )
}
