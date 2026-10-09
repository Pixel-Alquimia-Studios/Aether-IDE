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
}
