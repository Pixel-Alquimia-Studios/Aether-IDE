import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

import { loadSession, readDir, saveSession, watchWorkspace } from '@/lib/workspace/fs'
import { useEditorStore } from '@/stores/editorStore'
import { useSettingsStore, getActiveProviderConfig } from '@/stores/settingsStore'
import { useUiStore, type SidebarView } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { SessionData } from '@/types/session'

function buildSession(): SessionData {
  const editor = useEditorStore.getState()
  const ui = useUiStore.getState()
  const ws = useWorkspaceStore.getState()
  const activeConfig = getActiveProviderConfig()
  return {
    rootPath: ws.rootPath,
    openTabs: editor.tabs.map((t) => t.id),
    activeTab: editor.activeTabId,
    expandedDirs: [...ws.expandedDirs],
    activeView: ui.activeView,
    sidebarVisible: ui.sidebarVisible,
    selectedProvider: activeConfig?.providerId ?? null,
    selectedModel: activeConfig?.model ?? null,
    fetchedModels: useSettingsStore.getState().fetchedModels,
  }
}

// Fase 2.2/3.2: restaura la sesión al arrancar (carpeta, tabs, layout, proveedor/modelo)
// y persiste cambios de cualquier store con debounce. Solo activo en desktop.
export function useSession(): void {
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false

    const restore = async (): Promise<void> => {
      const session = await loadSession()
      if (!session || cancelled) return

      if (session.activeView) {
        useUiStore.setState({
          activeView: session.activeView as SidebarView,
          sidebarVisible: session.sidebarVisible,
        })
      }
      // Restaurar proveedor/modelo activo y modelos obtenidos (no se resetean)
      const { selectedProvider, selectedModel } = session
      if (selectedProvider) {
        useSettingsStore.setState((state) => ({
          selectedProviderId: selectedProvider,
          modelByProvider: selectedModel
            ? { ...state.modelByProvider, [selectedProvider]: selectedModel }
            : state.modelByProvider,
          fetchedModels: session.fetchedModels ?? state.fetchedModels,
        }))
      }
      // Al iniciar: cargar catálogo y auto-fetch de modelos en segundo plano
      void useSettingsStore.getState().loadProviders()
      if (!session.rootPath) return
      try {
        const fileTree = await readDir(session.rootPath)
        if (cancelled) return
        const rootName = session.rootPath.split(/[\\/]/).filter(Boolean).pop() ?? session.rootPath
        useWorkspaceStore.setState({
          rootPath: session.rootPath,
          rootName,
          fileTree,
          expandedDirs: new Set(session.expandedDirs),
        })
        for (const path of session.openTabs) {
          await useEditorStore.getState().openFile(path)
          if (cancelled) return
        }
        if (session.activeTab) {
          useEditorStore.getState().setActiveTab(session.activeTab)
        }
        await watchWorkspace(session.rootPath)
      } catch {
        // La carpeta pudo borrarse entre sesiones: se ignora
      }
    }
    void restore()

    // Persistencia con debounce (800 ms) ante cambios en cualquier store
    let timer: number | undefined
    const schedule = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void saveSession(buildSession())
      }, 800)
    }
    const unsubs = [
      useEditorStore.subscribe(schedule),
      useUiStore.subscribe(schedule),
      useWorkspaceStore.subscribe(schedule),
      useSettingsStore.subscribe(schedule),
    ]

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      for (const unsub of unsubs) unsub()
    }
  }, [])
}
