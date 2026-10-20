import { invoke, isTauri } from '@tauri-apps/api/core'

import type { SessionData } from '@/types/session'
import type { FileNode } from '@/types/workspace'

// Capa IPC del sistema de archivos (Fase 2.1).
// En desktop usa invoke() contra Rust; en navegador dev cae al workspace mock.
//
// Contención (v0.3.1, S1/S2): los comandos sin sufijo `_user` están CONTENIDOS
// por el backend contra el workspace que él mismo conoce (set_workspace). Los
// comandos `_user` son SOLO para flujos explícitos del usuario (Archivo →
// Abrir archivo / Save As pueden apuntar fuera del workspace).

/** Fija el workspace en el ESTADO DEL BACKEND (fuente de verdad de la contención) */
export async function setWorkspace(path: string): Promise<void> {
  if (isTauri()) {
    await invoke('set_workspace', { path })
  }
}

/** ¿Está `path` dentro de `root`? (rutas normalizadas, sin case en Windows) */
export function isInsideRoot(path: string, root: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
  const nPath = norm(path)
  const nRoot = norm(root)
  return nPath === nRoot || nPath.startsWith(`${nRoot}/`)
}

export async function readFile(path: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('read_file', { path })
  }
  const { MOCK_FILE_CONTENTS } = await import('./mockWorkspace')
  return MOCK_FILE_CONTENTS[path] ?? `// ${path}\n`
}

/** Lectura sin contención: SOLO archivos elegidos explícitamente por el usuario */
export async function readFileUser(path: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('read_file_user', { path })
  }
  const { MOCK_FILE_CONTENTS } = await import('./mockWorkspace')
  return MOCK_FILE_CONTENTS[path] ?? `// ${path}\n`
}

/** Lectura binaria (imágenes) codificada en base64 para el visualizador */
export async function readFileBase64(path: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('read_file_base64', { path })
  }
  throw new Error('El visualizador de imágenes requiere la app de escritorio')
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke('write_file', { path, content })
    return
  }
  // Mock: no hay persistencia real en modo navegador
}

/** Escritura sin contención: SOLO guardados explícitos del usuario */
export async function writeFileUser(path: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke('write_file_user', { path, content })
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

// Diálogos del menú Archivo (solo desktop; en navegador devuelven null)
export async function pickOpenFile(): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('pick_open_file')
  }
  return null
}

export async function pickSaveFile(defaultName?: string): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('pick_save_file', { defaultName: defaultName ?? null })
  }
  return null
}

export async function deleteFile(path: string, root: string): Promise<void> {
  if (isTauri()) {
    await invoke('delete_file', { path, root })
  }
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
