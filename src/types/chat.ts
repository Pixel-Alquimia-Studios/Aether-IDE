import type { AgentStep } from '@/types/agent'

export type ThinkingLevel = 'low' | 'medium' | 'high' | 'max'

/** Contexto adjuntado a un mensaje vía menciones @ */
export interface MentionContext {
  kind: 'file' | 'codebase' | 'current'
  /** Etiqueta visible en la pill (nombre de archivo o "codebase"/"current") */
  label: string
  /** Ruta para kind === 'file' */
  path?: string
}

export interface StoredChatMessage {
  role: string
  content: string
  /** Identificador de turno (para Agent Time Travel / rollback); persistido */
  turnId?: string
}

export interface ChatSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: StoredChatMessage[]
  /** Pasos del agente asociados a la conversación (persistidos con la sesión) */
  agentSteps?: AgentStep[]
  /** Workspace al que pertenece la sesión — los chats son por carpeta */
  workspaceRoot?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Identificador de turno (para Agent Time Travel / rollback) */
  turnId?: string
  /** Timestamp de creación (para el timeline unificado) */
  ts?: number
  /** Razonamiento acumulado (Chain of Thought) del modelo */
  thinking?: string
  /** Duración del razonamiento (hasta el primer contenido) */
  thinkingDurationMs?: number
  /** Métricas de la respuesta: tiempo + tokens (reales si el proveedor los
   * entrega, estimación chars/4 si no) + tokens de entrada y cacheados */
  metrics?: {
    elapsedMs: number
    tokens: number
    inputTokens?: number
    cachedTokens?: number
  }
}
