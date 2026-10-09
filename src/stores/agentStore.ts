import { create } from 'zustand'

import { chatWithTools } from '@/lib/ai/api'
import { buildContextBlock, getActiveEditorContext, resolveMentions } from '@/lib/ai/context'
import { AGENT_TOOLS, runTool } from '@/lib/agent/tools'
import { getActiveProviderConfig } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { AgentStep } from '@/types/agent'
import type { MentionContext } from '@/types/chat'

const MAX_STEPS = 12

const AGENT_SYSTEM_PROMPT =
  'Eres un agente de código dentro de un IDE. Tienes herramientas para leer archivos, buscar texto, listar directorios, escribir archivos y ejecutar comandos (escribir y ejecutar requieren confirmación del usuario). Resuelve la tarea paso a paso usando las herramientas. Cuando hayas terminado, responde al usuario con un resumen claro de lo que hiciste.'

interface AgentState {
  /** Modo del panel: chat conversacional o agente con herramientas */
  mode: 'chat' | 'agent'
  steps: AgentStep[]
  running: boolean
  /** Comando/escritura pendiente de confirmación del usuario */
  pendingCommand: string | null
  error: string | null

  setMode: (mode: 'chat' | 'agent') => void
  setPendingCommand: (label: string | null) => void
  reset: () => void
  runAgent: (task: string, mentions?: MentionContext[], options?: { includeAutoContext?: boolean }) => Promise<void>
}

export const useAgentStore = create<AgentState>()((set) => ({
  mode: 'chat',
  steps: [],
  running: false,
  pendingCommand: null,
  error: null,

  setMode: (mode) => set({ mode }),
  setPendingCommand: (label) => set({ pendingCommand: label }),
  reset: () => set({ steps: [], error: null }),

  // Bucle de razonamiento (tool loop): el frontend orquesta los pasos,
  // cada paso es una llamada chat_with_tools + ejecución de herramientas.
  runAgent: async (task, mentions = [], options) => {
    const trimmed = task.trim()
    if (!trimmed || useAgentStore.getState().running) return
    const config = getActiveProviderConfig()
    if (!config || !config.model) {
      set({ error: 'Selecciona un proveedor y modelo en Ajustes' })
      return
    }
    const workspaceRoot = useWorkspaceStore.getState().rootPath
    if (!workspaceRoot) {
      set({ error: 'Abre una carpeta del workspace primero' })
      return
    }

    set((state) => ({
      running: true,
      error: null,
      steps: [...state.steps, { type: 'text', role: 'user', content: trimmed }],
    }))

    // Contexto: menciones @ + archivo activo del editor (automático, salvo
    // que el usuario lo haya quitado con la ✕ de la pill)
    const currentCtx =
      options?.includeAutoContext === false ? null : getActiveEditorContext()
    const explicitMentions = currentCtx ? mentions.filter((m) => m.kind !== 'current') : mentions
    const fragments = await resolveMentions(explicitMentions)
    const contextBlock = buildContextBlock(fragments, currentCtx)
    const userPayload = contextBlock
      ? `${contextBlock}\n\nTarea: ${trimmed}`
      : `Tarea: ${trimmed}`

    const history: Array<{ role: string; content: string }> = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      { role: 'user', content: `Workspace: ${workspaceRoot}\n\n${userPayload}` },
    ]

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const response = await chatWithTools({
          providerId: config.providerId,
          model: config.model,
          messages: history,
          tools: AGENT_TOOLS,
          thinkingLevel: useChatStore.getState().thinkingLevel,
        })

        if (response.type === 'text') {
          set((state) => ({
            steps: [...state.steps, { type: 'text', role: 'assistant', content: response.text }],
          }))
          return
        }

        if (response.message.trim()) {
          set((state) => ({
            steps: [...state.steps, { type: 'text', role: 'assistant', content: response.message }],
          }))
        }
        history.push({
          role: 'assistant',
          content:
            response.message ||
            `[Solicitó herramientas: ${response.calls.map((c) => c.name).join(', ')}]`,
        })

        for (const call of response.calls) {
          set((state) => ({
            steps: [
              ...state.steps,
              { type: 'tool', name: call.name, args: call.arguments, status: 'running' },
            ],
          }))
          const output = await runTool(call, workspaceRoot)
          set((state) => {
            const steps = [...state.steps]
            const last = steps.length - 1
            if (last >= 0 && steps[last].type === 'tool' && steps[last].status === 'running') {
              steps[last] = { ...steps[last], status: 'done', output }
            }
            return { steps }
          })
          history.push({
            role: 'user',
            content: `Resultado de ${call.name}:\n${output}\n\nContinúa con la tarea o, si ya terminaste, responde al usuario con un resumen.`,
          })
        }
      }
      set((state) => ({
        steps: [
          ...state.steps,
          {
            type: 'text',
            role: 'assistant',
            content: `He alcanzado el límite de pasos (${MAX_STEPS}) sin completar la tarea.`,
          },
        ],
      }))
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ running: false })
    }
  },
}))
