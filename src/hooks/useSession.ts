import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

import { loadSession, readDir, saveSession, setWorkspace, watchWorkspace } from '@/lib/workspace/fs'
import { loadChat } from '@/lib/ai/chats'
import { useAgentStore } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'
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
    // Las pestañas untitled no se persisten: no existe archivo detrás y su
    // restauración falla (openFile de un id relativo inexistente)
    openTabs: editor.tabs.filter((t) => !t.id.startsWith('untitled-')).map((t) => t.id),
    activeTab: editor.activeTabId,
    expandedDirs: [...ws.expandedDirs],
    activeView: ui.activeView,
    sidebarVisible: ui.sidebarVisible,
    selectedProvider: activeConfig?.providerId ?? null,
    selectedModel: activeConfig?.model ?? null,
    fetchedModels: useSettingsStore.getState().fetchedModels,
    activeChatId: useChatStore.getState().chatId,
    autoSave: ui.autoSave,
    agentMode: useAgentStore.getState().mode,
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
        // 'ai' ya no es una vista central: el chat es un dock derecho
        const restoredView =
          session.activeView === 'ai' ? 'explorer' : (session.activeView as SidebarView)
        useUiStore.setState({
          activeView: restoredView,
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

      // Restaurar Auto Save y el CHAT ACTIVO (mensajes + pasos del agente):
      // los reloads de HMR ya no pierden el chat en curso
      if (session.autoSave) {
        useUiStore.setState({ autoSave: true })
      }
      // Restaurar el MODO del panel (plan/agente). Sesiones antiguas usaban
      // 'chat' como alias de 'plan'
      if (session.agentMode) {
        const legacyMode = session.agentMode === 'agent' ? 'agent' : 'plan'
        useAgentStore.setState({ mode: legacyMode })
      }
      // Restaurar el chat ACTIVO solo si pertenece a la MISMA carpeta:
      // los chats son por workspace (no se mezclan entre proyectos)
      if (session.activeChatId && session.rootPath) {
        const activeChat = await loadChat(session.activeChatId)
        if (activeChat && !cancelled && activeChat.workspaceRoot === session.rootPath) {
          useChatStore.setState({
            chatId: activeChat.id,
            chatTitle: activeChat.title,
            chatCreatedAt: activeChat.createdAt,
            chatWorkspaceRoot: activeChat.workspaceRoot ?? session.rootPath,
            messages: activeChat.messages
              .filter(
                (m) =>
                  (m.role === 'user' || m.role === 'assistant') &&
                  m.content.trim() !== '',
              )
              .map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                ...(m.turnId ? { turnId: m.turnId } : {}),
                ...(m.ts ? { ts: m.ts } : {}),
              })),
          })
          useAgentStore.getState().setSteps(activeChat.agentSteps ?? [])
        }
      }

      if (!session.rootPath) return
      try {
        // Fija el workspace en el BACKEND antes de cualquier comando FS
        await setWorkspace(session.rootPath)
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
    // Persistencia del chat activo (mensajes + pasos del agente) con debounce:
    // se guardan en chats/*.json, no en session.json
    let chatTimer: number | undefined
    const scheduleChatPersist = (): void => {
      window.clearTimeout(chatTimer)
      chatTimer = window.setTimeout(() => {
        void useChatStore.getState().persistActive()
      }, 1200)
    }
    const unsubs = [
      useEditorStore.subscribe(schedule),
      useUiStore.subscribe(schedule),
      useWorkspaceStore.subscribe(schedule),
      useSettingsStore.subscribe(schedule),
      // agentMode se persiste en session.json (schedule), los mensajes/pasos
      // del chat activo en chats/*.json (scheduleChatPersist)
      useChatStore.subscribe(schedule),
      useAgentStore.subscribe(schedule),
      useAgentStore.subscribe(scheduleChatPersist),
    ]

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearTimeout(chatTimer)
      for (const unsub of unsubs) unsub()
    }
  }, [])
}
