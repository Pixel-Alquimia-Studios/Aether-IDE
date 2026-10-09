import { invoke, isTauri } from '@tauri-apps/api/core'

import type { ChatSession, ChatSummary } from '@/types/chat'

// Historial de chats: archivos JSON en app-data (Tauri) o localStorage (dev en navegador)

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

export async function listChats(): Promise<ChatSummary[]> {
  if (isTauri()) {
    return invoke<ChatSummary[]>('list_chats')
  }
  return readLocal()
    .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadChat(id: string): Promise<ChatSession | null> {
  if (isTauri()) {
    return invoke<ChatSession | null>('load_chat', { id })
  }
  return readLocal().find((c) => c.id === id) ?? null
}

export async function saveChat(chat: ChatSession): Promise<void> {
  if (isTauri()) {
    await invoke('save_chat', { chat })
    return
  }
  const chats = readLocal().filter((c) => c.id !== chat.id)
  chats.push(chat)
  writeLocal(chats)
}

export async function deleteChat(id: string): Promise<void> {
  if (isTauri()) {
    await invoke('delete_chat', { id })
    return
  }
  writeLocal(readLocal().filter((c) => c.id !== id))
}
