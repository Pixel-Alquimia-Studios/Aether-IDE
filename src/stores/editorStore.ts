import { create } from 'zustand'

import { getLanguageFromPath } from '@/lib/workspace/language'
import { writeFile as fsWriteFile } from '@/lib/workspace/fs'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getEditorInstance } from '@/lib/monaco/editorRef'
import type { EditorTab } from '@/types/editor'

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  error: string | null

  openFile: (path: string) => Promise<void>
  closeTab: (id: string) => void
  closeAllTabs: () => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveTab: (id: string) => Promise<void>
  reloadExternally: (path: string) => Promise<void>
  insertAtCursor: (text: string) => void
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  error: null,

  openFile: async (path) => {
    const { tabs } = get()
    const existing = tabs.find((t) => t.id === path)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    try {
      const content = await useWorkspaceStore.getState().readFile(path)
      const name = path.split(/[\\/]/).pop() ?? path
      const tab: EditorTab = {
        id: path,
        title: name,
        content,
        language: getLanguageFromPath(path),
        isDirty: false,
      }
      set({ tabs: [...get().tabs, tab], activeTabId: tab.id, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  closeTab: (id) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id)
      const tabs = state.tabs.filter((t) => t.id !== id)
      let activeTabId = state.activeTabId
      if (activeTabId === id) {
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
      }
      return { tabs, activeTabId }
    }),

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, content, isDirty: true } : t)),
    })),

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    try {
      await fsWriteFile(tab.id, tab.content)
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === id ? { ...t, isDirty: false } : t)),
        error: null,
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  reloadExternally: async (path) => {
    const tab = get().tabs.find((t) => t.id === path)
    if (!tab || tab.isDirty) return
    try {
      const content = await useWorkspaceStore.getState().readFile(path)
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === path && t.content !== content ? { ...t, content, isDirty: false } : t,
        ),
      }))
    } catch {
      // El archivo pudo borrarse externamente: la pestaña queda como está
    }
  },

  insertAtCursor: (text) => {
    const activeTabId = get().activeTabId
    const tab = get().tabs.find((t) => t.id === activeTabId)
    if (!activeTabId || !tab) return

    const editor = getEditorInstance()
    if (editor) {
      const selection = editor.getSelection()
      if (selection) {
        // executeEdits dispara el onChange del Editor → updateContent marca isDirty
        editor.executeEdits('aether-insert', [{ range: selection, text }])
        return
      }
    }
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === activeTabId ? { ...t, content: `${t.content}\n${text}`, isDirty: true } : t,
      ),
    }))
  },
}))