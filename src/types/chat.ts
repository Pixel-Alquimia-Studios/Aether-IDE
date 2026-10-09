export type ThinkingLevel = 'low' | 'medium' | 'high' | 'max'

/** Contexto adjuntado a un mensaje vía menciones @ */
export interface MentionContext {
  kind: 'file' | 'codebase' | 'current'
  /** Etiqueta visible en la pill (nombre de archivo o "codebase"/"current") */
  label: string
  /** Ruta para kind === 'file' */
  path?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Razonamiento acumulado (Chain of Thought) del modelo */
  thinking?: string
  /** Duración del razonamiento (hasta el primer contenido) */
  thinkingDurationMs?: number
  /** Métricas de la respuesta (tiempo medido en Rust + tokens aproximados) */
  metrics?: { elapsedMs: number; tokens: number }
}

export interface StoredChatMessage {
  role: string
  content: string
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
}
