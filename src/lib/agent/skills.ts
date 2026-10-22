// Loader de skills para los subagentes (fase D, v0.3.0).
// Los skills viven en src/resources/subagents/skills/*.md con frontmatter:
//   ---
//   name: security-injection
//   description: ...
//   applies_to: [security, audit]
//   ---
// El texto se importa como raw en BUILD TIME (import.meta.glob con ?raw):
// cero IO en runtime, y un skill nuevo "aparece solo" en el glob.
// El orden de composición es ALFABÉTICO por nombre: determinista, de modo que
// el system prompt resultante sea estable y aproveche la caché de prompt
// (fase A) — el mensaje system es el prefijo del contexto.

export type SubagentId = 'qa' | 'security' | 'audit' | 'ux'

export interface SkillDef {
  name: string
  description: string
  appliesTo: SubagentId[]
  body: string
}

// RUTA (fix v0.4.0): desde src/lib/agent/ son DOS niveles hasta src/ —
// '../resources/…' resolvía a src/lib/resources (inexistente) y el glob
// devolvía vacío: las skills NO se cargaban en ningún build de v0.3.x
const RAW_SKILLS = import.meta.glob('../../resources/subagents/skills/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function basename(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? path
}

function parseSkill(raw: string, path: string): SkillDef | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) return null
  const [, header, body] = match
  const name = /^name:\s*(.+)$/m.exec(header)?.[1]?.trim() || basename(path)
  const description = /^description:\s*(.+)$/m.exec(header)?.[1]?.trim() ?? ''
  const appliesRaw = /^applies_to:\s*\[(.*)\]$/m.exec(header)?.[1] ?? ''
  const appliesTo = appliesRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is SubagentId => s === 'qa' || s === 'security' || s === 'audit' || s === 'ux')
  if (appliesTo.length === 0) return null
  return { name, description, appliesTo, body: body.trim() }
}

/** Skills cargados, ordenados alfabéticamente por nombre (composición estable) */
export const SKILLS: SkillDef[] = Object.entries(RAW_SKILLS)
  .map(([path, raw]) => parseSkill(raw, path))
  .filter((s): s is SkillDef => s !== null)
  .sort((a, b) => a.name.localeCompare(b.name))

/**
 * Presupuesto de tokens de las skills (criterio v0.4.0): sin relleno, con
 * presupuesto TOTAL por ejecución. Estimación chars/4; aviso en consola si
 * supera ~12K tokens (~48K chars inyectados al system prompt).
 */
const TOKEN_BUDGET_CHARS = 48_000

/**
 * Devuelve el bloque de skills concatenado para un subagente (string vacío si
 * no aplica ninguno). Determinista: mismo contenido y mismo orden siempre.
 */
export function skillsFor(id: SubagentId): string {
  const applicable = SKILLS.filter((s) => s.appliesTo.includes(id))
  if (applicable.length === 0) return ''
  const sections = applicable.map((s) => `### SKILL: ${s.name}\n\n${s.body}`)
  const block = `## CONOCIMIENTO ESPECIALIZADO\n\n${sections.join('\n\n---\n\n')}`
  const tokens = Math.round(block.length / 4)
  if (block.length > TOKEN_BUDGET_CHARS) {
    console.warn(
      `[aether] skills de '${id}' inyectan ~${tokens} tokens (> ~12K presupuesto) ` +
        `en ${applicable.length} skills — considera recortar o partir skills`,
    )
  }
  return block
}
