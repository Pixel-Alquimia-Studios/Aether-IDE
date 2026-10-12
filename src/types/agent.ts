export interface AgentStep {
  type: 'text' | 'tool' | 'report'
  role?: 'user' | 'assistant'
  content?: string
  name?: string
  args?: unknown
  status?: 'running' | 'done'
  output?: string
  /** Turno al que pertenece el paso (para Time Travel / rollback) */
  turnId?: string
  /** Timestamp de creación (para el timeline unificado) */
  ts?: number
  /** Identidad del subagente que ejecutó el paso (p. ej. "BugBot") */
  botName?: string
  /** Hallazgos de un subagente de análisis (step type: 'report') */
  findings?: AgentFinding[]
}

/** Hallazgo catalogado por un subagente de análisis (/qa, /security, /audit) */
export interface AgentFinding {
  severity: 'critical' | 'high' | 'medium' | 'low'
  file?: string
  line?: number
  title: string
  detail: string
}

/** Snapshot del contenido previo de un archivo antes de una edición del agente */
export interface AgentCheckpoint {
  id: string
  turnId: string
  path: string
  /** null = el archivo no existía antes (fue creado) */
  previousContent: string | null
}
