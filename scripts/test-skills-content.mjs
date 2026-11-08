// Test de contenido de skills y prompts de agentes (0.4.1, Fase 0.5-B/C)
// Valida: prohibidos, menciones de herramientas (analogía vs imperativo),
// presupuesto del system prompt y atribución MIT. Las secciones clave se
// comprueban SOLO en los archivos ya restaurados (RESTORED_SECTIONS).
// Ejecución: node scripts/test-skills-content.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RES = path.join(root, 'src', 'resources', 'subagents')
let failures = 0
let warnings = 0
function fail(name, detail) {
  failures++
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
}
function warn(name, detail) {
  warnings++
  console.warn(`  AVISO  ${name}${detail ? ` - ${detail}` : ''}`)
}
function check(name, cond, detail) {
  if (cond) console.log(`  OK  ${name}`)
  else fail(name, detail)
}

// Archivos derivados: 4 prompts de agentes + skills (README no deriva de nada)
const AGENTS = ['bugbot.md', 'secbot.md', 'auditbot.md', 'uxbot.md']
const SKILLS = fs.readdirSync(path.join(RES, 'skills')).filter((f) => f.endsWith('.md') && f !== 'README.md')
const ALL_FILES = [...AGENTS.map((f) => `agents/${f}`), ...SKILLS.map((f) => `skills/${f}`)]
const read = (rel) => fs.readFileSync(path.join(RES, rel), 'utf8')

// Restauración en curso (Fase 1a/1b/1c): los archivos listados aquí ya fueron
// restaurados y se les exigen sus secciones clave. Vacío al principio.
const RESTORED_SECTIONS = {}

// ============ 1. Prohibidos: fallo directo ============
console.log('== Prohibidos (fallo directo en todos los archivos) ==')
const BANNED = [
  'write_file',
  'execute_command',
  'Bash',
  'Prompt Defense Baseline',
  'Approval Criteria',
]
for (const rel of ALL_FILES) {
  const text = read(rel)
  for (const b of BANNED) {
    if (text.includes(b)) fail(`${rel}: contiene prohibido "${b}"`)
  }
}

// ============ 2. Términos-herramienta: analogía vs imperativo ============
console.log('== Menciones de herramientas (criterio de lectura, no órdenes) ==')
const TOOLS = [
  'mypy', 'ruff', 'bandit', 'eslint', 'npm audit', 'cargo clippy', 'go vet',
  'mvn', 'tsc', 'prettier', 'vitest', 'jest', 'git diff --staged', 'git log --oneline',
]
// Términos con límites de palabra: "tsconfig" NO es una mención de "tsc"
const toolPattern = (tool) =>
  new RegExp(`\\b${tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
// Imperativo: verbo de ejecución INMEDIATAMENTE antes del término (con
// artículos intermedios permitidos). "La llamada a la API corre sin X" NO lo es.
const imperativeBefore = (text, idx) =>
  /(?:ejecuta|corre|lanza|run)(?:\s+(?:el|la|los|las|tu|este|ese|ese\s+comando))*\s+$/i.test(
    text.slice(Math.max(0, idx - 40), idx + 1),
  )
// "usa X para validar/comprobar" en las cercanías del término
const useForValidation = (text, idx, len) =>
  /usa\s+\S+[^.\n]{0,40}\s+(?:para|to)\s+(?:validar|comprobar|check)/i.test(
    text.slice(Math.max(0, idx - 60), idx + len + 60),
  )
// Marcador FUERTE de analogía (NO "como" ni "similar")
const STRONG_MARKER = /a lo |al estilo de|equivalente a|leyendo|en vez de/i
const WINDOW = 120
for (const rel of ALL_FILES) {
  const text = read(rel)
  const hay = text.toLowerCase()
  for (const tool of TOOLS) {
    const needle = tool.toLowerCase()
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      // límites de palabra: "tsconfig" no es una mención de "tsc"
      const before = idx === 0 ? ' ' : hay[idx - 1]
      const after = idx + needle.length >= hay.length ? ' ' : hay[idx + needle.length]
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
        const from = Math.max(0, idx - WINDOW)
        const to = Math.min(text.length, idx + needle.length + WINDOW)
        const context = text.slice(from, to)
        const where = `${rel} (${tool})`
        const isImperative =
          imperativeBefore(text, idx) || useForValidation(text, idx, needle.length)
        if (isImperative) {
          fail(`${where}: contexto imperativo alrededor de la herramienta`, context.replace(/\n/g, ' ').slice(0, 160))
        } else if (STRONG_MARKER.test(context)) {
          // OK: mención como criterio de lectura
        } else if (RESTORED_SECTIONS[rel]) {
          fail(`${where}: mención sin marcador de analogía en archivo restaurado`, context.replace(/\n/g, ' ').slice(0, 160))
        } else {
          warn(`${where}: mención sin marcador (archivo sin restaurar)`)
        }
      }
      idx = hay.indexOf(needle, idx + needle.length)
    }
  }
}

// ============ 3. Presupuesto del system prompt por bot ============
// Estimación: bytes UTF-8 / 4 (aproximación de tokens; el texto real depende
// del tokenizador del proveedor). FALLA solo si supera el tope aprobado.
console.log('== Presupuesto del system prompt (estimación bytes/4) ==')
const BUDGET_TOKENS = 6000
const subagentsTs = fs.readFileSync(path.join(root, 'src', 'lib', 'agent', 'subagents.ts'), 'utf8')
const READ_ONLY = /const READ_ONLY_RULES = `([\s\S]*?)`/.exec(subagentsTs)[1]
const FINDINGS = /const FINDINGS_FORMAT = `([\s\S]*?)`/m.exec(subagentsTs)[1]
const b = (t) => Buffer.byteLength(t, 'utf8')

function skillsFor(bot, langs) {
  const out = []
  for (const f of SKILLS) {
    const text = read(`skills/${f}`)
    const applies = /applies_to:\s*\[([^\]]*)\]/.exec(text)
    if (!applies || !applies[1].split(',').map((s) => s.trim()).includes(bot)) continue
    const langsM = /languages:\s*\[([^\]]*)\]/.exec(text)
    if (langsM) {
      const need = langsM[1].split(',').map((s) => s.trim())
      if (!need.some((l) => langs.has(l))) continue
    }
    out.push(text)
  }
  return out
}
const AGENT_FILE = { qa: 'agents/bugbot.md', security: 'agents/secbot.md', audit: 'agents/auditbot.md', ux: 'agents/uxbot.md' }
const SCENARIOS = { TypeScript: new Set(['typescript']), Python: new Set(['python']), 'Workspace vacío': new Set([]) }
let overBudget = false
for (const [label, langs] of Object.entries(SCENARIOS)) {
  for (const bot of ['qa', 'security', 'audit', 'ux']) {
    let total = b(read(AGENT_FILE[bot])) + b(READ_ONLY) + b(FINDINGS) + 16
    for (const s of skillsFor(bot, langs)) total += b(s)
    const tokens = Math.round(total / 4)
    const over = tokens > BUDGET_TOKENS
    if (over) overBudget = true
    const mark = over ? ' EXCEDE' : ''
    console.log(`  ${bot.padEnd(9)} ${label.padEnd(16)} ~${tokens} tok (${total} B)${mark}`)
  }
}
check(`presupuesto: ningún bot supera ${BUDGET_TOKENS} tokens`, !overBudget)

// ============ 4. Atribución MIT en cada archivo derivado ============
console.log('== Atribución MIT ==')
for (const rel of ALL_FILES) {
  const text = read(rel)
  if (!/MIT/i.test(text)) fail(`${rel}: sin atribución MIT`)
}

// ============ 5. Secciones clave en archivos restaurados ============
console.log('== Secciones clave (archivos restaurados) ==')
const restoredCount = Object.keys(RESTORED_SECTIONS).length
if (restoredCount === 0) console.log('  (ningún archivo restaurado aún)')
for (const [rel, sections] of Object.entries(RESTORED_SECTIONS)) {
  const text = read(rel)
  for (const section of sections) {
    if (!new RegExp(section, 'i').test(text)) fail(`${rel}: falta la sección clave "${section}"`)
  }
}

console.log(
  failures === 0
    ? `\nTODO OK${warnings > 0 ? ` (${warnings} avisos)` : ''}`
    : `\n${failures} FALLOS${warnings > 0 ? `, ${warnings} avisos` : ''}`,
)
process.exit(failures === 0 ? 0 : 1)
