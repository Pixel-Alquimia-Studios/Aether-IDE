import { Channel, invoke, isTauri } from '@tauri-apps/api/core'
import type { InvokeArgs } from '@tauri-apps/api/core'

import type { ModelInfo, ProviderInfo, ToolDef, ToolResponse } from '@/types/ai'
import type { ThinkingLevel } from '@/types/chat'

// Capa IPC del gateway de IA (Fase 3). Streaming por Channel de Tauri v2
// (más eficiente que eventos para tokens). Las API keys nunca viajan al frontend.

export type { ModelInfo, ProviderInfo, ToolDef, ToolResponse }

// Invoca con reintentos: el protocolo IPC HTTP de Tauri puede tardar en
// inicializarse tras un reload (HMR/refresh); los invoke en vuelo fallan con
// "Failed to fetch". Se reintenta hasta 3 veces separadas por 500 ms para
// esperar la inicialización del protocolo antes de lanzar un error fatal.
async function invokeWithRetry<T>(cmd: string, args?: InvokeArgs, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await invoke<T>(cmd, args)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isIpcInitError =
        msg.includes('Failed to fetch') || msg.includes('Failed to execute')
      if (attempt < retries && isIpcInitError) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        continue
      }
      throw e
    }
  }
  throw new Error(`invokeWithRetry agotó los reintentos: ${cmd}`)
}

export interface StreamChunk {
  type: 'delta' | 'thinking' | 'status' | 'metrics' | 'done' | 'error'
  text?: string
  message?: string
  elapsedMs?: number
  tokens?: number
  inputTokens?: number
  cachedTokens?: number
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  /** Contenido de razonamiento (Chain of Thought) del modelo */
  onThinking?: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
  onStatus?: (message: string) => void
  onMetrics?: (
    elapsedMs: number,
    tokens: number,
    extra?: { inputTokens?: number; cachedTokens?: number },
  ) => void
}

export async function listProviders(): Promise<ProviderInfo[]> {
  if (isTauri()) {
    return invokeWithRetry<ProviderInfo[]>('list_providers')
  }
  const { MOCK_PROVIDERS } = await import('./mockProviders')
  return MOCK_PROVIDERS
}

export async function hasApiKey(providerId: string): Promise<boolean> {
  if (isTauri()) {
    return invokeWithRetry<boolean>('has_api_key', { providerId })
  }
  return false
}

export async function saveApiKey(providerId: string, apiKey: string): Promise<void> {
  if (isTauri()) {
    await invokeWithRetry<void>('set_api_key', { providerId, apiKey })
  }
}

export async function deleteApiKey(providerId: string): Promise<void> {
  if (isTauri()) {
    await invokeWithRetry<void>('delete_api_key', { providerId })
  }
}

export async function fetchModels(providerId: string): Promise<ModelInfo[]> {
  if (isTauri()) {
    return invokeWithRetry<ModelInfo[]>('fetch_models', { providerId })
  }
  const { MOCK_PROVIDERS } = await import('./mockProviders')
  const provider = MOCK_PROVIDERS.find((p) => p.id === providerId)
  return provider?.defaultModels ?? []
}

export interface ChatParams {
  providerId: string
  model: string
  messages: Array<{ role: string; content: string }>
  thinkingLevel?: ThinkingLevel
  /** Identifica el stream para poder DETENERLO con chat_stop (Fase E) */
  taskId?: string
}

export async function chatStream(params: ChatParams, handlers: StreamHandlers): Promise<void> {
  if (!isTauri()) {
    handlers.onError('El chat de IA requiere la app de escritorio (Tauri)')
    return
  }
  const channel = new Channel<StreamChunk>()
  channel.onmessage = (chunk) => {
    if (chunk.type === 'delta' && chunk.text) handlers.onDelta(chunk.text)
    else if (chunk.type === 'thinking' && handlers.onThinking) handlers.onThinking(chunk.text ?? '')
    else if (chunk.type === 'status' && handlers.onStatus) handlers.onStatus(chunk.message ?? '')
    else if (chunk.type === 'metrics' && handlers.onMetrics)
      handlers.onMetrics(chunk.elapsedMs ?? 0, chunk.tokens ?? 0, {
        inputTokens: chunk.inputTokens,
        cachedTokens: chunk.cachedTokens,
      })
    else if (chunk.type === 'done') handlers.onDone()
    else if (chunk.type === 'error') handlers.onError(chunk.message ?? 'Error desconocido')
  }
  try {
    // El comando resuelve al instante (el stream corre en un task abortable);
    // el contenido sigue llegando por el Channel hasta Done o cancelación
    await invokeWithRetry<void>('chat_stream', {
      providerId: params.providerId,
      model: params.model,
      messages: params.messages,
      thinkingLevel: params.thinkingLevel ?? null,
      taskId: params.taskId ?? null,
      onChunk: channel,
    })
  } catch (e) {
    handlers.onError(e instanceof Error ? e.message : String(e))
  }
}

// Autocompletado inline (sin streaming); falla silenciosamente
export async function inlineCompletion(params: {
  providerId: string
  model: string
  prefix: string
  suffix: string
  language: string
}): Promise<string | null> {
  if (!isTauri()) return null
  try {
    return await invokeWithRetry<string | null>('inline_completion', {
      providerId: params.providerId,
      model: params.model,
      request: {
        prefix: params.prefix,
        suffix: params.suffix,
        language: params.language,
      },
    })
  } catch {
    return null
  }
}

// Modo agente: una llamada al LLM con tools (sin streaming).
// El bucle agéntico lo orquesta el agentStore en el frontend.
export async function chatWithTools(params: {
  providerId: string
  model: string
  messages: Array<{ role: string; content: string }>
  tools: ToolDef[]
  thinkingLevel?: ThinkingLevel
}): Promise<ToolResponse> {
  if (!isTauri()) {
    throw new Error('El modo agente requiere la app de escritorio (Tauri)')
  }
  return invokeWithRetry<ToolResponse>('chat_with_tools', {
    providerId: params.providerId,
    model: params.model,
    messages: params.messages,
    tools: params.tools,
    taskId: `agent-step-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    thinkingLevel: params.thinkingLevel ?? null,
  })
}
