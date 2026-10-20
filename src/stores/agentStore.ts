import { create } from 'zustand'

import { chatWithTools } from '@/lib/ai/api'
import { buildContextBlock, getActiveEditorContext, resolveMentions } from '@/lib/ai/context'
import { AGENT_TOOLS, runTool } from '@/lib/agent/tools'
import { SUBAGENT_TOOL_NAMES, parseFindings, type SubagentDef } from '@/lib/agent/subagents'
import { getActiveProviderConfig } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { AgentCheckpoint, AgentStep } from '@/types/agent'
import type { MentionContext } from '@/types/chat'

// Límite del agente mutador (protección contra bucles de escritura).
// Los SUBAGENTES de análisis (/qa, /security, /audit) NO tienen límite:
// son de solo lectura y no pueden dañar nada — cortarlos a mitad de
// análisis destruía el reporte.
const MAX_STEPS = 40

// Entorno detectado: el agente debe conocer el SO y la shell para no usar
// sintaxis equivocada (cat/Get-Content contra cmd.exe, etc.)
const OS_HINT = navigator.userAgent.includes('Windows')
  ? 'ENTORNO: Windows. Los comandos se ejecutan con PowerShell (powershell.exe). Usa cmdlets: "Get-Content archivo" para ver contenido, "Get-ChildItem" para listar, "Set-Content" para escribir. IMPORTANTE: las rutas con espacios DEBEN ir SIEMPRE entre comillas dobles: "C:\\Users\\Mi Carpeta\\...". El comando ya se ejecuta con el workspace como directorio actual: NO uses "cd".'
  : 'ENTORNO: sistema Unix. Los comandos se ejecutan con sh — usa comandos POSIX estándar.'

const AGENT_SYSTEM_PROMPT = `Eres un agente de código dentro de un IDE.

${OS_HINT}

Tienes herramientas para leer archivos, buscar texto, listar directorios, escribir archivos y ejecutar comandos (escribir y ejecutar requieren confirmación del usuario). Resuelve la tarea paso a paso usando las herramientas. Cuando hayas terminado, responde al usuario con un resumen claro de lo que hiciste.`

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// --- Confirmación de acciones destructivas (C1, v0.3.1) ---

/** Detalle completo de la acción pendiente (lo que el usuario debe ver ANTES de aprobar) */
export interface PendingApproval {
  kind: 'write_file' | 'execute_command'
  path?: string
  content?: string
  command?: string
}

// El resolver vive en el módulo del store (no en el componente): así Stop
// puede auto-denegar una aprobación pendiente y el bucle nunca queda colgado
// esperando una UI que no existe.
let approvalResolver: ((approved: boolean) => void) | null = null

interface AgentState {
  /** Modo del panel: plan (texto normal) o agent (ejecuta tareas) */
  mode: 'plan' | 'agent'
  steps: AgentStep[]
  running: boolean
  /** Acción destructiva pendiente de confirmación (diálogo en ChatPanel) */
  pendingApproval: PendingApproval | null
  error: string | null
  /** Snapshots de archivos previos a las ediciones del agente (Time Travel) */
  checkpoints: AgentCheckpoint[]
  /** Fase E: detener el bucle del agente en el siguiente paso */
  stopRequested: boolean

  setMode: (mode: 'plan' | 'agent') => void
  /** Bloquea el bucle hasta que el usuario apruebe/deniegue (C1) */
  requestApproval: (details: PendingApproval) => Promise<boolean>
  resolveApproval: (approved: boolean) => void
  /** Reemplaza los pasos mostrados (al reanudar un chat desde el historial) */
  setSteps: (steps: AgentStep[]) => void
  addCheckpoint: (checkpoint: AgentCheckpoint) => void
  applyRollback: (turnIds: Set<string>) => void
  reset: () => void
  stopAgent: () => void
  runAgent: (
    task: string,
    mentions?: MentionContext[],
    options?: { includeAutoContext?: boolean },
    turnId?: string,
    subagent?: SubagentDef,
  ) => Promise<void>
}

export const useAgentStore = create<AgentState>()((set) => ({
  mode: 'plan',
  steps: [],
  running: false,
  pendingApproval: null,
  error: null,
  checkpoints: [],
  stopRequested: false,

  setMode: (mode) => set({ mode }),
  requestApproval: (details) =>
    new Promise((resolve) => {
      approvalResolver = resolve
      set({ pendingApproval: details })
    }),
  resolveApproval: (approved) => {
    const resolver = approvalResolver
    approvalResolver = null
    set({ pendingApproval: null })
    resolver?.(approved)
  },
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
  // Fase E: el bucle se detiene en el siguiente paso. Si había una
  // confirmación pendiente, se auto-deniega (el bucle nunca queda colgado)
  stopAgent: () => {
    const resolver = approvalResolver
    approvalResolver = null
    if (resolver) {
      set({ pendingApproval: null, stopRequested: true })
      resolver(false)
    } else {
      set({ stopRequested: true })
    }
  },

  // Bucle de razonamiento (tool loop): el frontend orquesta los pasos.
  // Con subagent (/qa, /security, /audit): tools de SOLO LECTURA y system
  // prompt especializado — el reporte final se parsea como tarjetas de
  // hallazgos. Sin subagente: agente completo con todas las herramientas.
  runAgent: async (task, mentions = [], options, turnId, subagent) => {
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

    set({ running: true, error: null, stopRequested: false })

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

    const systemPrompt = subagent ? subagent.systemPrompt : AGENT_SYSTEM_PROMPT
    const tools = subagent
      ? AGENT_TOOLS.filter((t) => SUBAGENT_TOOL_NAMES.has(t.name))
      : AGENT_TOOLS

    // Los SUBAGENTES (solo lectura) corren SIN límite de pasos; el agente
    // mutador conserva un tope alto como protección de escrituras
    const maxSteps = subagent ? Number.POSITIVE_INFINITY : MAX_STEPS

    const history: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Workspace: ${workspaceRoot}\n\n${userPayload}` },
    ]

    try {
      for (let step = 0; step < maxSteps; step++) {
        // Fase E: el botón Detener corta el bucle en el siguiente paso
        if (useAgentStore.getState().stopRequested) {
          set((state) => ({
            steps: [
              ...state.steps,
              {
                type: 'text',
                role: 'assistant',
                content: '⏹ Detenido por el usuario.',
                turnId: turn,
                ts: Date.now(),
                botName: subagent?.botName,
              },
            ],
          }))
          void useChatStore.getState().persistActive()
          return
        }
        const response = await chatWithTools({
          providerId: config.providerId,
          model: config.model,
          messages: history,
          tools,
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

          const reportTs = Date.now()
          const findings = subagent ? parseFindings(response.text) : null
          set((state) => ({
            steps: [
              ...state.steps,
              {
                type: 'text',
                role: 'assistant',
                content: response.text,
                turnId: turn,
                ts: reportTs,
                botName: subagent?.botName,
              },
              ...(findings && findings.length > 0
                ? [
                    {
                      type: 'report' as const,
                      findings,
                      turnId: turn,
                      ts: reportTs + 1,
                      botName: subagent?.botName,
                    },
                  ]
                : []),
            ],
          }))
          void useChatStore.getState().persistActive()
          return
        }

        if (response.message.trim()) {
          set((state) => ({
            steps: [
              ...state.steps,
              {
                type: 'text',
                role: 'assistant',
                content: response.message,
                turnId: turn,
                ts: Date.now(),
                botName: subagent?.botName,
              },
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
              {
                type: 'tool',
                name: call.name,
                args: call.arguments,
                status: 'running',
                turnId: turn,
                ts: Date.now(),
                botName: subagent?.botName,
              },
            ],
          }))
          // M3: los subagentes de análisis son de solo lectura — hard-deny
          const output = await runTool(call, workspaceRoot, turn, !!subagent)
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
            ts: Date.now(),
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
      set({ running: false, stopRequested: false })
    }
  },
}))
