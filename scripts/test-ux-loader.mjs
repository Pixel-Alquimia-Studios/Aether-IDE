// Smoke test del loader de design_search (v0.4.0): recorre TODOS los dominios
// por el MISMO camino que usa la herramienta en la app (searchUx -> loadRows ->
// DOMAIN_CONFIG), sin parsear CSVs por su cuenta.
//
// Ejecución: node scripts/test-ux-loader.mjs
//
// Haber existido antes del arreglo habría fallado: searchUx construía
// '<dominio>.csv' a mano (ux -> "ux.csv", color -> "color.csv") en vez de usar
// la tabla DOMAIN_CONFIG — solo ui-reasoning funcionaba por coincidencia.

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'src', 'resources', 'ux', 'data')

const uxData = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'agent', 'uxData.ts')).href
)
const { UX_DOMAINS, DOMAIN_CONFIG } = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'agent', 'designSearch.ts')).href
)

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// --- Loader shim: alimenta los loaders con los archivos REALES del directorio
// (lo mismo que el glob de Vite resuelve en build) — el test nunca parsea ni
// busca a mano: todo pasa por searchUx ---
const csvFiles = readdirSync(dataDir).filter((f) => f.endsWith('.csv'))
const loaders = {}
for (const f of csvFiles) {
  const full = path.join(dataDir, f)
  loaders[full] = async () => readFileSync(full, 'utf8')
}
uxData.setUxLoadersForTests(loaders)

// --- 1) La tabla dominio -> archivo apunta a archivos que EXISTEN en data/ ---
console.log('== Tabla DOMAIN_CONFIG vs archivos en src/resources/ux/data ==')
for (const domain of UX_DOMAINS) {
  const file = DOMAIN_CONFIG[domain]?.file
  check(`${domain} -> ${file ?? '??'} existe`, !!file && csvFiles.includes(file))
}
check(
  'sin archivos huérfanos en data/',
  csvFiles.every((f) => Object.values(DOMAIN_CONFIG).some((c) => c.file === f)),
  `sobran: ${csvFiles.filter((f) => !Object.values(DOMAIN_CONFIG).some((c) => c.file === f)).join(', ')}`,
)

// --- 2) CADA dominio carga y tiene filas, por el camino real (searchUx) ---
console.log('== searchUx por cada dominio (camino real de la herramienta) ==')
// Query genérica por dominio: debe producir resultados en su propio dominio
const SMOKE_QUERIES = {
  style: 'glassmorphism',
  color: 'fintech palette',
  typography: 'developer tool font pairing',
  ux: 'touch target contrast',
  charts: 'time series trend',
  icons: 'settings gear',
  'ui-reasoning': 'saas dashboard',
}
for (const domain of UX_DOMAINS) {
  let out
  try {
    out = await uxData.searchUx(SMOKE_QUERIES[domain] ?? domain, domain, 5)
  } catch (e) {
    check(`${domain}: carga sin error`, false, String(e))
    continue
  }
  check(
    `${domain}: sin error de carga`,
    !/no está empaquetado|desconocido|vacío/i.test(out),
    out.split('\n')[0],
  )
  check(
    `${domain}: filas > 0 (Found >= 1)`,
    /Found:\*{0,2} [1-9]/.test(out),
    out.split('\n')[1] ?? out.split('\n')[0],
  )
}

// --- 3) Error de dominio inexistente: nombra dominio y disponibles ---
console.log('== Mensajes de error ==')
const bad = await uxData.searchUx('glassmorphism', 'colores')
check(
  'dominio desconocido lista los disponibles',
  bad.includes("'colores'") && bad.includes('ui-reasoning') && bad.includes('style'),
)

// --- 4) Auto-detección también carga por la tabla (detecta y carga el otro dominio) ---
console.log('== Auto-detección (carga el dominio detectado) ==')
const auto = await uxData.searchUx('best chart for time series')
check(
  'auto: "time series" -> charts con resultados',
  auto.includes('**Domain:** charts') && /Found:\*{0,2} [1-9]/.test(auto),
)
const autoStyle = await uxData.searchUx('neumorphism')
check(
  'auto: "neumorphism" -> style con resultados',
  autoStyle.includes('**Domain:** style') && /Found:\*{0,2} [1-9]/.test(autoStyle),
)

uxData.setUxLoadersForTests(null)
if (failures > 0) {
  console.error(`\n${failures} fallos`)
  process.exit(1)
}
console.log('\nSmoke del loader: todos los checks pasaron')
