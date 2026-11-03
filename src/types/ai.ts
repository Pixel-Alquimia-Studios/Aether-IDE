export type ThinkingLevel = 'low' | 'medium' | 'high' | 'max'

/** Estado de una key que el frontend puede conocer (la key nunca sale del keychain) */
export interface ApiKeyStatus {
  configured: boolean
  /** Últimos 4 caracteres, calculados en Rust, solo si la key tiene >= 12 */
  hint: string | null
}

export type KeyValidationState = 'valid' | 'rejected' | 'unverifiable'

export type KeyValidationReason =
  | 'ok'
  | 'auth'
  | 'rateLimit'
  | 'serverError'
  | 'timeout'
  | 'noNetwork'
  | 'noModelsEndpoint'
  | 'unexpectedStatus'
  | 'redirect'
  | 'noKey'
  | 'noUrl'
  | 'noAuthenticatedCheck'

/** Resultado de validar una key: SOLO estado/motivo, nunca texto del cuerpo */
export interface KeyValidation {
  estado: KeyValidationState
  httpStatus?: number | null
  motivo: KeyValidationReason
}

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
