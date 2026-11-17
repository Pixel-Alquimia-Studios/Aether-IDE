import { create } from 'zustand'

import { chatStop, chatWithTools } from '@/lib/ai/api'
import { buildContextBlock, getActiveEditorContext, resolveMentions } from '@/lib/ai/context'
import { AGENT_TOOLS, runTool } from '@/lib/agent/tools'
import { detectProjectLanguages } from '@/lib/agent/languageDetect'
import {
  SUBAGENT_TOOL_NAMES,
  parseFindings,
  type SubagentDef,
} from '@/lib/agent/subagents'
import {
  MAX_TOOL_CALLS_SUBAGENT,
  codeScope,
  decideCoverage,
  normalizeForCoverage,
  trackRepeat,
  type RepeatState,
} from '@/lib/agent/subagentCoverage'
import { resolvePath } from '@/lib/workspace/format'
import { getActiveProviderConfig, useSettingsStore } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { useEditorStore } from '@/stores/editorStore'
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

Tienes herramientas para leer archivos, buscar texto, listar directorios, escribir archivos y ejecutar comandos (escribir y ejecutar requieren confirmación del usuario). Para leer archivos usa read_file, para listar carpetas list_directory y para buscar texto search_files: los comandos de shell como cat, type, head, tail, wc, ls y dir NO se ejecutan automáticamente y pedirán confirmación. Resuelve la tarea paso a paso usando las herramientas. Cuando hayas terminado, responde al usuario con un resumen claro de lo que hiciste.`

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Estimación de tokens de un mensaje/historial (bytes UTF-8 / 4) */
const estimateTokens = (value: unknown): number => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return Math.round(new TextEncoder().encode(text).length / 4)
}

// --- Confirmación de acciones destructivas (C1, v0.3.1) ---

/** Detalle completo de la acción pendiente (lo que el usuario debe ver ANTES de aprobar) */
export interface PendingApproval {
  kind: 'write_file' | 'execute_command'
  path?: string
  content?: string
  command?: string
  /** Solo true para write_file: ofrece "Aprobar y permitir en este workspace" */
  allowWorkspace?: boolean
}

// El resolver vive en el módulo del store (no en el componente): así Stop
// puede auto-denegar una aprobación pendiente y el bucle nunca queda colgado
// esperando una UI que no existe.
let approvalResolver: ((approved: boolean) => void) | null = null

// M9 (v0.3.1): taskId del paso LLM en vuelo — Stop puede abortarlo en Rust
// (chat_stop) en vez de esperar a que el modelo termine el paso completo
let activeStepTaskId: string | null = null

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
    // M9: aborta también el paso LLM en vuelo (chat_stop en Rust)
    const stepTaskId = activeStepTaskId
    if (stepTaskId) {
      void chatStop(stepTaskId).catch(() => undefined)
    }
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
    const isSubagent = !!subagent

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

    // Fase 4 (v0.4.0): lenguajes detectados UNA VEZ por invocación (barato:
    // fileTree ya cargado + pestañas abiertas) — el conjunto se congel aquí
    // para que el system prompt sea estable y cacheable durante el run
    const detectedLanguages = detectProjectLanguages(
      useWorkspaceStore.getState().fileTree,
      useEditorStore.getState().tabs.map((t) => t.id),
    )

const systemPrompt = subagent ? subagent.systemPrompt(detectedLanguages) : AGENT_SYSTEM_PROMPT
// 0.4.1-C: design_search SOLO para /ux (qa/security/audit no la necesitan:
// -391 tok por paso en cada llamada)
const subagentTools = new Set(
  subagent && subagent.id !== 'ux'
    ? [...SUBAGENT_TOOL_NAMES].filter((t) => t !== 'design_search')
    : [...SUBAGENT_TOOL_NAMES],
)
const tools = subagent
? AGENT_TOOLS.filter((t) => subagentTools.has(t.name))
: AGENT_TOOLS

// Los SUBAGENTES (solo lectura) corren SIN límite de pasos; el agente
// mutador conserva un tope alto como protección de escrituras
const maxSteps = subagent ? Number.POSITIVE_INFINITY : MAX_STEPS

    // PENDIENTE (0.4.2/0.5.0): historial de herramientas NATIVO (assistant con
    // tool_calls + role tool) en los adaptadores — hoy va como texto
    // ("[Llamaste a la herramienta X.]" + user "Resultado de X:…") porque el
    // bucle es común a 4 adaptadores con soporte desigual de role:tool en
    // proveedores locales. Ver análisis 0.4.1-C punto 2.
    const history: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Workspace: ${workspaceRoot}\n\n${userPayload}` },
    ]

    try {
      // 0.4.1-B: lecturas reales del subagente (read_file/read_file_range/
      // search_files) — un reporte SIN lecturas no es una revisión fiable
      const READ_COUNTING_TOOLS = new Set(['read_file', 'search_files'])
      let readCalls = 0
      // --- 0.4.1-C: cobertura de revisión, tope de llamadas y repetición ---
      // (solo subagentes de análisis; la cobertura NO aplica a /ux)
      const coverageBot = isSubagent && subagent?.id !== 'ux'
      let reminders = 0
      let finishing = false
      let toolCallsCount = 0
      let repeatState: RepeatState | null = null
      const readFiles = new Set<string>()
      // Alcance de archivos de código calculado UNA vez al iniciar
      const fileTreePaths: string[] = []
      const walkTree = (nodes: import('@/types/workspace').FileNode[]): void => {
        for (const n of nodes) {
          if (n.kind === 'file') fileTreePaths.push(n.path)
          if (n.children) walkTree(n.children)
        }
      }
      if (coverageBot) walkTree(useWorkspaceStore.getState().fileTree)
      const reviewScope = coverageBot ? codeScope(fileTreePaths, workspaceRoot) : []
      // Límite de contexto del modelo activo (si el catálogo lo expone):
      // sin recordatorios si el historial estimado supera el 70%
      const modelContextTokens = useSettingsStore
        .getState()
        .fetchedModels[config.providerId]?.find((m: { id: string }) => m.id === config.model)
        ?.maxContextTokens
      const hasContextHeadroom = (): boolean => {
        if (!modelContextTokens) return true
        return estimateTokens(history) < modelContextTokens * 0.7
      }
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
        // B2 (v0.3.1): si el workspace cambió a mitad del run, aborta — los
        // archivos del workspace anterior ya no deben tocarse
        if (useWorkspaceStore.getState().rootPath !== workspaceRoot) {
          set((state) => ({
            steps: [
              ...state.steps,
              {
                type: 'text',
                role: 'assistant',
                content: '⏹ Abortado: se cambió de workspace durante la tarea.',
                turnId: turn,
                ts: Date.now(),
                botName: subagent?.botName,
              },
            ],
          }))
          void useChatStore.getState().persistActive()
          return
        }
        activeStepTaskId = `agent-step-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const response = await chatWithTools({
          providerId: config.providerId,
          model: config.model,
          messages: history,
          tools,
          thinkingLevel: useChatStore.getState().thinkingLevel,
          taskId: activeStepTaskId,
        })
        activeStepTaskId = null

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
          // 0.4.1-C: COBERTURA — antes de aceptar el final, calcula los
          // archivos de código del alcance que NO se han leído
          let partial: { read: number; total: number } | undefined
          if (coverageBot) {
            const decision = decideCoverage(
              reviewScope,
              readFiles,
              reminders,
              hasContextHeadroom(),
            )
            if (decision.action === 'remind' && !finishing) {
              reminders++
              const hidden = decision.hiddenCount > 0 ? ` y ${decision.hiddenCount} más` : ''
              history.push({
                role: 'user',
                content: `Faltan por revisar: ${decision.shown.join(', ')}${hidden}. Léelos con read_file antes de concluir.`,
              })
              continue
            }
            if (decision.action === 'accept-partial') {
              partial = { read: readFiles.size, total: reviewScope.length }
            }
          }
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
              // Tarjeta de reporte SIEMPRE en subagentes (incluso con 0
              // hallazgos): FindingsReport avisa cuando hubo CERO lecturas
              ...(subagent
                ? [
                    {
                      type: 'report' as const,
                      findings: findings ?? [],
                      unverified: readCalls === 0,
                      partial,
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
            // Subagentes: anotación MÍNIMA (la promesa del "siguiente mensaje"
            // era la que los modelos pequeños copiaban como contenido)
            (isSubagent
              ? `[Llamaste a la herramienta ${response.calls.map((c) => c.name).join(', ')}.]`
              : `[Llamaste a la herramienta ${response.calls.map((c) => c.name).join(', ')}. El resultado llegará en el siguiente mensaje.]`),
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
          // 0.4.1-C: tope de llamadas + detección de repetición (subagentes)
          if (isSubagent) {
            toolCallsCount++
            if (!finishing && toolCallsCount > MAX_TOOL_CALLS_SUBAGENT) {
              finishing = true
              history.push({
                role: 'user',
                content: `Has alcanzado el máximo de ${MAX_TOOL_CALLS_SUBAGENT} llamadas a herramientas. Emite tu reporte final con lo leído hasta ahora.`,
              })
              continue
            }
            if (finishing) {
              // Tras pedir el reporte final, otra llamada a herramientas cierra ya
              const partial =
                coverageBot && readFiles.size < reviewScope.length
                  ? { read: readFiles.size, total: reviewScope.length }
                  : undefined
              set((state) => ({
                steps: [
                  ...state.steps,
                  {
                    type: 'text',
                    role: 'assistant',
                    content:
                      '⏹ Cerrado: el modelo siguió llamando a herramientas tras pedirle el reporte final.',
                    turnId: turn,
                    ts: Date.now(),
                    botName: subagent?.botName,
                  },
                  ...(subagent
                    ? [
                        {
                          type: 'report' as const,
                          findings: [],
                          unverified: readCalls === 0,
                          partial,
                          turnId: turn,
                          ts: Date.now() + 1,
                          botName: subagent?.botName,
                        },
                      ]
                    : []),
                ],
              }))
              void useChatStore.getState().persistActive()
              return
            }
            const rep = trackRepeat(repeatState, call.name, call.arguments)
            repeatState = rep.state
            if (rep.warn) {
              history.push({
                role: 'user',
                content: `Ya has llamado a ${call.name} con los mismos argumentos 3 veces. Cambia de enfoque o emite tu reporte final.`,
              })
              continue
            }
            if (rep.stop) {
              finishing = true
              history.push({
                role: 'user',
                content:
                  'Has repetido la misma llamada 4 veces. Emite tu reporte final con lo leído hasta ahora.',
              })
              continue
            }
          }

          // M3: los subagentes de análisis son de solo lectura — hard-deny
          // La lectura que FALLA cuenta como intentada (registro previo)
          if (subagent && call.name === 'read_file') {
            const argPath = (call.arguments as { path?: string } | undefined)?.path ?? ''
            readFiles.add(normalizeForCoverage(resolvePath(String(argPath), workspaceRoot), workspaceRoot))
          }
          const output = await runTool(call, workspaceRoot, turn, !!subagent)
          if (subagent && READ_COUNTING_TOOLS.has(call.name)) readCalls++
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
            content: isSubagent
              ? `Resultado de ${call.name}:\n${output}\n\nContinúa la revisión: aún pueden quedar archivos por leer. Cuando hayas leído el código del alcance, emite el reporte final.`
              : `Resultado de ${call.name}:\n${output}\n\nContinúa con la tarea o, si ya terminaste, responde al usuario con un resumen.`,
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
      activeStepTaskId = null
      set({ running: false, stopRequested: false })
    }
  },
}))
