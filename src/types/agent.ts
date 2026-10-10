export interface AgentStep {
  type: 'text' | 'tool'
  role?: 'user' | 'assistant'
  content?: string
  name?: string
  args?: unknown
  status?: 'running' | 'done'
  output?: string
  /** Turno al que pertenece el paso (para Time Travel / rollback) */
  turnId?: string
}

/** Snapshot del contenido previo de un archivo antes de una edición del agente */
export interface AgentCheckpoint {
  id: string
  turnId: string
  path: string
  /** null = el archivo no existía antes (fue creado) */
  previousContent: string | null
}
