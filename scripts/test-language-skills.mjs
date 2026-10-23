// Tests unitarios de la fase 4 (v0.4.0): carga condicional de skills por
// lenguaje + detección de lenguajes del proyecto.
// Ejecución: node scripts/test-language-skills.mjs
//
// Usa las funciones PURAS de skills.ts (parseSkill, skillsForFromDefs) y
// languageDetect.ts (detectProjectLanguages) — el glob de Vite nunca se
// invoca en este test.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { parseSkill, skillsForFromDefs } = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'agent', 'skills.ts')).href
)
const { detectProjectLanguages, EXT_LANGUAGE } = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'agent', 'languageDetect.ts')).href
)

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ---------- Fixtures ----------
const SKILL_ALWAYS = {
  name: 'a-base',
  description: 'sin languages',
  appliesTo: ['qa', 'audit'],
  body: 'contenido base',
}
const SKILL_PY = {
  name: 'b-python',
  description: 'solo python',
  appliesTo: ['qa', 'audit'],
  languages: ['python'],
  body: 'patrones python',
}
const SKILL_GO = {
  name: 'c-go',
  description: 'solo go',
  appliesTo: ['qa'],
  languages: ['go'],
  body: 'patrones go',
}
const SKILL_TS = {
  name: 'd-ts',
  description: 'solo typescript',
  appliesTo: ['audit'],
  languages: ['typescript'],
  body: 'patrones ts',
}

console.log('== Carga condicional (skillsForFromDefs) ==')

// 1) Skill sin languages: SIEMPRE carga
const noDetect = skillsForFromDefs([SKILL_ALWAYS], 'qa', new Set())
check('sin languages carga con detección vacía', noDetect.includes('contenido base'))
const undefinedDetect = skillsForFromDefs([SKILL_ALWAYS], 'qa', undefined)
check('sin languages carga con detección undefined', undefinedDetect.includes('contenido base'))

// 2) Skill con languages: solo si coincide
const pyOnly = skillsForFromDefs([SKILL_PY], 'qa', new Set(['python']))
check('python-skill carga en proyecto python', pyOnly.includes('patrones python'))
const goProject = skillsForFromDefs([SKILL_PY], 'qa', new Set(['go']))
check('python-skill NO carga en proyecto go', !goProject.includes('patrones python'))

// 3) Detección undefined/vacía → condicionales NO cargan (default seguro)
const undefinedCond = skillsForFromDefs([SKILL_PY], 'qa', undefined)
check('condicional NO carga con detección undefined', !undefinedCond.includes('patrones python'))
const emptyCond = skillsForFromDefs([SKILL_PY], 'qa', new Set())
check('condicional NO carga con detección vacía', !emptyCond.includes('patrones python'))

// 4) Mezcla: base siempre + condicional solo si coincide
const mixed = skillsForFromDefs([SKILL_ALWAYS, SKILL_PY, SKILL_GO], 'qa', new Set(['go']))
check('mezcla: base siempre presente', mixed.includes('contenido base'))
check('mezcla: go presente, python ausente', mixed.includes('patrones go') && !mixed.includes('patrones python'))

// 5) Orden estable: alfabético por name, no por orden de entrada
const reordered = skillsForFromDefs([SKILL_GO, SKILL_ALWAYS, SKILL_PY], 'qa', new Set(['python', 'go']))
const idxBase = reordered.indexOf('### SKILL: a-base')
const idxPy = reordered.indexOf('### SKILL: b-python')
const idxGo = reordered.indexOf('### SKILL: c-go')
check('orden alfabético estable (a < b < c)', idxBase !== -1 && idxBase < idxPy && idxPy < idxGo)

// 6) applies_to filtra aparte
const auditTs = skillsForFromDefs([SKILL_ALWAYS, SKILL_TS], 'audit', new Set(['typescript']))
check('audit: base + ts', auditTs.includes('contenido base') && auditTs.includes('patrones ts'))
const qaTs = skillsForFromDefs([SKILL_ALWAYS, SKILL_TS], 'qa', new Set(['typescript']))
check('qa: ts NO aplica (applies_to audit)', !qaTs.includes('patrones ts'))

// 7) Log informativo (solo informa): no lanza con muchas skills
try {
  const many = Array.from({ length: 50 }, (_, i) => ({
    name: `s${String(i).padStart(2, '0')}`,
    description: 'x',
    appliesTo: ['qa'],
    body: 'y'.repeat(2000),
  }))
  const block = skillsForFromDefs(many, 'qa', new Set())
  check('skills masivas no lanzan (solo log)', block.length > 0)
} catch (e) {
  check('skills masivas no lanzan (solo log)', false, String(e))
}

console.log('== parseSkill: frontmatter languages ==')

const RAW_WITH_LANG = `---
name: python-patterns
description: Patrones python
applies_to: [qa, audit]
languages: [python]
---

Cuerpo python.
`
const parsedPy = parseSkill(RAW_WITH_LANG, 'python-patterns.md')
check('languages parseado', parsedPy?.languages?.[0] === 'python')
check('applies_to parseado', parsedPy?.appliesTo.join(',') === 'qa,audit')

const RAW_NO_LANG = `---
name: qa-checklist
description: Checklist
applies_to: [qa]
---

Cuerpo.
`
const parsedNo = parseSkill(RAW_NO_LANG, 'qa-checklist.md')
check('languages ausente → undefined', parsedNo?.languages === undefined)

const RAW_MULTI = `---
name: multi
description: multi
applies_to: [qa, audit]
languages: [python, go]
---

Cuerpo.
`
check('languages múltiples', parseSkill(RAW_MULTI, 'm.md')?.languages?.join(',') === 'python,go')

// ---------- Detección de lenguajes ----------
console.log('== detectProjectLanguages ==')

function file(name, children = undefined) {
  return { path: name, name, kind: 'file', children }
}
function dir(name, children) {
  return { path: name, name, kind: 'directory', children }
}

// 1) Marcadores de raíz
const treePy = [file('app.py'), file('pyproject.toml'), dir('src', [file('main.py')])]
check('pyproject.toml → python', detectProjectLanguages(treePy, []).has('python'))

const treeGo = [dir('cmd', [file('main.go')]), file('go.mod')]
check('go.mod → go', detectProjectLanguages(treeGo, []).has('go'))

const treeJava = [dir('src', [file('App.java')]), file('pom.xml')]
check('pom.xml → java', detectProjectLanguages(treeJava, []).has('java'))

const treeCpp = [file('CMakeLists.txt'), dir('src', [file('engine.cpp')])]
check('CMakeLists.txt → cpp', detectProjectLanguages(treeCpp, []).has('cpp'))

const treeRuby = [file('Gemfile'), dir('app', [file('models.rb')])]
check('Gemfile → ruby', detectProjectLanguages(treeRuby, []).has('ruby'))

const treeRust = [file('Cargo.toml'), dir('src', [file('main.rs')])]
check('Cargo.toml → rust', detectProjectLanguages(treeRust, []).has('rust'))

// 2) build.gradle.kts: java por defecto; Kotlin SOLO con archivos .kt
const treeKtsNoKt = [file('build.gradle.kts'), dir('src', [file('Main.java')])]
const langsKtsNoKt = detectProjectLanguages(treeKtsNoKt, [])
check('build.gradle.kts sin .kt → java', langsKtsNoKt.has('java') && !langsKtsNoKt.has('kotlin'))

const treeKtsWithKt = [file('build.gradle.kts'), dir('src', [file('Main.kt')])]
const langsKtsWithKt = detectProjectLanguages(treeKtsWithKt, [])
check('build.gradle.kts con .kt → kotlin (por extensión)', langsKtsWithKt.has('kotlin'))

// 3) Extensiones por el árbol (src/ visible — tree completo)
const treeTs = [dir('src', [file('index.ts'), file('App.tsx')]), file('package.json')]
check('src/*.ts(x) → typescript', detectProjectLanguages(treeTs, []).has('typescript'))

// 4) fileTree perezoso: directorios con children undefined no rompen
const lazyTree = [dir('src', undefined), file('package.json')]
check('fileTree perezoso (children undefined) no rompe', detectProjectLanguages(lazyTree, []).has('typescript'))

// 5) Pestañas abiertas como fuente (incluso sin tree)
check('pestaña .rb → ruby (sin tree)', detectProjectLanguages([], ['C:\\proj\\app\\models\\user.rb']).has('ruby'))
check('pestaña .rs → rust', detectProjectLanguages([], ['src/lib/main.rs']).has('rust'))

// 6) Exclusiones: pestañas dentro de node_modules/target/dist ignoradas
const excluded = detectProjectLanguages(
  [],
  ['C:\\proj\\node_modules\\pkg\\index.js', 'C:\\proj\\target\\debug\\lib.rs'],
)
check('pestañas en node_modules/target ignoradas', !excluded.has('typescript') && !excluded.has('rust'))

// 7) Proyecto mixto: múltiples lenguajes a la vez
const mixedTree = [file('pom.xml'), dir('src', [file('A.java'), file('B.kt')])]
const mixedLangs = detectProjectLanguages(mixedTree, [])
check('mixto java+kotlin detectado', mixedLangs.has('java') && mixedLangs.has('kotlin'))

// 8) Tabla: entradas que el plan exige
check('tabla: ts/tsx/js/jsx → typescript', EXT_LANGUAGE.ts === 'typescript' && EXT_LANGUAGE.tsx === 'typescript' && EXT_LANGUAGE.js === 'typescript' && EXT_LANGUAGE.jsx === 'typescript')
check('tabla: rs → rust', EXT_LANGUAGE.rs === 'rust')
check('tabla: kts NO mapea a kotlin (regla especial)', EXT_LANGUAGE.kts === undefined)

// ---------- Skills reales del repo ----------
console.log('== Skills reales del repo (frontmatter correcto) ==')
// Las skills reales se leen aquí vía parseSkill del texto crudo (sin el glob
// de Vite) para validar su frontmatter: languages válidos y applies_to.
const { readdirSync, readFileSync } = await import('node:fs')
const skillsDir = path.join(root, 'src', 'resources', 'subagents', 'skills')
for (const f of readdirSync(skillsDir).filter((n) => n.endsWith('.md') && n !== 'README.md')) {
  const parsed = parseSkill(readFileSync(path.join(skillsDir, f), 'utf8'), f)
  check(`${f}: parsea y tiene applies_to`, parsed !== null && parsed.appliesTo.length > 0)
  if (parsed?.languages) {
    const VALID = new Set(['typescript', 'rust', 'python', 'go', 'java', 'kotlin', 'cpp', 'ruby'])
    check(
      `${f}: languages válidos (${parsed.languages.join(', ')})`,
      parsed.languages.every((l) => VALID.has(l)),
    )
  }
}

if (failures > 0) {
  console.error(`\n${failures} fallos`)
  process.exit(1)
}
console.log('\nTests de fase 4: todos los checks pasaron')
