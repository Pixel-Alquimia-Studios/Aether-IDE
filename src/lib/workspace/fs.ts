import { invoke, isTauri } from '@tauri-apps/api/core'

import type { SessionData } from '@/types/session'
import type { FileNode } from '@/types/workspace'

// Capa IPC del sistema de archivos (Fase 2.1).
// En desktop usa invoke() contra Rust; en navegador dev cae al workspace mock.

export async function readFile(path: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('read_file', { path })
  }
  const { MOCK_FILE_CONTENTS } = await import('./mockWorkspace')
  return MOCK_FILE_CONTENTS[path] ?? `// ${path}\n`
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke('write_file', { path, content })
    return
  }
  // Mock: no hay persistencia real en modo navegador
}

export async function readDir(path: string): Promise<FileNode[]> {
  if (isTauri()) {
    return invoke<FileNode[]>('read_dir', { path })
  }
  const { MOCK_FILE_TREE } = await import('./mockWorkspace')
  return path === '' ? MOCK_FILE_TREE : MOCK_FILE_TREE.filter((n) => n.path === path)
}

export async function pickWorkspaceDir(): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('pick_workspace_dir')
  }
  return null
}

// Fase 2.2: watcher y persistencia de sesión (no-ops en navegador)
export async function watchWorkspace(path: string): Promise<void> {
  if (isTauri()) {
    await invoke('watch_workspace', { path })
  }
}

export async function loadSession(): Promise<SessionData | null> {
  if (isTauri()) {
    return invoke<SessionData | null>('load_session')
  }
  return null
}

export async function saveSession(session: SessionData): Promise<void> {
  if (isTauri()) {
    await invoke('save_session', { session })
  }
}
