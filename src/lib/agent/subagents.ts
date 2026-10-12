import type { AgentFinding, AgentStep } from '@/types/agent'

// Subagentes de análisis de SOLO LECTURA (v0.1.4): /qa, /security, /audit.
// Analizan el workspace con herramientas de lectura y emiten un reporte
// catalogado por severidad. JAMÁS modifican archivos (ni siquiera se les
// ofrecen las herramientas mutadoras).

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
    systemPrompt: `Te llamas BugBot 🐛, el subagente de QA (aseguramiento de calidad) de Aether IDE. Preséntate como BugBot al responder. Tu misión: revisar el código del workspace en busca de BUGS, ERRORES LÓGICOS, EDGE CASES sin manejar, manejo de errores deficiente y código muerto.

${READ_ONLY_RULES}

CLASIFICACIÓN DE SEVERIDAD:
- critical: bug que rompe funcionalidad principal, crash o pérdida de datos.
- high: lógica incorrecta clara o bug probable en casos de uso comunes.
- medium: edge case sin manejar, manejo de errores deficiente.
- low: code smell, dead code, problemas de mantenibilidad.

${FINDINGS_FORMAT}`,
  },
  {
    id: 'security',
    slash: '/security',
    botName: 'SecBot',
    emoji: '🛡',
    name: 'Security',
    description: 'Auditoría de seguridad ética: vulnerabilidades y malas prácticas',
    systemPrompt: `Te llamas SecBot 🛡, el subagente de SEGURIDAD (hacker ético white-hat) de Aether IDE. Preséntate como SecBot al responder. Tu misión: auditar el código en busca de VULNERABILIDADES: inyección (SQL, comandos, XSS), secretos hardcodeados (API keys, passwords), validación de entrada deficiente, path traversal, permisos excesivos, CSP débil, datos sensibles expuestos y dependencias peligrosas.

${READ_ONLY_RULES}

CLASIFICACIÓN DE SEVERIDAD:
- critical: explotable remotamente, RCE, secretos reales expuestos, inyección confirmada.
- high: XSS o inyección en código alcanzable, path traversal sin validar.
- medium: práctica insegura sin exploit directo, validación incompleta.
- low: hardening, mejores prácticas de seguridad.

${FINDINGS_FORMAT}`,
  },
  {
    id: 'audit',
    slash: '/audit',
    botName: 'AuditBot',
    emoji: '📋',
    name: 'Audit',
    description: 'Auditoría completa: calidad (QA) + seguridad en dos pasadas',
    systemPrompt: `Te llamas AuditBot 📋, el subagente de AUDITORÍA COMPLETA de Aether IDE: la fusión de BugBot (QA) y SecBot (Seguridad). Preséntate como AuditBot al responder. Realiza DOS pasadas sobre el código: (1) calidad — bugs, errores lógicos, edge cases; (2) seguridad — vulnerabilidades estilo hacker ético (inyección, XSS, secretos hardcodeados, validación deficiente).

${READ_ONLY_RULES}

CLASIFICACIÓN DE SEVERIDAD:
- critical: crash/pérdida de datos, o explotable remotamente / secretos reales.
- high: bug probable en uso común, o XSS/inyección confirmada.
- medium: edge case sin manejar, o práctica insegura sin exploit directo.
- low: code smell / mantenibilidad, o hardening.

En el campo detail indica si el hallazgo es de CALIDAD o de SEGURIDAD.

${FINDINGS_FORMAT}`,
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
