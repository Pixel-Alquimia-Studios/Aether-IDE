import { isTauri } from '@tauri-apps/api/core'
import { create } from 'zustand'

import {
  pickWorkspaceDir,
  readDir,
  readFile as fsReadFile,
  setWorkspace,
  watchWorkspace,
} from '@/lib/workspace/fs'
import { MOCK_FILE_TREE } from '@/lib/workspace/mockWorkspace'
import type { FileNode } from '@/types/workspace'

interface WorkspaceState {
  /** Ruta absoluta de la carpeta raíz (null en navegador con mock) */
  rootPath: string | null
  rootName: string | null
  fileTree: FileNode[]
  expandedDirs: Set<string>
  loading: boolean
  error: string | null

  openWorkspace: () => Promise<void>
  refreshTree: () => Promise<void>
  toggleDir: (path: string) => void
  readFile: (path: string) => Promise<string>
}

// En navegador dev se arranca con el workspace mock; en desktop se abre carpeta real.
const isDesktop = isTauri()

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  rootPath: null,
  rootName: isDesktop ? null : 'aether-workspace',
  fileTree: isDesktop ? [] : MOCK_FILE_TREE,
  expandedDirs: isDesktop ? new Set<string>() : new Set(['src']),
  loading: false,
  error: null,

  openWorkspace: async () => {
    set({ loading: true, error: null })
    try {
      const rootPath = await pickWorkspaceDir()
      if (!rootPath) {
        set({ loading: false })
        return
      }
      // Fija el workspace en el BACKEND antes de cualquier comando FS:
      // de aquí depende la contención de los comandos del agente
      await setWorkspace(rootPath)
      const fileTree = await readDir(rootPath)
      const rootName = rootPath.split(/[\\/]/).filter(Boolean).pop() ?? rootPath
      set({ rootPath, rootName, fileTree, loading: false, expandedDirs: new Set() })
      void watchWorkspace(rootPath)
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  // Relee el árbol ante cambios externos (evento workspace-changed del watcher)
  refreshTree: async () => {
    const { rootPath } = get()
    if (!rootPath) return
    try {
      const fileTree = await readDir(rootPath)
      set({ fileTree, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  toggleDir: (path) =>
    set((state) => {
      const expandedDirs = new Set(state.expandedDirs)
      if (expandedDirs.has(path)) {
        expandedDirs.delete(path)
      } else {
        expandedDirs.add(path)
      }
      return { expandedDirs }
    }),

  readFile: (path) => fsReadFile(path),
}))

export function findNode(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}
