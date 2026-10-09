import { invoke } from '@tauri-apps/api/core'

import { useAgentStore } from '@/stores/agentStore'
import type { ToolCall, ToolDef } from '@/types/ai'

const MAX_OUTPUT_CHARS = 4000

// --- Permisos (regla esencial) ---
// Herramientas de SOLO LECTURA: disponibles para analizar código.
// Herramientas MUTADORAS: EXCLUSIVAMENTE del Modo Agente (y con confirmación).
const READ_ONLY_TOOL_NAMES = new Set(['read_file', 'search_files', 'list_directory'])
const MUTATING_TOOL_NAMES = new Set(['write_file', 'execute_command'])

// Herramientas disponibles para el modo agente. write_file y execute_command
// REQUIEREN confirmación del usuario antes de ejecutarse.
export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'read_file',
    description:
      'Lee el contenido de un archivo del proyecto. Parámetros: {"path": "ruta del archivo (relativa al workspace o absoluta)"}',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Ruta del archivo' } },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description:
      'Busca un texto (case-insensitive) en los archivos del workspace. Devuelve archivo, número de línea y contenido. Parámetros: {"query": "texto a buscar"}',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto a buscar' } },
      required: ['query'],
    },
  },
  {
    name: 'list_directory',
    description:
      'Lista el árbol de contenido de una carpeta del workspace. Parámetros: {"path": "ruta relativa (vacío = raíz del workspace)"}',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Ruta de la carpeta (vacío = raíz)' } },
      required: [],
    },
  },
  {
    name: 'write_file',
    description:
      'Escribe/sobrescribe un archivo del workspace con el contenido dado. REQUIERE confirmación del usuario. Parámetros: {"path": "ruta", "content": "contenido completo del archivo"}',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta del archivo' },
        content: { type: 'string', description: 'Contenido completo' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'execute_command',
    description:
      'Ejecuta un comando en la terminal del proyecto (cmd en Windows, sh en Unix) y devuelve exit code, stdout y stderr. REQUIERE confirmación del usuario. Parámetros: {"command": "comando a ejecutar"}',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'Comando a ejecutar' } },
      required: ['command'],
    },
  },
]

export function resolvePath(path: string, root: string): string {
  if (!path || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')) return path
  return `${root.replace(/[\\/]+$/, '')}/${path}`
}

function truncateOutput(s: string): string {
  return s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n… (truncado)` : s
}

// El resolver de confirmación vive fuera del store: el loop del agente queda
// en await hasta que el usuario aprueba/deniega desde el diálogo de la UI.
let pendingResolver: ((approved: boolean) => void) | null = null

export function requestApproval(label: string): Promise<boolean> {
  return new Promise((resolve) => {
    pendingResolver = resolve
    useAgentStore.getState().setPendingCommand(label)
  })
}

export function resolveApproval(approved: boolean): void {
  const resolver = pendingResolver
  pendingResolver = null
  useAgentStore.getState().setPendingCommand(null)
  resolver?.(approved)
}

export async function runTool(call: ToolCall, workspaceRoot: string): Promise<string> {
  const args = (call.arguments ?? {}) as Record<string, unknown>

  // Guard de permisos: whitelist estricta + solo el Modo Agente en ejecución
  // puede mutar el disco. El Chat normal jamás llega aquí (chatStream no lleva
  // tools), pero se blinda por si cambia la arquitectura.
  if (!READ_ONLY_TOOL_NAMES.has(call.name) && !MUTATING_TOOL_NAMES.has(call.name)) {
    return `Herramienta desconocida: ${call.name}`
  }
  if (MUTATING_TOOL_NAMES.has(call.name)) {
    const agent = useAgentStore.getState()
    if (agent.mode !== 'agent' || !agent.running) {
      return 'DENEGADO: solo el Modo Agente puede modificar, crear o eliminar archivos.'
    }
  }

  try {
    switch (call.name) {
      case 'read_file': {
        const path = resolvePath(String(args.path ?? ''), workspaceRoot)
        const content = await invoke<string>('read_file', { path })
        return truncateOutput(content)
      }
      case 'search_files': {
        const hits = await invoke<Array<{ path: string; lineNumber: number; text: string }>>(
          'search_files',
          { root: workspaceRoot, query: String(args.query ?? '') },
        )
        if (hits.length === 0) return 'Sin resultados.'
        return truncateOutput(
          hits.map((h) => `${h.path}:${h.lineNumber}: ${h.text}`).join('\n'),
        )
      }
      case 'list_directory': {
        const path = args.path ? resolvePath(String(args.path), workspaceRoot) : workspaceRoot
        const tree = await invoke<Array<{ path: string; name: string; kind: string }>>('read_dir', {
          path,
        })
        if (tree.length === 0) return 'Directorio vacío.'
        return truncateOutput(
          tree.map((n) => `${n.kind === 'directory' ? '[dir]  ' : '       '}${n.path}`).join('\n'),
        )
      }
      case 'write_file': {
        const path = resolvePath(String(args.path ?? ''), workspaceRoot)
        const approved = await requestApproval(`Escribir archivo: ${path}`)
        if (!approved) return 'DENEGADO: el usuario no aprobó escribir este archivo.'
        await invoke('write_file', { path, content: String(args.content ?? '') })
        return `Archivo escrito correctamente: ${path}`
      }
      case 'execute_command': {
        const command = String(args.command ?? '')
        const approved = await requestApproval(`Ejecutar comando: ${command}`)
        if (!approved) return 'DENEGADO: el usuario no aprobó ejecutar este comando.'
        const output = await invoke<{ exitCode: number; stdout: string; stderr: string }>(
          'execute_command',
          { command, cwd: workspaceRoot },
        )
        return truncateOutput(
          `Exit code: ${output.exitCode}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`,
        )
      }
      default:
        return `Herramienta desconocida: ${call.name}`
    }
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }
}
