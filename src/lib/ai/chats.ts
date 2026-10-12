import { invoke, isTauri } from '@tauri-apps/api/core'

import type { ChatSession, ChatSummary } from '@/types/chat'

// Historial de chats: JSON en app-data (Tauri) con respaldo automático en
// localStorage; en navegador dev solo localStorage.
// Los chats son POR CARPETA: cada sesión guarda su workspace y el historial
// se filtra por el workspace activo.

const LS_KEY = 'aether-ide-chats'

function readLocal(): ChatSession[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as ChatSession[]) : []
  } catch {
    return []
  }
}

function writeLocal(chats: ChatSession[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(chats))
  } catch {
    // Almacenamiento lleno o no disponible
  }
}

export async function listChats(root: string): Promise<ChatSummary[]> {
  try {
    if (isTauri()) {
      return await invoke<ChatSummary[]>('list_chats', { root })
    }
  } catch {
    // Disco no disponible (reload/recarga): respaldo en localStorage
  }
  // Los chats son por carpeta: solo sesiones de ESTE workspace
  return readLocal()
    .filter((c) => c.workspaceRoot === root)
    .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadChat(id: string): Promise<ChatSession | null> {
  try {
    if (isTauri()) {
      const session = await invoke<ChatSession | null>('load_chat', { id })
      if (session) return session
    }
  } catch {
    // Disco no disponible: probar respaldo local
  }
  return readLocal().find((c) => c.id === id) ?? null
}

export async function saveChat(chat: ChatSession): Promise<void> {
  // Respaldo local SIEMPRE (barato y evita pérdidas si el disco falla)
  writeLocal([...readLocal().filter((c) => c.id !== chat.id), chat])
  try {
    if (isTauri()) {
      await invoke('save_chat', { chat })
    }
  } catch {
    // El respaldo en localStorage ya protege la sesión
  }
}

export async function deleteChat(id: string): Promise<void> {
  writeLocal(readLocal().filter((c) => c.id !== id))
  try {
    if (isTauri()) {
      await invoke('delete_chat', { id })
    }
  } catch {
    // El borrado local ya se aplicó
  }
}
