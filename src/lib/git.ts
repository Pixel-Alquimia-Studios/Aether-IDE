import { invoke, isTauri } from '@tauri-apps/api/core'

import type { DiffLine, GitFileStatus } from '@/types/git'

// Capa IPC de Git (Fase 4.3): git_status + git_diff_lines (no-ops en navegador)

export async function gitStatus(root: string): Promise<GitFileStatus[]> {
  if (isTauri()) {
    return invoke<GitFileStatus[]>('git_status', { root })
  }
  return []
}

export async function gitDiffLines(root: string, path: string): Promise<DiffLine[]> {
  if (isTauri()) {
    return invoke<DiffLine[]>('git_diff_lines', { root, path })
  }
  return []
}

// Acciones de Git (Fase 4.4)
export async function gitStage(root: string, path: string): Promise<void> {
  if (isTauri()) {
    await invoke('git_stage', { root, path })
  }
}

export async function gitUnstage(root: string, path: string): Promise<void> {
  if (isTauri()) {
    await invoke('git_unstage', { root, path })
  }
}

export async function gitCommit(root: string, message: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('git_commit', { root, message })
  }
  return ''
}

export async function gitPush(root: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('git_push', { root })
  }
  return ''
}

export async function gitPull(root: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('git_pull', { root })
  }
  return ''
}
