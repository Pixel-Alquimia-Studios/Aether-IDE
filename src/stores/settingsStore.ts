import { isTauri } from '@tauri-apps/api/core'
import { create } from 'zustand'

import { deleteApiKey, fetchModels, hasApiKey, listProviders, saveApiKey } from '@/lib/ai/api'
import { detectLanguage, type Language } from '@/lib/language'
import type { ModelInfo, ProviderInfo } from '@/types/ai'

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
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  providers: [],
  loading: false,
  error: null,
  selectedProviderId: null,
  modelByProvider: {},
  keyConfigured: {},
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
      const keyConfigured: Record<string, boolean> = {}
      for (const provider of providers) {
        if (provider.requiresKey) {
          keyConfigured[provider.id] = await hasApiKey(provider.id)
        }
      }
      set({ providers, keyConfigured, loading: false })
      // Auto-fetch de modelos del proveedor seleccionado si tiene key configurada
      const { selectedProviderId } = get()
      if (selectedProviderId && keyConfigured[selectedProviderId]) {
        void get().fetchModels(selectedProviderId)
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  selectProvider: (id) => {
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
      set((state) => ({
        keyConfigured: { ...state.keyConfigured, [providerId]: true },
        error: null,
      }))
      // Al configurar la clave, traer los modelos automáticamente
      void get().fetchModels(providerId)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  deleteKey: async (providerId) => {
    try {
      await deleteApiKey(providerId)
      set((state) => ({
        keyConfigured: { ...state.keyConfigured, [providerId]: false },
        error: null,
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
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
