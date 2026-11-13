import { invoke } from '@tauri-apps/api/core'

import { numberLines } from '@/lib/agent/lineNumbers'
import { formatDisplayPath, resolvePath } from '@/lib/workspace/format'
import { searchUx } from '@/lib/agent/uxData'
import { evaluatePermission } from '@/lib/agent/permissions'
import { useAgentStore } from '@/stores/agentStore'
import type { ToolCall, ToolDef } from '@/types/ai'

const MAX_OUTPUT_CHARS = 2000

// --- Permisos (regla esencial) ---
// Herramientas de SOLO LECTURA: disponibles para analizar código.
// Herramientas MUTADORAS: EXCLUSIVAMENTE del Modo Agente (y con confirmación).
const READ_ONLY_TOOL_NAMES = new Set(['read_file', 'search_files', 'list_directory', 'design_search'])
const MUTATING_TOOL_NAMES = new Set(['write_file', 'execute_command'])

// Herramientas disponibles para el modo agente. write_file y execute_command
// REQUIEREN confirmación del usuario antes de ejecutarse.
export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'read_file',
    description:
      'Lee el contenido de un archivo del proyecto. Para archivos grandes, lee por SECCIONES con start_line/end_line (p. ej. primeras 120 líneas, luego 121-240, etc. — el resultado indica el total de líneas y qué rango cubre). Parámetros: {"path": "ruta del archivo", "start_line": 1, "end_line": 120}',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta del archivo' },
        start_line: { type: 'number', description: 'Línea inicial (opcional, para archivos grandes)' },
        end_line: { type: 'number', description: 'Línea final (opcional, para archivos grandes)' },
      },
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
    name: 'design_search',
    description:
      'Busca guías de UI/UX en una base de conocimiento de diseño (BM25 sobre catálogos curados). SOLO LECTURA (no toca el workspace ni la red). Usa consultas CORTAS (2-4 palabras) de UN solo tema, en INGLÉS. Dominios y para qué sirve cada uno: "ui-reasoning" = recomendaciones de design system por TIPO DE PRODUCTO (consulta con "developer tool IDE", "saas dashboard"); "style" = estilos UI (glassmorphism, minimalism…) con CSS keywords y checklists; "color" = paletas semánticas por tipo de producto; "typography" = parejas tipográficas con CSS import; "ux" = guías Do/Don\'t y accesibilidad con ejemplos de código; "charts" = qué gráfica usar por tipo de dato + accesibilidad; "icons" = iconos recomendados con import code. Parámetros: {"query": "2-4 palabras en inglés", "domain": "dominio opcional (auto-detectado si falta)", "max_results": "1-20, default 3"}',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '2-4 palabras en inglés, un solo tema (ej. "dark dashboard accent")',
        },
        domain: {
          type: 'string',
          description:
            'Opcional. ui-reasoning=recomendaciones por tipo de producto | style=estilos UI | color=paletas | typography=tipografías | ux=Do/Don\'t y accesibilidad | charts=gráficas | icons=iconos',
        },
        max_results: { type: 'number', description: 'Resultados máximos (1-20, default 3)' },
      },
      required: ['query'],
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
      'Ejecuta un comando en la terminal del proyecto y devuelve exit code, stdout y stderr. En Windows se ejecuta con PowerShell (usa cmdlets: "Get-Content", "Get-ChildItem"; las rutas con espacios SIEMPRE entre comillas dobles); en Unix, con sh. El comando se ejecuta con el workspace como directorio actual (no necesitas "cd"). Timeout: 120s por defecto; usa el parámetro "timeout" (1-600, en SEGUNDOS) para comandos largos — al vencer, el proceso se TERMINA. REQUIERE confirmación del usuario. Parámetros: {"command": "comando a ejecutar", "timeout": 300}',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando a ejecutar' },
        timeout: {
          type: 'number',
          description: 'Timeout en segundos (opcional, 1-600; default 120)',
        },
      },
      required: ['command'],
    },
  },
]

function truncateOutput(s: string): string {
  return s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n… (truncado — usa las herramientas de búsqueda o lectura por secciones para ver más)` : s
}

/**
 * Enriquece los errores de ruta de las herramientas de análisis: recuerda que
 * las rutas van RELATIVAS a la raíz del workspace y que "." es la raíz.
 * Solo muestra la raíz actual (sin prefijo \\?\) — sin secretos ni rutas de
 * otros sitios.
 */
function pathError(err: unknown, workspaceRoot: string): Error {
  const message = err instanceof Error ? err.message : String(err)
  return new Error(
    `${message}\nNOTA: las rutas son RELATIVAS a la raíz del workspace (${formatDisplayPath(workspaceRoot)}) — usa "." para listar la raíz.`,
  )
}

const FULL_READ_LIMIT = 16000
const SECTION_LINES = 120

export async function runTool(
  call: ToolCall,
  workspaceRoot: string,
  turnId: string,
  readOnly = false,
): Promise<string> {
  const args = (call.arguments ?? {}) as Record<string, unknown>

  // Defensa contra truncado por límite de tokens: si el JSON de los argumentos
  // llegó cortado, los adaptadores lo marcan con __truncated y la herramienta
  // NO se ejecuta (evita escribir archivos vacíos o a medio escribir)
  if (args['__truncated'] === true) {
    return 'ERROR: los argumentos de la herramienta llegaron TRUNCADOS (límite de tokens del modelo). Divide la tarea en pasos más pequeños, usa un modelo con mayor límite de salida, o escribe el archivo por secciones.'
  }

  // Guard de permisos: whitelist estricta + solo el Modo Agente en ejecución
  // puede mutar el disco. El Chat normal jamás llega aquí (chatStream no lleva
  // tools), pero se blinda por si cambia la arquitectura.
  if (!READ_ONLY_TOOL_NAMES.has(call.name) && !MUTATING_TOOL_NAMES.has(call.name)) {
    return `Herramienta desconocida: ${call.name}`
  }
  // Hard-deny (M3): los subagentes de análisis son de SOLO LECTURA aunque el
  // modelo llegue a "alucinar" una herramienta mutadora que no le ofrecimos
  if (MUTATING_TOOL_NAMES.has(call.name) && readOnly) {
    return 'DENEGADO: este subagente es de SOLO LECTURA — no puede modificar archivos ni ejecutar comandos.'
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
        const startLine = typeof args.start_line === 'number' ? args.start_line : undefined
        const endLine = typeof args.end_line === 'number' ? args.end_line : undefined

        // Lectura por secciones: el modo indicado por el agente
        if (startLine !== undefined || endLine !== undefined) {
          const range = await invoke<{
            content: string
            totalLines: number
            startLine: number
            endLine: number
          }>('read_file_range', {
            path,
            startLine: startLine ?? 1,
            endLine: endLine ?? (startLine ?? 1) + SECTION_LINES - 1,
          })
          const hasMore = range.endLine < range.totalLines
          // Subagentes (readOnly): contenido NUMERADO con los números reales
          // del archivo para citar líneas exactas; el Modo Agente recibe el
          // contenido crudo (nunca ve números que luego podría reescribir)
          const body = readOnly
            ? numberLines(range.content, range.startLine, range.totalLines)
            : range.content
          return [
            `[${path} — ${range.totalLines} líneas totales — mostrando ${range.startLine}-${range.endLine}${hasMore ? ` — HAY MÁS: usa start_line=${range.endLine + 1}, end_line=${Math.min(range.endLine + SECTION_LINES, range.totalLines)}` : ' — fin del archivo'}]`,
            body,
          ].join('\n')
        }

        // Lectura completa: si el archivo es grande, devuelve la primera
        // sección con hint en vez de truncar a ciegas
        const content = await invoke<string>('read_file', { path }).catch((e) => {
          throw pathError(e, workspaceRoot)
        })
        if (content.length > FULL_READ_LIMIT) {
          const range = await invoke<{
            content: string
            totalLines: number
            startLine: number
            endLine: number
          }>('read_file_range', { path, startLine: 1, endLine: SECTION_LINES })
          const body = readOnly
            ? numberLines(range.content, range.startLine, range.totalLines)
            : range.content
          return [
            `[${path} — ${range.totalLines} líneas totales — mostrando 1-${range.endLine} — HAY MÁS: usa start_line=${range.endLine + 1}, end_line=${Math.min(range.endLine + SECTION_LINES, range.totalLines)} para continuar (no intentes "reconstruir" el archivo con search_files)]`,
            body,
          ].join('\n')
        }
        return readOnly ? numberLines(content, 1, content.split('\n').length) : content
      }
      case 'search_files': {
        const hits = await invoke<Array<{ path: string; lineNumber: number; text: string }>>(
          'search_files',
          { root: workspaceRoot, query: String(args.query ?? '') },
        )
        if (hits.length === 0) return 'Sin resultados.'
        return truncateOutput(
          hits
            .map((h) => `${formatDisplayPath(h.path)}:${h.lineNumber}: ${h.text}`)
            .join('\n'),
        )
      }
      case 'list_directory': {
        const path = resolvePath(String(args.path ?? ''), workspaceRoot)
        const tree = await invoke<Array<{ path: string; name: string; kind: string }>>('read_dir', {
          path,
        }).catch((e) => {
          throw pathError(e, workspaceRoot)
        })
        if (tree.length === 0) return 'Directorio vacío.'
        return truncateOutput(
          tree
            .map(
              (n) =>
                `${n.kind === 'directory' ? '[dir]  ' : '       '}${formatDisplayPath(n.path)}`,
            )
            .join('\n'),
        )
      }
      case 'design_search': {
        // SOLO LECTURA: busca en los catálogos UX empaquetados (sin tocar el
        // workspace ni la red — todo es texto local)
        const query = String(args.query ?? '').trim()
        if (!query) {
          return 'ERROR: falta "query" en los argumentos de design_search.'
        }
        const domain =
          typeof args.domain === 'string' && args.domain.trim() !== ''
            ? args.domain.trim().toLowerCase()
            : undefined
        const maxResults = typeof args.max_results === 'number' ? args.max_results : 3
        return await searchUx(query, domain, maxResults)
      }
      case 'write_file': {
        const path = resolvePath(String(args.path ?? ''), workspaceRoot)
        // Validación estricta anti-truncado: sin "content" (o no-string) NO se
        // escribe — evita vaciar/truncar el archivo si el modelo cortó los
        // argumentos por límite de tokens
        const content = args.content
        if (typeof content !== 'string') {
          return 'ERROR: los argumentos de write_file están incompletos (falta "content" — posible truncado por límite de tokens). El archivo NO fue modificado. Reintenta con un contenido más pequeño o divide la escritura.'
        }
        // Confirmación (C1): el usuario ve la ruta y el CONTENIDO COMPLETO
        // antes de aprobar. El resolver vive en agentStore para que Stop
        // pueda auto-denegar una aprobación pendiente.
        // Lote C: evaluación de permisos — si write='allow' y la ruta NO es
        // protegida, se salta el diálogo (con marcador "auto" en el timeline)
        const relativePath = path.replace(/^\\\\\?\\/, '').replace(/[\\/]+/g, '/').replace(workspaceRoot.replace(/[\\/]+/g, '/').toLowerCase() + '/', '')
        const decision = evaluatePermission('write_file', workspaceRoot, { relativePath })
        if (!decision.auto) {
          const approved = await useAgentStore.getState().requestApproval({
            kind: 'write_file',
            path,
            content,
            allowWorkspace: !decision.protectedPath,
          })
          if (!approved) return 'DENEGADO: el usuario no aprobó escribir este archivo.'
        }
        // Checkpoint Time Travel: snapshot del contenido previo antes de
        // escribir. Un fallo de lectura NO significa que el archivo no exista
        // (binario sin UTF-8, permisos): la existencia se comprueba aparte.
        let previousContent: string | null = null
        const existed = await invoke<boolean>('file_exists', { path })
        if (existed) {
          try {
            previousContent = await invoke<string>('read_file', { path })
          } catch {
            return `ERROR: no se pudo hacer el snapshot previo de '${path}' (¿binario o sin permisos de lectura?). Escritura cancelada: sin snapshot el rollback (Time Travel) podría borrar un archivo existente.`
          }
        }
        useAgentStore.getState().addCheckpoint({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          turnId,
          path,
          previousContent,
        })
        await invoke('write_file', { path, content })
        return `Archivo escrito correctamente: ${path}`
      }
      case 'execute_command': {
        const command = args.command
        if (typeof command !== 'string' || command.trim() === '') {
          return 'ERROR: falta "command" en los argumentos de execute_command (posible truncado por límite de tokens).'
        }
        // Lote C: evaluación de permisos — en 'safe' SOLO comandos de la
        // allowlist se auto-ejecutan; el resto y en 'ask' → diálogo
        const execDecision = evaluatePermission('execute_command', workspaceRoot, { command })
        if (!execDecision.auto) {
          const approved = await useAgentStore.getState().requestApproval({
            kind: 'execute_command',
            command,
          })
          if (!approved) return 'DENEGADO: el usuario no aprobó ejecutar este comando.'
        }
        // M1: timeout opcional del agente (segundos, el backend lo capta a 600)
        const timeoutArg = typeof args.timeout === 'number' ? args.timeout : undefined
        const output = await invoke<{ exitCode: number; stdout: string; stderr: string }>(
          'execute_command',
          {
            command,
            cwd: workspaceRoot,
            timeout: timeoutArg ?? null,
          },
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
