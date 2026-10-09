export type ThinkingLevel = 'low' | 'medium' | 'high' | 'max'

export interface ModelInfo {
  id: string
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
