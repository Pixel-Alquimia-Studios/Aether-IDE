export type ThinkingLevel = 'low' | 'medium' | 'high' | 'max'

export interface ModelInfo {
  id: string
  /** Nombre legible del catálogo del proveedor (opcional; p. ej. OpenRouter) */
  name?: string
  maxContextTokens: number | null
  modalities: string[]
}

export interface ProviderInfo {
  id: string
  name: string
  kind: 'cloud' | 'local'
  requiresKey: boolean
  baseUrl: string
  chatPath?: string
  defaultModels: ModelInfo[]
  /** Parámetros que el adaptador NO envía (p. ej. Moonshot: temperature, max_tokens) */
  omitParams?: string[]
}

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema de los parámetros */
  parameters: unknown
}

export interface ToolCall {
  id: string
  name: string
  arguments: unknown
}

export type ToolResponse =
  | { type: 'text'; text: string }
  | { type: 'toolCalls'; message: string; calls: ToolCall[] }
