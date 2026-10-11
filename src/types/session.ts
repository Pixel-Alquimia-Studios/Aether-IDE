import type { ModelInfo } from '@/types/ai'

export interface SessionData {
  rootPath: string | null
  openTabs: string[]
  activeTab: string | null
  expandedDirs: string[]
  activeView: string
  sidebarVisible: boolean
  selectedProvider: string | null
  selectedModel: string | null
  fetchedModels: Record<string, ModelInfo[]>
  /** Chat activo: se restaura al iniciar (sobrevive reloads de HMR) */
  activeChatId: string | null
  autoSave: boolean
  /** Modo del panel: 'chat' | 'agent' — se restaura con el chat activo */
  agentMode: string | null
}
