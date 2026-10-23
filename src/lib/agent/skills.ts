// Loader de skills para los subagentes (fase D v0.3.0, fase 4 v0.4.0).
// Los skills viven en src/resources/subagents/skills/*.md con frontmatter:
//   ---
//   name: security-injection
//   description: ...
//   applies_to: [security, audit]
//   languages: [python]        <- opcional (v0.4.0)
//   ---
// El texto se importa como raw en BUILD TIME (import.meta.glob con ?raw):
// cero IO en runtime, y un skill nuevo "aparece solo" en el glob.
// El orden de composición es ALFABÉTICO por nombre: determinista, de modo que
// el system prompt resultante sea estable y aproveche la caché de prompt
// (fase A) — el mensaje system es el prefijo del contexto.
//
// v0.4.0 (fase 4): campo opcional `languages`. Regla de carga:
//   - Skill SIN languages: se carga SIEMPRE (compatibilidad total).
//   - Skill CON languages: solo si hay intersección con los lenguajes
//     detectados del proyecto (src/lib/agent/languageDetect.ts). Si la
//     detección vino vacía/undefined, los skills condicionales NO cargan
//     (default seguro: no podemos confirmar el lenguaje).

export type SubagentId = 'qa' | 'security' | 'audit' | 'ux'

export interface SkillDef {
  name: string
  description: string
  appliesTo: SubagentId[]
  /** Si está definido, el skill solo carga cuando el proyecto usa uno de estos lenguajes */
  languages?: string[]
  body: string
}

// RUTA (fix v0.4.0): desde src/lib/agent/ son DOS niveles hasta src/ —
// '../resources/…' resolvía a src/lib/resources (inexistente) y el glob
// devolvía vacío: las skills NO se cargaban en ningún build de v0.3.x.
// v0.4.0: carga DENTRO de función (perezosa) — import.meta.glob no existe en
// Node y así los tests unitarios pueden importar el módulo sin explotar.
let cachedSkills: SkillDef[] | null = null

function loadSkills(): SkillDef[] {
  if (cachedSkills) return cachedSkills
  const raw = import.meta.glob('../../resources/subagents/skills/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  cachedSkills = Object.entries(raw)
    .map(([path, text]) => parseSkill(text, path))
    .filter((s): s is SkillDef => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
  return cachedSkills
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? path
}

/** Puro: parsea frontmatter (name/description/applies_to/languages) + cuerpo */
export function parseSkill(raw: string, path: string): SkillDef | null {
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
  const languagesRaw = /^languages:\s*\[(.*)\]$/m.exec(header)?.[1] ?? ''
  const languages = languagesRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return { name, description, appliesTo, languages: languages.length > 0 ? languages : undefined, body: body.trim() }
}

/**
 * Presupuesto informativo de tokens (criterio v0.4.0: SIN límite de tamaño —
 * incluye todo lo valioso). Estimación chars/4; solo informa en consola:
 * no recorta, no bloquea, no lanza errores.
 */
function reportTokenUsage(id: SubagentId, block: string, count: number): void {
  const tokens = Math.round(block.length / 4)
  console.info(`[aether] skills de '${id}': ~${tokens} tokens estimados (${count} skills inyectadas)`)
  if (block.length > 48_000) {
    console.warn(`[aether] las skills de '${id}' superan ~12K tokens — incluye todo lo valioso, pero revisa si alguna no aporta a este agente`)
  }
}

/**
 * Puro (testeable): filtra y compone el bloque de skills.
 *   - applies_to debe incluir el id del subagente.
 *   - Sin `languages`: carga SIEMPRE.
 *   - Con `languages`: solo si interseca con `detectedLanguages`.
 *   - `detectedLanguages` undefined/vacío → los condicionales NO cargan
 *     (default seguro). Orden: alfabético por name (estable, cacheable).
 */
export function skillsForFromDefs(
  defs: SkillDef[],
  id: SubagentId,
  detectedLanguages?: ReadonlySet<string>,
): string {
  const applicable = defs
    .filter((s) => {
      if (!s.appliesTo.includes(id)) return false
      if (!s.languages || s.languages.length === 0) return true
      if (!detectedLanguages || detectedLanguages.size === 0) return false
      return s.languages.some((l) => detectedLanguages.has(l))
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  if (applicable.length === 0) return ''
  const sections = applicable.map((s) => `### SKILL: ${s.name}\n\n${s.body}`)
  const block = `## CONOCIMIENTO ESPECIALIZADO\n\n${sections.join('\n\n---\n\n')}`
  reportTokenUsage(id, block, applicable.length)
  return block
}

/**
 * Devuelve el bloque de skills concatenado para un subagente (string vacío si
 * no aplica ninguno). Determinista: mismo contenido y mismo orden siempre.
 * `detectedLanguages`: lenguajes detectados del proyecto (una sola detección
 * por invocación, calculada por el llamador ANTES de armar el prompt).
 */
export function skillsFor(id: SubagentId, detectedLanguages?: ReadonlySet<string>): string {
  return skillsForFromDefs(loadSkills(), id, detectedLanguages)
}
