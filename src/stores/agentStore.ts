import { create } from 'zustand'

import { chatWithTools } from '@/lib/ai/api'
import { buildContextBlock, getActiveEditorContext, resolveMentions } from '@/lib/ai/context'
import { AGENT_TOOLS, runTool } from '@/lib/agent/tools'
import { getActiveProviderConfig } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { AgentCheckpoint, AgentStep } from '@/types/agent'
import type { MentionContext } from '@/types/chat'

const MAX_STEPS = 20

// Entorno detectado: el agente debe conocer el SO y la shell para no usar
// sintaxis equivocada (cat/Get-Content contra cmd.exe, etc.)
const OS_HINT = navigator.userAgent.includes('Windows')
  ? 'ENTORNO: Windows. Los comandos se ejecutan con PowerShell (powershell.exe). Usa cmdlets: "Get-Content archivo" para ver contenido, "Get-ChildItem" para listar, "Set-Content" para escribir. IMPORTANTE: las rutas con espacios DEBEN ir SIEMPRE entre comillas dobles: "C:\\Users\\Mi Carpeta\\...". El comando ya se ejecuta con el workspace como directorio actual: NO uses "cd".'
  : 'ENTORNO: sistema Unix. Los comandos se ejecutan con sh — usa comandos POSIX estándar.'

const AGENT_SYSTEM_PROMPT = `Eres un agente de código dentro de un IDE. Tienes herramientas para leer archivos, buscar texto, listar directorios, escribir archivos y ejecutar comandos (escribir y ejecutar requieren confirmación del usuario). Resuelve la tarea paso a paso usando las herramientas.

${OS_HINT}

REGLAS DE EFICIENCIA: usa search_files para localizar código ANTES de leer; NO releas el mismo archivo (el output de read_file se trunca a 2000 caracteres); no ejecutes comandos que ya fallaron con la misma sintaxis; no releas para "verificar": confía en el resultado de write_file. Cuando hayas terminado, responde al usuario con un resumen claro de lo que hiciste.`

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

interface AgentState {
  /** Modo del panel: chat conversacional o agente con herramientas */
  mode: 'chat' | 'agent'
  steps: AgentStep[]
  running: boolean
  /** Comando/escritura pendiente de confirmación del usuario */
  pendingCommand: string | null
  error: string | null
  /** Snapshots de archivos previos a las ediciones del agente (Time Travel) */
  checkpoints: AgentCheckpoint[]

  setMode: (mode: 'chat' | 'agent') => void
  setPendingCommand: (label: string | null) => void
  /** Reemplaza los pasos mostrados (al reanudar un chat desde el historial) */
  setSteps: (steps: AgentStep[]) => void
  addCheckpoint: (checkpoint: AgentCheckpoint) => void
  applyRollback: (turnIds: Set<string>) => void
  reset: () => void
  runAgent: (task: string, mentions?: MentionContext[], options?: { includeAutoContext?: boolean }, turnId?: string) => Promise<void>
}

export const useAgentStore = create<AgentState>()((set) => ({
  mode: 'chat',
  steps: [],
  running: false,
  pendingCommand: null,
  error: null,
  checkpoints: [],

  setMode: (mode) => set({ mode }),
  setPendingCommand: (label) => set({ pendingCommand: label }),
  setSteps: (steps) => set({ steps }),
  addCheckpoint: (checkpoint) =>
    set((state) => ({ checkpoints: [...state.checkpoints, checkpoint] })),
  // Time Travel: elimina checkpoints y steps de los turnos revertidos
  applyRollback: (turnIds) =>
    set((state) => ({
      checkpoints: state.checkpoints.filter((cp) => !turnIds.has(cp.turnId)),
      steps: state.steps.filter((s) => !(s.turnId && turnIds.has(s.turnId))),
    })),
  reset: () => set({ steps: [], error: null }),

  // Bucle de razonamiento (tool loop): el frontend orquesta los pasos,
  // cada paso es una llamada chat_with_tools + ejecución de herramientas.
  runAgent: async (task, mentions = [], options, turnId) => {
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

    // Turno asociado a este run (para checkpoints y rollback del Time Travel)
    const turn = turnId ?? makeId()

    // Modo agente: asegura la sesión de chat (título desde la orden) y
    // registra la tarea como mensaje para que quede en el historial
    useChatStore.getState().ensureAgentChat(trimmed, turn)

    set((state) => ({
      running: true,
      error: null,
      steps: [...state.steps, { type: 'text', role: 'user', content: trimmed, turnId: turn }],
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
          // Anti-ecolalia: el modelo copió la anotación interna del historial
          // en vez de usar function calling — se corrige y se continúa el bucle
          if (
            /^\[(Solicitó herramientas|Llamaste a la herramienta)/.test(response.text.trim())
          ) {
            history.push({ role: 'assistant', content: response.text })
            history.push({
              role: 'user',
              content:
                'No repitas anotaciones internas del historial. Usa las herramientas con function calling o escribe el resumen final para el usuario.',
            })
            continue
          }
          set((state) => ({
            steps: [
              ...state.steps,
              { type: 'text', role: 'assistant', content: response.text, turnId: turn },
            ],
          }))
          void useChatStore.getState().persistActive()
          return
        }

        if (response.message.trim()) {
          set((state) => ({
            steps: [
              ...state.steps,
              { type: 'text', role: 'assistant', content: response.message, turnId: turn },
            ],
          }))
        }
        history.push({
          role: 'assistant',
          content:
            response.message ||
            `[Llamaste a la herramienta ${response.calls.map((c) => c.name).join(', ')}. El resultado llegará en el siguiente mensaje.]`,
        })

        for (const call of response.calls) {
          set((state) => ({
            steps: [
              ...state.steps,
              { type: 'tool', name: call.name, args: call.arguments, status: 'running', turnId: turn },
            ],
          }))
          const output = await runTool(call, workspaceRoot, turn)
          // Persist inmediato: los writes aprobados sobreviven a un reload
          void useChatStore.getState().persistActive()
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
            turnId: turn,
          },
        ],
      }))
      void useChatStore.getState().persistActive()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Fallo de inicialización del IPC (reload/HMR): mensaje claro y no fatal
      if (message.includes('Failed to fetch') || message.includes('Failed to execute')) {
        set({
          error:
            'El gateway de IA se está reiniciando (recarga detectada). Reenvía la tarea.',
        })
      } else {
        set({ error: message })
      }
    } finally {
      set({ running: false })
    }
  },
}))
