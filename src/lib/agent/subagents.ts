import { skillsFor } from '@/lib/agent/skills'
import type { AgentFinding, AgentStep } from '@/types/agent'

import auditbotPrompt from '@/resources/subagents/agents/auditbot.md?raw'
import bugbotPrompt from '@/resources/subagents/agents/bugbot.md?raw'
import secbotPrompt from '@/resources/subagents/agents/secbot.md?raw'

// Subagentes de análisis de SOLO LECTURA (v0.1.4): /qa, /security, /audit.
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
  id: 'qa' | 'security' | 'audit'
  slash: string
  /** Identidad propia del bot (se presenta así en el chat) */
  botName: string
  emoji: string
  name: string
  description: string
  systemPrompt: string
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

LECTURA DE ARCHIVOS GRANDES: read_file acepta start_line y end_line para leer POR SECCIONES (p. ej. 1-120, luego 121-240…). El resultado te indica el total de líneas y cómo continuar. NO releas el archivo entero esperando más contenido y NO intentes "reconstruir" archivos con search_files: usa las secciones.`

export const SUBAGENTS: SubagentDef[] = [
  {
    id: 'qa',
    slash: '/qa',
    botName: 'BugBot',
    emoji: '🐛',
    name: 'QA',
    description: 'Revisión de calidad: bugs, errores lógicos y edge cases',
    systemPrompt: [bugbotPrompt, READ_ONLY_RULES, skillsFor('qa'), FINDINGS_FORMAT]
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
    systemPrompt: [secbotPrompt, READ_ONLY_RULES, skillsFor('security'), FINDINGS_FORMAT]
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
    systemPrompt: [auditbotPrompt, READ_ONLY_RULES, skillsFor('audit'), FINDINGS_FORMAT]
      .filter((part) => part.trim().length > 0)
      .join('\n\n'),
  },
]

/** Detecta un subagente por slash inicial (/qa, /security, /audit) */
export function detectSubagent(text: string): { subagent: SubagentDef; task: string } | null {
  const match = /^\/(qa|security|audit)\b\s*/i.exec(text.trim())
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
export const SUBAGENT_TOOL_NAMES = new Set(['read_file', 'search_files', 'list_directory'])

export function stepIsReport(step: AgentStep): boolean {
  return step.type === 'report' && Array.isArray(step.findings)
}
