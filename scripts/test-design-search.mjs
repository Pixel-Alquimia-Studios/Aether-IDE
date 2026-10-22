// Test de paridad del port designSearch.ts contra search.py (Python).
// Ejecución: node scripts/test-design-search.mjs
//   - Corre search.py con ~10 consultas fixture (python está disponible)
//   - Compara: dominio detectado, nº de resultados y Style IDs/Categorías top
//   - Además valida casos que DEBEN abstenerse y el filtrado por-status
// No requiere Vite (designSearch.ts es puro): carga los CSV por fs.

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'src', 'resources', 'ux', 'data')
const pySearch = path.join(
  root,
  'ui-ux-pro-max-skill-main',
  'ui-ux-pro-max-skill-main',
  'src',
  'ui-ux-pro-max',
  'scripts',
  'search.py',
)

// designSearch.ts se importa como TS (Node 25 strip-types) — es puro, sin @/
const { parseCsv, searchRows, formatResult } = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'agent', 'designSearch.ts')).href
)

const FILES = {
  style: 'styles.csv',
  color: 'colors.csv',
  typography: 'typography.csv',
  ux: 'ux-guidelines.csv',
  charts: 'charts.csv',
  icons: 'icons.csv',
  'ui-reasoning': 'ui-reasoning.csv',
}

const rowsByDomain = {}
for (const [domain, file] of Object.entries(FILES)) {
  const p = path.join(dataDir, file)
  if (!existsSync(p)) {
    console.error(`Falta el CSV: ${p}`)
    process.exit(1)
  }
  rowsByDomain[domain] = parseCsv(readFileSync(p, 'utf8'))
}

let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  OK  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// --- Consultas fixture (mismas para Python y el port) ---
const QUERIES = [
  { query: 'dashboard with glassmorphism cards', expectDomain: 'style' },
  { query: 'color palette for fintech app', expectDomain: 'color' },
  { query: 'font pairing for a developer tool', expectDomain: 'typography' },
  { query: 'touch target size on mobile', expectDomain: 'ux' },
  { query: 'best chart for time series', expectDomain: 'charts', pyDomain: 'chart' },
  { query: 'icon for settings gear', expectDomain: 'icons' },
  // ui-reasoning es un dominio NUEVO de Aether (no existe en search.py):
  // solo se valida el port, no la paridad de dominio
  { query: 'design system recommendation for healthcare', expectDomain: 'ui-reasoning', skipPy: true },
  { query: 'minimalism and swiss style', expectDomain: 'style', exact: 'minimalism-and-swiss-style' },
  { query: 'neumorphism', expectDomain: 'style', exact: 'neumorphism' },
  { query: 'accessibility for keyboard navigation', expectDomain: 'ux' },
]

const IDENTITY_FIELD = { style: 'Style ID', color: 'Product Type', typography: 'Font Pairing Name', ux: 'Issue', charts: 'Data Type', icons: 'Icon Name', 'ui-reasoning': 'UI_Category', chart: 'Data Type' }

function pySearchFixture(query, domain) {
  const cmd = ['python', pySearch, query, '--json']
  if (domain) cmd.push('--domain', domain)
  const out = execFileSync(cmd[0], cmd.slice(1), {
    encoding: 'utf8',
    cwd: path.dirname(pySearch),
    maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(out)
}

function topIdentity(result) {
  const first = result.results?.[0]
  if (!first) return null
  const field = IDENTITY_FIELD[result.domain]
  return first[field] ?? null
}

/** Normaliza identidades para comparar: minúsculas sin no-letras (& vs and) */
function squash(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

console.log('== Comparación port TS vs search.py ==')
let pyAvailable = true
try {
  pySearchFixture('glassmorphism', 'style')
} catch (e) {
  pyAvailable = false
  console.error(`  AVISO: search.py no disponible (${e.message.split('\n')[0]}); solo pruebas de abstención/contrato`)
}

if (pyAvailable) {
  for (const fixture of QUERIES) {
    if (fixture.skipPy) {
      const ts = searchRows(rowsByDomain, fixture.query, fixture.domain, 3)
      check(`"${fixture.query}" [dominio nuevo] devuelve resultados`, ts.count > 0)
      continue
    }
    const py = pySearchFixture(fixture.query, fixture.pyDomain ?? fixture.domain)
    const ts = searchRows(rowsByDomain, fixture.query, fixture.domain, 3)
    // El dominio "chart" se renombró a "charts" en el port
    const pyDomainNorm = py.domain === 'chart' ? 'charts' : py.domain
    const label = `"${fixture.query}" [${fixture.domain ?? 'auto'}]`
    check(`${label} dominio`, ts.domain === pyDomainNorm, `py=${py.domain} ts=${ts.domain}`)
    check(`${label} nº resultados`, ts.count === py.count, `py=${py.count} ts=${ts.count}`)
    if (ts.domain === pyDomainNorm && ts.count > 0) {
      const pyTop = topIdentity(py)
      const tsTop = topIdentity(ts)
      check(`${label} top`, pyTop === tsTop, `py=${pyTop} ts=${tsTop}`)
    }
    if (fixture.exact) {
      check(
        `${label} identidad exacta`,
        squash(topIdentity(ts)).includes(squash(fixture.exact)),
        `top=${topIdentity(ts)}`,
      )
    }
  }
}

console.log('== Casos de abstención (0 resultados, sin crash) ==')
const abstain = searchRows(rowsByDomain, 'zzqqxx totally unrelated widget frobnicator', 'style', 3)
check('abstención: 0 resultados', abstain.count === 0)
check('abstención: sugerencias presentes', Array.isArray(abstain.suggestions) && abstain.suggestions.length > 0)

const lucide = searchRows(rowsByDomain, 'lucide icon for actions', 'icons', 3)
check('lucide → abstención (biblioteca no soportada)', lucide.count === 0 && !!lucide.note)

console.log('== Contrato del formato ==')
const fmt = formatResult(searchRows(rowsByDomain, 'glassmorphism', 'style', 1))
check('formato: encabezado Domain', fmt.includes('**Domain:** style'))
check('formato: bloques ### Result', fmt.includes('### Result 1'))
check('formato: campos **Key:**', /\*\*[^*]+:\*\*/.test(fmt))
const fmtNone = formatResult(searchRows(rowsByDomain, 'zzqqxx frobnicator', 'style', 3))
check('formato vacío: sin ### Result', !fmtNone.includes('### Result'))

console.log('== Filtrado de estilos deprecated ==')
const deprecatedRows = rowsByDomain.style.filter((r) => (r.Status || 'active') === 'deprecated')
check('styles.csv tiene deprecados (precondición)', deprecatedRows.length > 0)
const anyDeprecatedInRanking = QUERIES.some((f) => {
  if (f.domain && f.domain !== 'style') return false
  const r = searchRows(rowsByDomain, f.query, 'style', 20)
  return r.results.some((row) => (row.Status || 'active') === 'deprecated')
})
check('el ranking nunca devuelve deprecados', !anyDeprecatedInRanking)

if (failures > 0) {
  console.error(`\n${failures} fallos`)
  process.exit(1)
}
console.log('\nTodos los checks pasaron ✓')
