import { create } from 'zustand'

import {
  gitCommit,
  gitPull,
  gitPush,
  gitStage,
  gitStatus,
  gitDiffLines,
  gitUnstage,
} from '@/lib/git'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { DiffLine, GitFileStatus } from '@/types/git'

interface GitState {
  status: GitFileStatus[]
  /** Líneas de diff por archivo (para el gutter de Monaco; lazy load) */
  diffByPath: Record<string, DiffLine[]>
  loading: boolean
  error: string | null
  /** Última salida de push/pull/commit para la UI */
  lastAction: string | null
  acting: boolean

  refresh: () => Promise<void>
  fetchDiff: (path: string) => Promise<void>
  stage: (path: string) => Promise<void>
  unstage: (path: string) => Promise<void>
  stageAll: () => Promise<void>
  unstageAll: () => Promise<void>
  commit: (message: string) => Promise<void>
  push: () => Promise<void>
  pull: () => Promise<void>
}

export const useGitStore = create<GitState>()((set, get) => ({
  status: [],
  diffByPath: {},
  loading: false,
  error: null,
  lastAction: null,
  acting: false,

  // Invalida diffByPath para que el gutter refresque el archivo activo
  refresh: async () => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) {
      set({ status: [], diffByPath: {}, error: null })
      return
    }
    set({ loading: true })
    try {
      const status = await gitStatus(root)
      set({ status, diffByPath: {}, loading: false, error: null })
    } catch (e) {
      set({
        status: [],
        diffByPath: {},
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  },

  // Carga perezosa: solo se pide el diff de un archivo cuando hace falta
  fetchDiff: async (path) => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    try {
      const lines = await gitDiffLines(root, path)
      set((state) => ({ diffByPath: { ...state.diffByPath, [path]: lines } }))
    } catch {
      // Sin diff (archivo sin cambios o no repo)
    }
  },

  stage: async (path) => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    try {
      await gitStage(root, path)
      set({ error: null })
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  unstage: async (path) => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    try {
      await gitUnstage(root, path)
      set({ error: null })
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  // Stage/unstage masivo: "." opera sobre todo el workspace
  stageAll: async () => {
    await get().stage('.')
  },

  unstageAll: async () => {
    await get().unstage('.')
  },

  commit: async (message) => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    if (!message.trim()) {
      set({ error: 'El mensaje de commit está vacío' })
      return
    }
    set({ acting: true })
    try {
      await gitCommit(root, message.trim())
      set({ error: null, lastAction: 'Commit realizado' })
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ acting: false })
    }
  },

  push: async () => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    set({ acting: true })
    try {
      await gitPush(root)
      set({ error: null, lastAction: 'Push completado' })
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ acting: false })
    }
  },

  pull: async () => {
    const root = useWorkspaceStore.getState().rootPath
    if (!root) return
    set({ acting: true })
    try {
      await gitPull(root)
      set({ error: null, lastAction: 'Pull completado' })
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ acting: false })
    }
  },
}))
