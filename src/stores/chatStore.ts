import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'

import { chatStream } from '@/lib/ai/api'
import { tSync } from '@/lib/i18n'
import { buildContextBlock, getActiveEditorContext, resolveMentions } from '@/lib/ai/context'
import { deleteChat as deleteChatApi, listChats, loadChat as loadChatApi, saveChat as saveChatApi } from '@/lib/ai/chats'
import { getActiveProviderConfig } from '@/stores/settingsStore'
import { useAgentStore } from '@/stores/agentStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ChatMessage, ChatSummary, MentionContext, ThinkingLevel } from '@/types/chat'

interface ChatState {
  chatId: string | null
  chatTitle: string | null
  chatCreatedAt: number | null
  /** Workspace al que pertenece el chat activo — los chats son por carpeta */
  chatWorkspaceRoot: string | null
  messages: ChatMessage[]
  history: ChatSummary[]
  streaming: boolean
  statusText: string | null
  error: string | null
  /** Default "Medium" */
  thinkingLevel: ThinkingLevel
  /** Task del stream en curso (para el botón Detener / Fase E) */
  activeStreamTaskId: string | null

  setThinkingLevel: (level: ThinkingLevel) => void
  refreshHistory: () => Promise<void>
  newChat: () => Promise<void>
  /** Persiste el chat activo (mensajes + pasos del agente) sin cambiar la sesión */
  persistActive: () => Promise<void>
  /** Modo agente: crea la sesión si no existe (título desde la orden) y registra la tarea */
  ensureAgentChat: (task: string, turnId: string) => void
  /** Limpia el chat activo (al cambiar de workspace tras guardar) */
  clearActiveChat: () => void
  /** Detiene el stream en curso (botón Detener — Fase E) */
  cancelStream: () => void
  sendMessage: (text: string, mentions?: MentionContext[], options?: { includeAutoContext?: boolean }) => Promise<void>
  applyRollback: (turnIds: Set<string>) => void
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
  const { chatId, chatTitle, chatCreatedAt, chatWorkspaceRoot, messages } = get()
  if (!chatId || messages.length === 0) return
  // Los pasos del agente del chat activo se guardan con la conversación
  const agentSteps = useAgentStore.getState().steps
  await saveChatApi({
    id: chatId,
    title: chatTitle ?? 'Chat sin título',
    createdAt: chatCreatedAt ?? Date.now(),
    updatedAt: Date.now(),
    messages: messages
      .filter((m) => m.content.trim() !== '')
      // turnId se persiste: sin él el Time Travel deja de funcionar tras
      // reanudar el chat (el rollback no encuentra los turnos)
      .map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.turnId ? { turnId: m.turnId } : {}),
      })),
    agentSteps: agentSteps.length > 0 ? agentSteps : undefined,
    // El chat pertenece a la carpeta donde se creó (no cambia si el usuario
    // abre otra carpeta después)
    workspaceRoot: chatWorkspaceRoot ?? undefined,
  })
}

export const useChatStore = create<ChatState>()((set, get) => ({
  chatId: null,
  chatTitle: null,
  chatCreatedAt: null,
  chatWorkspaceRoot: null,
  messages: [],
  history: [],
  streaming: false,
  statusText: null,
  error: null,
  thinkingLevel: 'medium',
  activeStreamTaskId: null,

  setThinkingLevel: (level) => set({ thinkingLevel: level }),

  // Fase E: DETENER — aborta el task del stream en Rust (chat_stop) y corta
  // la UI al instante. El contenido parcial del assistant queda en el chat.
  cancelStream: () => {
    const taskId = get().activeStreamTaskId
    if (taskId) {
      void invoke('chat_stop', { taskId }).catch(() => undefined)
    }
    set({
      activeStreamTaskId: null,
      streaming: false,
      statusText: '⏹ ' + tSync('chat.detenido'),
    })
  },

  // Time Travel: trunca el chat desde el primer mensaje cuyo turno fue
  // revertido (los archivos los restaura rollback.ts vía los checkpoints)
  applyRollback: (turnIds) => {
    const messages = get().messages
    const firstIdx = messages.findIndex(
      (m) => m.role === 'user' && m.turnId && turnIds.has(m.turnId),
    )
    if (firstIdx === -1) return
    set({ messages: messages.slice(0, firstIdx) })
  },

  refreshHistory: async () => {
    // Historial filtrado por el workspace activo (los chats son por carpeta)
    const root = useWorkspaceStore.getState().rootPath ?? ''
    try {
      set({ history: await listChats(root) })
    } catch {
      set({ history: [] })
    }
  },

  newChat: async () => {
    if (get().streaming) return
    // Guarda la sesión actual (NO se borra) y limpia el panel para empezar
    await persist(get)
    set({ chatId: null, chatTitle: null, chatCreatedAt: null, chatWorkspaceRoot: null, messages: [], statusText: null, error: null })
    useAgentStore.getState().reset()
    await get().refreshHistory()
  },

  // Limpia el chat activo (tras guardar) — usado al cambiar de workspace
  clearActiveChat: () => {
    set({ chatId: null, chatTitle: null, chatCreatedAt: null, chatWorkspaceRoot: null, messages: [], statusText: null, error: null })
    useAgentStore.getState().reset()
  },

  persistActive: async () => {
    await persist(get)
  },

  // Modo agente: crea la sesión de chat si no existe (con título basado en la
  // orden) y registra la tarea como mensaje — así el chat del agente queda
  // en el historial y se persiste como cualquier conversación.
  ensureAgentChat: (task, turnId) => {
    if (!get().chatId) {
      // El chat queda ligado al workspace activo en el momento de crearse
      set({
        chatId: makeId(),
        chatTitle: titleFrom(task),
        chatCreatedAt: Date.now(),
        chatWorkspaceRoot: useWorkspaceStore.getState().rootPath,
      })
    }
    set((state) => ({
      messages: [
        ...state.messages,
        { role: 'user', content: task, turnId, ts: Date.now() },
      ],
    }))
    // Persist + refresh: el chat del agente aparece en el historial al instante
    void persist(get).then(() => get().refreshHistory())
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
        chatWorkspaceRoot: useWorkspaceStore.getState().rootPath,
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

    // Turno asociado a este mensaje (para Time Travel / rollback) + taskId del
    // stream (para el botón Detener)
    const turnId = `turn-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const streamTaskId = `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`

    const now = Date.now()

    set((state) => ({
      messages: [
        ...state.messages,
        { role: 'user', content: trimmed, turnId, ts: now },
        { role: 'assistant', content: '', ts: now },
      ],
      streaming: true,
      statusText: null,
      error: null,
      activeStreamTaskId: streamTaskId,
    }))

    // Persist inmediato: el mensaje del usuario sobrevive a un reload de HMR
    void persist(get)

    let thinkingStartedAt: number | null = null

    await chatStream(
      {
        providerId: config.providerId,
        model: config.model,
        messages: history,
        thinkingLevel: get().thinkingLevel,
        taskId: streamTaskId,
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
          set({ streaming: false, statusText: null, activeStreamTaskId: null })
          void persist(get).then(() => get().refreshHistory())
        },
        onError: (message) => {
          set({
            streaming: false,
            error: get().statusText?.includes('⏹') ? null : message,
            activeStreamTaskId: null,
          })
        },
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
      chatWorkspaceRoot: session.workspaceRoot ?? null,
      messages: session.messages
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() !== '')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ...(m.turnId ? { turnId: m.turnId } : {}),
        })),
      statusText: null,
      error: null,
    })
    // Restaurar también los pasos del agente guardados con la sesión
    // (sin los steps 'user': redundantes — la tarea vive como chat message)
    useAgentStore
      .getState()
      .setSteps(
        (session.agentSteps ?? []).filter((s) => !(s.type === 'text' && s.role === 'user')),
      )
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
      set({ chatId: null, chatTitle: null, chatCreatedAt: null, chatWorkspaceRoot: null, messages: [] })
    }
    await get().refreshHistory()
  },
}))
