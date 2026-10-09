export interface AgentStep {
  type: 'text' | 'tool'
  role?: 'user' | 'assistant'
  content?: string
  name?: string
  args?: unknown
  status?: 'running' | 'done'
  output?: string
}
