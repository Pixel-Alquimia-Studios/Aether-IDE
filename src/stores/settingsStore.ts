import { isTauri } from '@tauri-apps/api/core'
import { create } from 'zustand'

import {
  deleteApiKey,
  fetchModels,
  getApiKeyStatuses,
  listProviders,
  saveApiKey,
  validateApiKey,
} from '@/lib/ai/api'
import { detectLanguage, type Language } from '@/lib/language'
import { tSync } from '@/lib/i18n'
import { createValidationTracker } from '@/lib/ai/validationToken'
import type { ApiKeyStatus, KeyValidation, ModelInfo, ProviderInfo } from '@/types/ai'

// Persistencia local de modelos obtenidos (dev en navegador; en desktop la
// sesión de Tauri guarda fetchedModels en session.json)
const FETCHED_MODELS_KEY = 'aether-ide-fetched-models'
const LANGUAGE_KEY = 'aether-ide-language'

function loadPersistedLanguage(): Language {
  // 1. Override manual del usuario (persistido)
  try {
    const raw = localStorage.getItem(LANGUAGE_KEY)
    if (raw === 'es' || raw === 'en') return raw
  } catch {
    // localStorage no disponible
  }
  // 2. Idioma del SO (es-* → Español latino, si no Inglés)
  return detectLanguage()
}

function persistLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language)
  } catch {
    // localStorage no disponible
  }
}

function loadPersistedFetchedModels(): Record<string, ModelInfo[]> {
  if (isTauri()) return {}
  try {
    const raw = localStorage.getItem(FETCHED_MODELS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, ModelInfo[]>) : {}
  } catch {
    return {}
  }
}

function persistFetchedModels(models: Record<string, ModelInfo[]>): void {
  if (isTauri()) return
  try {
    localStorage.setItem(FETCHED_MODELS_KEY, JSON.stringify(models))
  } catch {
    // Almacenamiento no disponible
  }
}

interface SettingsState {
  providers: ProviderInfo[]
  loading: boolean
  error: string | null
  selectedProviderId: string | null
  /** Modelo elegido por proveedor (vacío = primer modelo por defecto) */
  modelByProvider: Record<string, string>
  /** Qué proveedores tienen API key configurada en el keychain del SO */
  keyConfigured: Record<string, boolean>
  /** Estado de las keys (configured + hint últimos 4, calculado en Rust).
   *  SOLO en memoria: nunca en session.json, localStorage ni logs */
  keyStatuses: Record<string, ApiKeyStatus>
  /** Resultado de la validación de la key (tras guardar o Reintentar) */
  keyValidation: Record<string, KeyValidation>
  /** Validación en vuelo por proveedor (spinner del badge) */
  keyChecking: Record<string, boolean>
  /** Modelos obtenidos dinámicamente (fetch dinámico) */
  fetchedModels: Record<string, ModelInfo[]>
  fetchingModels: Record<string, boolean>
  fetchModelsError: Record<string, string>
  /** Idioma de la UI (arranque auto por SO + override manual) */
  language: Language

  setLanguage: (language: Language) => void
  loadProviders: () => Promise<void>
  selectProvider: (id: string) => void
  setModel: (providerId: string, model: string) => void
  saveKey: (providerId: string, key: string) => Promise<void>
  deleteKey: (providerId: string) => Promise<void>
  fetchModels: (providerId: string) => Promise<void>
  /** Valida la key en segundo plano (tras guardar o Reintentar) */
  validateKey: (providerId: string) => Promise<void>
  /** Descarta una validación en vuelo (carrera: reemplazo/borrado/cambio) */
  discardValidation: (providerId: string) => void
}

// Tokens de carrera: el resultado de una validación solo se aplica si su
// token sigue vigente (reemplazo/borrado/cambio de proveedor lo descartan)
const validationTracker = createValidationTracker()

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  providers: [],
  loading: false,
  error: null,
  selectedProviderId: null,
  modelByProvider: {},
  keyConfigured: {},
  keyStatuses: {},
  keyValidation: {},
  keyChecking: {},
  fetchedModels: loadPersistedFetchedModels(),
  fetchingModels: {},
  fetchModelsError: {},
  language: loadPersistedLanguage(),

  setLanguage: (language) => {
    persistLanguage(language)
    set({ language })
  },

  loadProviders: async () => {
    set({ loading: true, error: null })
    try {
      const providers = await listProviders()
      // Estados de keys en UNA llamada (un acceso al keychain por proveedor
      // dentro de Rust). Si el keychain falla: UN único error i18n
      const keyStatuses = await getApiKeyStatuses()
      const keyConfigured: Record<string, boolean> = {}
      for (const provider of providers) {
        if (provider.requiresKey) {
          keyConfigured[provider.id] = keyStatuses[provider.id]?.configured ?? false
        }
      }
      set({ providers, keyStatuses, keyConfigured, loading: false })
      // Auto-fetch de modelos del proveedor seleccionado si tiene key configurada
      const { selectedProviderId } = get()
      if (selectedProviderId && keyConfigured[selectedProviderId]) {
        void get().fetchModels(selectedProviderId)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // keychain-blocked: → mensaje claro i18n en vez del detalle interno
      set({
        loading: false,
        error: message.startsWith('keychain-blocked:')
          ? tSync('settings.keychainError')
          : message,
      })
    }
  },

  selectProvider: (id) => {
    // Cambiar de proveedor descarta la validación en vuelo del anterior
    const prev = get().selectedProviderId
    if (prev && prev !== id) get().discardValidation(prev)
    set({ selectedProviderId: id })
    // Auto-fetch en segundo plano al cambiar de proveedor
    if (get().keyConfigured[id]) {
      void get().fetchModels(id)
    }
  },

  setModel: (providerId, model) =>
    set((state) => ({
      modelByProvider: { ...state.modelByProvider, [providerId]: model },
    })),

  saveKey: async (providerId, key) => {
    try {
      await saveApiKey(providerId, key)
      // Reemplazar = guardar de nuevo: descarta cualquier validación en vuelo
      get().discardValidation(providerId)
      // Refresca estados (configured + hint) desde Rust con la key nueva
      try {
        const keyStatuses = await getApiKeyStatuses()
        set((state) => ({
          keyStatuses,
          keyConfigured: {
            ...state.keyConfigured,
            [providerId]: keyStatuses[providerId]?.configured ?? true,
          },
          error: null,
        }))
      } catch (e) {
        // keychain bloqueado al re-leer: el guardado SÍ ocurrió
        set((state) => ({
          keyConfigured: { ...state.keyConfigured, [providerId]: true },
          error: e instanceof Error ? e.message : String(e),
        }))
      }
      // Validación en segundo plano: NO bloquea el guardado
      void get().validateKey(providerId)
      // Al configurar la clave, traer los modelos automáticamente
      void get().fetchModels(providerId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      set({
        error: message.startsWith('keychain-blocked:') ? tSync('settings.keychainError') : message,
      })
    }
  },

  deleteKey: async (providerId) => {
    try {
      await deleteApiKey(providerId)
      // Borrar descarta la validación en vuelo y limpia hint + estado
      get().discardValidation(providerId)
      set((state) => ({
        keyConfigured: { ...state.keyConfigured, [providerId]: false },
        keyStatuses: { ...state.keyStatuses, [providerId]: { configured: false, hint: null } },
        error: null,
      }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      set({
        error: message.startsWith('keychain-blocked:') ? tSync('settings.keychainError') : message,
      })
    }
  },

  fetchModels: async (providerId) => {
    set((state) => ({
      fetchingModels: { ...state.fetchingModels, [providerId]: true },
      fetchModelsError: { ...state.fetchModelsError, [providerId]: '' },
    }))
    try {
      const models = await fetchModels(providerId)
      set((state) => ({
        fetchedModels: { ...state.fetchedModels, [providerId]: models },
        fetchingModels: { ...state.fetchingModels, [providerId]: false },
        fetchModelsError: { ...state.fetchModelsError, [providerId]: '' },
        error: null,
      }))
      persistFetchedModels(get().fetchedModels)
    } catch (e) {
      set((state) => ({
        fetchingModels: { ...state.fetchingModels, [providerId]: false },
        fetchModelsError: {
          ...state.fetchModelsError,
          [providerId]: e instanceof Error ? e.message : String(e),
        },
      }))
    }
  },

  validateKey: async (providerId) => {
    const token = validationTracker.start(providerId)
    set((state) => ({
      keyChecking: { ...state.keyChecking, [providerId]: true },
    }))
    try {
      const result = await validateApiKey(providerId)
      // Carrera: si reemplazaron/borraron la key o cambió el foco, se descarta
      if (!validationTracker.isValid(providerId, token)) return
      set((state) => ({
        keyValidation: { ...state.keyValidation, [providerId]: result },
        keyChecking: { ...state.keyChecking, [providerId]: false },
      }))
    } catch {
      // Error de transporte del propio invoke: no verificable (sin detalle)
      if (!validationTracker.isValid(providerId, token)) return
      set((state) => ({
        keyValidation: {
          ...state.keyValidation,
          [providerId]: { estado: 'unverifiable', httpStatus: null, motivo: 'noNetwork' },
        },
        keyChecking: { ...state.keyChecking, [providerId]: false },
      }))
    }
  },

  discardValidation: (providerId) => {
    validationTracker.discard(providerId)
    set((state) => {
      const { [providerId]: _drop, ...restValidation } = state.keyValidation
      return {
        keyChecking: { ...state.keyChecking, [providerId]: false },
        keyValidation: restValidation,
      }
    })
  },
}))

/** Configuración efectiva del proveedor activo (para el chat y el gateway) */
export function getActiveProviderConfig(): { providerId: string; model: string } | null {
  const { selectedProviderId, modelByProvider, providers } = useSettingsStore.getState()
  if (!selectedProviderId) return null
  const provider = providers.find((p) => p.id === selectedProviderId)
  if (!provider) return null
  const model = modelByProvider[selectedProviderId] ?? provider.defaultModels[0]?.id ?? ''
  return { providerId: selectedProviderId, model }
}
