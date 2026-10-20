import { create } from 'zustand'

import { getLanguageFromPath } from '@/lib/workspace/language'
import {
  isInsideRoot,
  pickSaveFile,
  readFileBase64,
  readFileUser,
  writeFileUser,
  writeFile as fsWriteFile,
} from '@/lib/workspace/fs'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getEditorInstance } from '@/lib/monaco/editorRef'
import { useUiStore } from '@/stores/uiStore'
import type { EditorTab } from '@/types/editor'

// Extensiones que se abren en el visualizador de imágenes (v0.3.0, fase B)
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif'])

export function isImagePath(path: string): boolean {
  const ext = (path.split('.').pop() ?? '').toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

/** MIME type correspondiente a la extensión de imagen */
function imageMime(path: string): string {
  const ext = (path.split('.').pop() ?? '').toLowerCase()
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'jpg') return 'image/jpeg'
  return `image/${ext}`
}

// Temporizadores del auto-guardado (menú Archivo → Auto Save), uno por
// pestaña: un debounce global único cancelaba el guardado pendiente de una
// pestaña cuando se editaba otra dentro del intervalo
const autoSaveTimers = new Map<string, number>()

function cancelAutoSaveTimer(id: string): void {
  const timer = autoSaveTimers.get(id)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    autoSaveTimers.delete(id)
  }
}

/** ¿La ruta requiere los comandos de usuario (fuera del workspace)? */
function isUserPath(path: string): boolean {
  const root = useWorkspaceStore.getState().rootPath
  return root !== null && !isInsideRoot(path, root)
}

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  error: string | null

  openFile: (path: string) => Promise<void>
  openUntitledFile: () => Promise<void>
  closeTab: (id: string) => void
  closeAllTabs: () => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveTab: (id: string) => Promise<void>
  saveTabAs: (id: string, newPath: string) => Promise<void>
  reloadExternally: (path: string, force?: boolean) => Promise<void>
  insertAtCursor: (text: string) => void
  /** Cancela un auto-guardado pendiente de una pestaña (p. ej. antes de un rollback) */
  cancelAutoSave: (id: string) => void
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
      const name = path.split(/[\\/]/).pop() ?? path
      // Imágenes: lectura binaria → data URL; el tab se renderiza con el
      // visualizador (sin Monaco, sin edición, sin dirty)
      if (isImagePath(path)) {
        const base64 = await readFileBase64(path)
        const tab: EditorTab = {
          id: path,
          title: name,
          content: '',
          language: 'image',
          isDirty: false,
          kind: 'image',
          dataUrl: `data:${imageMime(path)};base64,${base64}`,
        }
        set({ tabs: [...get().tabs, tab], activeTabId: tab.id, error: null })
        return
      }
      const content = isUserPath(path)
        ? await readFileUser(path)
        : await useWorkspaceStore.getState().readFile(path)
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

  closeTab: (id) => {
    cancelAutoSaveTimer(id)
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id)
      const tabs = state.tabs.filter((t) => t.id !== id)
      let activeTabId = state.activeTabId
      if (activeTabId === id) {
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
      }
      return { tabs, activeTabId }
    })
  },

  closeAllTabs: () => {
    for (const timer of autoSaveTimers.values()) window.clearTimeout(timer)
    autoSaveTimers.clear()
    set({ tabs: [], activeTabId: null })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, content, isDirty: true } : t)),
    }))
    // Auto Save: debounce de 1 s tras la última edición, por pestaña. Las
    // pestañas sin título no tienen ruta en disco: exigen Save As manual
    // (escribir su id relativo lanzaba "Directorio padre inexistente")
    if (!useUiStore.getState().autoSave || id.startsWith('untitled-')) return
    cancelAutoSaveTimer(id)
    autoSaveTimers.set(
      id,
      window.setTimeout(() => {
        autoSaveTimers.delete(id)
        void get().saveTab(id)
      }, 1000),
    )
  },

  // Menú Archivo → New File: pestaña sin guardar con nombre autoincremental
  openUntitledFile: async () => {
    const existing = get().tabs.map((t) => t.id)
    let n = 1
    let path = `untitled-${n}.ts`
    while (existing.includes(path)) {
      n += 1
      path = `untitled-${n}.ts`
    }
    const tab: EditorTab = {
      id: path,
      title: path,
      content: '',
      language: getLanguageFromPath(path),
      isDirty: true,
    }
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id, error: null })
  },

  // Menú Archivo → Save As: escribe en la nueva ruta y reemplaza la pestaña
  saveTabAs: async (id, newPath) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    cancelAutoSaveTimer(id)
    try {
      // Save As puede apuntar fuera del workspace: comando de usuario
      if (isUserPath(newPath)) {
        await writeFileUser(newPath, tab.content)
      } else {
        await fsWriteFile(newPath, tab.content)
      }
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                id: newPath,
                title: newPath.split(/[\\/]/).pop() ?? newPath,
                language: getLanguageFromPath(newPath),
                isDirty: false,
              }
            : t,
        ),
        activeTabId: id === state.activeTabId ? newPath : state.activeTabId,
        error: null,
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    // Pestañas sin título: no hay ruta en disco (su id es un nombre relativo
    // que el backend rechaza) → se fuerza el diálogo Save As
    if (id.startsWith('untitled-')) {
      const newPath = await pickSaveFile(tab.title)
      if (newPath) await get().saveTabAs(id, newPath)
      return
    }
    // M12 (v0.3.1): captura el contenido al iniciar; tras escribir NO cancela
    // un timer programado durante la escritura (esos keystrokes se perderían)
    // y solo limpia isDirty si el contenido no volvió a cambiar
    const contentAtSave = tab.content
    try {
      if (isUserPath(tab.id)) {
        await writeFileUser(tab.id, tab.content)
      } else {
        await fsWriteFile(tab.id, tab.content)
      }
      const current = get().tabs.find((t) => t.id === id)
      if (current && current.content === contentAtSave) {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, isDirty: false } : t)),
          error: null,
        }))
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  reloadExternally: async (path, force = false) => {
    const tab = get().tabs.find((t) => t.id === path)
    if (!tab) return
    if (!force && tab.isDirty) return
    try {
      // Imágenes: re-leer el binario y reconstruir el data URL
      if (tab.kind === 'image') {
        const base64 = await readFileBase64(path)
        const dataUrl = `data:${imageMime(path)};base64,${base64}`
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === path && t.dataUrl !== dataUrl ? { ...t, dataUrl } : t,
          ),
        }))
        return
      }
      const content = isUserPath(path)
        ? await readFileUser(path)
        : await useWorkspaceStore.getState().readFile(path)
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === path && t.content !== content ? { ...t, content, isDirty: false } : t,
        ),
      }))
    } catch {
      if (force) {
        // Recarga forzada de un archivo que ya no existe (p. ej. rollback de
        // un archivo creado por el agente): la pestaña se cierra
        get().closeTab(path)
      }
      // Sin force la pestaña queda como está (borrado externo)
    }
  },

  cancelAutoSave: (id) => cancelAutoSaveTimer(id),

  insertAtCursor: (text) => {
    const activeTabId = get().activeTabId
    const tab = get().tabs.find((t) => t.id === activeTabId)
    if (!activeTabId || !tab) return
    // Las imágenes no se editan: el atajo de insertar no aplica
    if (tab.kind === 'image') return

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