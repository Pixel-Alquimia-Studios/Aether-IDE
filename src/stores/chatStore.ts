import { create } from 'zustand'

import { chatStream } from '@/lib/ai/api'
import { buildContextBlock, getActiveEditorContext, resolveMentions } from '@/lib/ai/context'
import { deleteChat as deleteChatApi, listChats, loadChat as loadChatApi, saveChat as saveChatApi } from '@/lib/ai/chats'
import { getActiveProviderConfig } from '@/stores/settingsStore'
import type { ChatMessage, ChatSummary, MentionContext, ThinkingLevel } from '@/types/chat'

interface ChatState {
  chatId: string | null
  chatTitle: string | null
  chatCreatedAt: number | null
  messages: ChatMessage[]
  history: ChatSummary[]
  streaming: boolean
  statusText: string | null
  error: string | null
  /** Default "Medium" */
  thinkingLevel: ThinkingLevel

  setThinkingLevel: (level: ThinkingLevel) => void
  refreshHistory: () => Promise<void>
  newChat: () => Promise<void>
  sendMessage: (text: string, mentions?: MentionContext[], options?: { includeAutoContext?: boolean }) => Promise<void>
  resumeChat: (id: string) => Promise<void>
  renameChat: (id: string, title: string) => Promise<void>
  deleteChat: (id: string) => Promise<void>
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || 'Chat sin título'
}

async function persist(get: () => ChatState): Promise<void> {
  const { chatId, chatTitle, chatCreatedAt, messages } = get()
  if (!chatId || messages.length === 0) return
  await saveChatApi({
    id: chatId,
    title: chatTitle ?? 'Chat sin título',
    createdAt: chatCreatedAt ?? Date.now(),
    updatedAt: Date.now(),
    messages: messages
      .filter((m) => m.content.trim() !== '')
      .map((m) => ({ role: m.role, content: m.content })),
  })
}

export const useChatStore = create<ChatState>()((set, get) => ({
  chatId: null,
  chatTitle: null,
  chatCreatedAt: null,
  messages: [],
  history: [],
  streaming: false,
  statusText: null,
  error: null,
  thinkingLevel: 'medium',

  setThinkingLevel: (level) => set({ thinkingLevel: level }),

  refreshHistory: async () => {
    try {
      set({ history: await listChats() })
    } catch {
      set({ history: [] })
    }
  },

  newChat: async () => {
    if (get().streaming) return
    await persist(get)
    set({ chatId: null, chatTitle: null, chatCreatedAt: null, messages: [], statusText: null, error: null })
    await get().refreshHistory()
  },

  sendMessage: async (text, mentions = [], options) => {
    const trimmed = text.trim()
    if (!trimmed || get().streaming) return
    const config = getActiveProviderConfig()
    if (!config || !config.model) {
      set({ error: 'Selecciona un proveedor y modelo en Ajustes' })
      return
    }

    let chatId = get().chatId
    if (!chatId) {
      chatId = makeId()
      set({
        chatId,
        chatTitle: titleFrom(trimmed),
        chatCreatedAt: Date.now(),
      })
    }

    // Contexto: menciones @ + archivo activo del editor (automático, salvo
    // que el usuario lo haya quitado con la ✕ de la pill)
    const currentCtx =
      options?.includeAutoContext === false ? null : getActiveEditorContext()
    const explicitMentions = currentCtx
      ? mentions.filter((m) => m.kind !== 'current')
      : mentions
    const fragments = await resolveMentions(explicitMentions)
    const contextBlock = buildContextBlock(fragments, currentCtx)
    const userPayload = contextBlock ? `${contextBlock}\n\n${trimmed}` : trimmed

    const history = [
      ...get().messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userPayload },
    ]

    set((state) => ({
      messages: [
        ...state.messages,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: '' },
      ],
      streaming: true,
      statusText: null,
      error: null,
    }))

    let thinkingStartedAt: number | null = null

    await chatStream(
      {
        providerId: config.providerId,
        model: config.model,
        messages: history,
        thinkingLevel: get().thinkingLevel,
      },
      {
        onDelta: (delta) => {
          const duration =
            thinkingStartedAt !== null ? Date.now() - thinkingStartedAt : undefined
          thinkingStartedAt = null
          set((state) => ({
            messages: state.messages.map((m, i) =>
              i === state.messages.length - 1
                ? {
                    ...m,
                    content: m.content + delta,
                    thinkingDurationMs: m.thinkingDurationMs ?? duration,
                  }
                : m,
            ),
          }))
        },
        onThinking: (text) => {
          if (thinkingStartedAt === null) thinkingStartedAt = Date.now()
          set((state) => ({
            messages: state.messages.map((m, i) =>
              i === state.messages.length - 1
                ? { ...m, thinking: (m.thinking ?? '') + text }
                : m,
            ),
          }))
        },
        onDone: () => {
          set({ streaming: false, statusText: null })
          void persist(get).then(() => get().refreshHistory())
        },
        onError: (message) => set({ streaming: false, error: message }),
        onStatus: (status) => set({ statusText: status }),
        onMetrics: (elapsedMs, tokens) =>
          set((state) => ({
            messages: state.messages.map((m, i) =>
              i === state.messages.length - 1 ? { ...m, metrics: { elapsedMs, tokens } } : m,
            ),
          })),
      },
    )
  },

  resumeChat: async (id) => {
    if (get().streaming) return
    await persist(get)
    const session = await loadChatApi(id)
    if (!session) {
      set({ error: 'No se pudo cargar el chat' })
      return
    }
    set({
      chatId: session.id,
      chatTitle: session.title,
      chatCreatedAt: session.createdAt,
      messages: session.messages
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() !== '')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      statusText: null,
      error: null,
    })
  },

  renameChat: async (id, title) => {
    const t = title.trim()
    if (!t) return
    if (get().chatId === id) {
      set({ chatTitle: t })
    }
    const session = await loadChatApi(id)
    if (!session) return
    await saveChatApi({ ...session, title: t, updatedAt: Date.now() })
    await get().refreshHistory()
  },

  deleteChat: async (id) => {
    await deleteChatApi(id)
    if (get().chatId === id) {
      set({ chatId: null, chatTitle: null, chatCreatedAt: null, messages: [] })
    }
    await get().refreshHistory()
  },
}))
