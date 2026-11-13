import { skillsFor } from '@/lib/agent/skills'
import type { AgentFinding } from '@/types/agent'

import auditbotPrompt from '@/resources/subagents/agents/auditbot.md?raw'
import bugbotPrompt from '@/resources/subagents/agents/bugbot.md?raw'
import secbotPrompt from '@/resources/subagents/agents/secbot.md?raw'
import uxbobotPrompt from '@/resources/subagents/agents/uxbot.md?raw'
// v0.4.0: design_search se une al set — catálogos UX de solo lectura (los
// subagentes de análisis y el nuevo /ux pueden consultar guías de diseño)// Subagentes de análisis de SOLO LECTURA (v0.1.4): /qa, /security, /audit.
// Analizan el workspace con herramientas de lectura y emiten un reporte
// catalogado por severidad. JAMÁS modifican archivos (ni siquiera se les
// ofrecen las herramientas mutadoras).
//
// v0.3.0 (fase D): el prompt base de cada bot vive en
// src/resources/subagents/agents/*.md (importado como texto en build) y las
// skills especializadas se inyectan desde src/lib/agent/skills.ts. El system
// prompt es el primer mensaje del contexto, así que su contenido estable
// (prompt base + skills en orden alfabético) queda dentro del prefijo
// cacheable de los proveedores con prompt caching.

export interface SubagentDef {
  id: 'qa' | 'security' | 'audit' | 'ux'
  slash: string
  /** Identidad propia del bot (se presenta así en el chat) */
  botName: string
  emoji: string
  name: string
  description: string
  /** Construye el system prompt con los lenguajes detectados (fase 4) */
  /** Construye el system prompt con los lenguajes detectados (fase 4) */
  systemPrompt: (detectedLanguages: ReadonlySet<string>) => string
}

const FINDINGS_FORMAT = `
FORMATO DE SALIDA OBLIGATORIO: cuando termines tu análisis, tu respuesta final debe contener:
1. Un resumen en markdown de lo que analizaste, archivos revisados y conclusiones.
2. AL FINAL, un bloque de código EXACTO con todos los hallazgos:
\`\`\`aether-findings
{"findings":[{"severity":"critical","file":"ruta/relativa","line":123,"title":"título corto","detail":"descripción del hallazgo y cómo corregirlo"}]}
\`\`\`
Reglas del bloque: severity SOLO puede ser "critical", "high", "medium" o "low"; "file" es la ruta relativa; "line" es el número de línea si aplica. Si no encuentras nada, emite {"findings":[]}. NO inventes hallazgos: todo debe estar verificado leyendo el código.`

const READ_ONLY_RULES = `REGLAS: eres de SOLO LECTURA — jamás modifiques ni crees archivos. Usa las herramientas de análisis (read_file, search_files, list_directory) para examinar el código REAL antes de opinar. Sé específico: cita archivo y línea.

LECTURA NUMERADA: las lecturas de read_file llegan con las líneas NUMERADAS como "NNN| código" (NNN = número REAL de línea del archivo). Usa esos números EXACTOS en el campo line del hallazgo: no los recalcul ni los estimes, y compruébalos mirando la salida numerada antes de reportar. El código que cites como evidencia va SIN el prefijo "NNN|". El campo line es la PRIMERA línea del problema.

RUTAS: todas las rutas que pases a las herramientas son RELATIVAS a la raíz del workspace — no antepongas nunca la ruta del proyecto; list_directory acepta "." para listar la raíz.

LECTURA DE ARCHIVOS GRANDES: read_file acepta start_line y end_line para leer POR SECCIONES (p. ej. 1-120, luego 121-240…). El resultado te indica el total de líneas y cómo continuar. NO releas el archivo entero esperando más contenido y NO intentes "reconstruir" archivos con search_files: usa las secciones.`

export const SUBAGENTS: SubagentDef[] = [
  {
    id: 'qa',
    slash: '/qa',
    botName: 'BugBot',
    emoji: '🐛',
    name: 'QA',
    description: 'Revisión de calidad: bugs, errores lógicos y edge cases',
    systemPrompt: (langs) =>
      [bugbotPrompt, READ_ONLY_RULES, skillsFor('qa', langs), FINDINGS_FORMAT]
        .filter((part) => part.trim().length > 0)
        .join('\n\n'),
  },
  {
    id: 'security',
    slash: '/security',
    botName: 'SecBot',
    emoji: '🛡',
    name: 'Security',
    description: 'Auditoría de seguridad ética: vulnerabilidades y malas prácticas',
    systemPrompt: (langs) =>
      [secbotPrompt, READ_ONLY_RULES, skillsFor('security', langs), FINDINGS_FORMAT]
        .filter((part) => part.trim().length > 0)
        .join('\n\n'),
  },
  {
    id: 'audit',
    slash: '/audit',
    botName: 'AuditBot',
    emoji: '📋',
    name: 'Audit',
    description: 'Auditoría completa: calidad (QA) + seguridad en dos pasadas',
    systemPrompt: (langs) =>
      [auditbotPrompt, READ_ONLY_RULES, skillsFor('audit', langs), FINDINGS_FORMAT]
        .filter((part) => part.trim().length > 0)
        .join('\n\n'),
  },
  {
    id: 'ux',
    slash: '/ux',
    botName: 'UxBot',
    emoji: '🎨',
    name: 'UX',
    description: 'Revisión de UI/UX: contraste, foco, responsive y estados',
    systemPrompt: (langs) =>
      [uxbobotPrompt, READ_ONLY_RULES, skillsFor('ux', langs), FINDINGS_FORMAT]
        .filter((part) => part.trim().length > 0)
        .join('\n\n'),
  },
]

/** Detecta un subagente por slash inicial (/qa, /security, /audit, /ux) */
export function detectSubagent(text: string): { subagent: SubagentDef; task: string } | null {
  const match = /^\/(qa|security|audit|ux)\b\s*/i.exec(text.trim())
  if (!match) return null
  const id = match[1].toLowerCase() as SubagentDef['id']
  const subagent = SUBAGENTS.find((s) => s.id === id)
  if (!subagent) return null
  const task = text.trim().slice(match[0].length).trim()
  return { subagent, task: task || `Analiza el workspace con ${subagent.name}.` }
}

/** Extrae los hallazgos del bloque ```aether-findings``` de una respuesta */
export function parseFindings(text: string): AgentFinding[] | null {
  const match = /```aether-findings\s*([\s\S]*?)```/.exec(text)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim()) as { findings?: AgentFinding[] }
    const findings = (parsed.findings ?? []).filter(
      (f) =>
        f &&
        typeof f.title === 'string' &&
        typeof f.detail === 'string' &&
        ['critical', 'high', 'medium', 'low'].includes(f.severity),
    )
    return findings
  } catch {
    return null
  }
}

/** Herramientas de análisis: subconjunto read-only de las del agente */
// v0.4.0: design_search se une al set — catálogos UX de solo lectura (los
// subagentes de análisis y el nuevo /ux pueden consultar guías de diseño)
export const SUBAGENT_TOOL_NAMES = new Set([
  'read_file',
  'search_files',
  'list_directory',
  'design_search',
])
