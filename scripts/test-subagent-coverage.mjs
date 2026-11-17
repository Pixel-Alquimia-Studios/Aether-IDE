// Test de la cobertura de subagentes (0.4.1-C)
// Ejecución: node scripts/test-subagent-coverage.mjs
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cov = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'agent', 'subagentCoverage.ts')).href
)
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const ROOT = 'C:\\Users\\test\\proj'

console.log('== codeScope: extensiones y exclusiones ==')
const scope = cov.codeScope(
  [
    `${ROOT}\\src\\main.ts`,
    `${ROOT}\\src\\App.tsx`,
    `${ROOT}\\src\\lib.rs`,
    `${ROOT}\\README.md`, // no es código
    `${ROOT}\\package-lock.json`, // lockfile
    `${ROOT}\\Cargo.lock`, // lockfile
    `${ROOT}\\node_modules\\react\\index.js`, // carpeta excluida
    `${ROOT}\\target\\debug\\main.rs`, // carpeta excluida
    `${ROOT}\\dist\\bundle.js`, // carpeta excluida
    `${ROOT}\\build\\out.js`, // carpeta excluida
    `${ROOT}\\out\\x.ts`, // carpeta excluida
    `${ROOT}\\.next\\y.ts`, // carpeta excluida
    `${ROOT}\\.venv\\z.py`, // carpeta excluida
    `${ROOT}\\__pycache__\\m.py`, // carpeta excluida
    `${ROOT}\\coverage\\c.ts`, // carpeta excluida
    `${ROOT}\\vendor\\v.go`, // carpeta excluida
    `${ROOT}\\.git\\hooks\\h.js`, // carpeta excluida
    `${ROOT}\\src\\app.min.js`, // *.min.*
    `${ROOT}\\src\\types.d.ts`, // *.d.ts
    `${ROOT}\\src\\api.generated.ts`, // *.generated.*
    `${ROOT}\\src\\styles.css`, // no es código
  ],
  ROOT,
)
check('alcance = 3 archivos de código', scope.length === 3, scope.join(', '))
check('rutas normalizadas relativas', scope.every((s) => !s.includes('\\') && s === s.toLowerCase()))

console.log('== decideCoverage ==')
// Todos leídos → accept sin recordatorio
check(
  'todos leídos → accept',
  cov.decideCoverage(['src/a.ts', 'src/b.ts'], new Set(['src/a.ts', 'src/b.ts']), 0, true).action === 'accept',
)
// Faltan → recordatorio con rutas
const d1 = cov.decideCoverage(['src/a.ts', 'src/b.ts'], new Set([]), 0, true)
check('faltan → remind', d1.action === 'remind')
check('recordatorio muestra las rutas', d1.shown.join(',') === 'src/a.ts,src/b.ts')
check('hiddenCount 0', d1.hiddenCount === 0)
// 2 recordatorios → parcial
check(
  'recordatorios agotados → accept-partial',
  cov.decideCoverage(['src/a.ts'], new Set([]), 2, true).action === 'accept-partial',
)
// Alcance > 30 archivos → parcial SIN recordatorios
const bigScope = Array.from({ length: 40 }, (_, i) => `src/f${i}.ts`)
const dBig = cov.decideCoverage(bigScope, new Set(bigScope.slice(0, 5)), 0, true)
check('alcance >30 → accept-partial sin recordatorio', dBig.action === 'accept-partial')
// Sin headroom de contexto → parcial directo
check(
  'sin headroom de contexto → accept-partial',
  cov.decideCoverage(['src/a.ts'], new Set([]), 0, false).action === 'accept-partial',
)
// Tope de rutas por recordatorio (15 + "y N más")
const many = Array.from({ length: 20 }, (_, i) => `src/f${i}.ts`)
const dMany = cov.decideCoverage(many, new Set([]), 0, true)
check('tope 15 rutas mostradas', dMany.shown.length === 15)
check('y 5 más', dMany.hiddenCount === 5)

console.log('== tope de llamadas y repetición ==')
check('MAX_TOOL_CALLS_SUBAGENT = 60', cov.MAX_TOOL_CALLS_SUBAGENT === 60)
// Repetición: 3ª consecutiva avisa, 4ª cierra
let st = null
st = cov.trackRepeat(st, 'read_file', { path: 'src/a.ts' })
st = cov.trackRepeat(st.state, 'read_file', { path: 'src/a.ts' })
check('2ª repetición sin aviso', st.warn === false && st.stop === false)
const third = cov.trackRepeat(st.state, 'read_file', { path: 'src/a.ts' })
check('3ª consecutiva → aviso', third.warn === true && third.stop === false)
const fourth = cov.trackRepeat(third.state, 'read_file', { path: 'src/a.ts' })
check('4ª consecutiva → cierra', fourth.warn === false && fourth.stop === true)
// Distinto argumento rompe la cadena
const diff = cov.trackRepeat(third.state, 'read_file', { path: 'src/b.ts' })
check('args distintos reinician', diff.warn === false && diff.stop === false && diff.state.count === 1)
// Herramienta distinta rompe
const otherTool = cov.trackRepeat(third.state, 'search_files', { path: 'src/a.ts' })
check('otra herramienta reinicia', otherTool.state.count === 1)

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
