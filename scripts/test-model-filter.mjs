// Test del filtro de modelos (Lote F 0.1): id + nombre, 300+ entradas
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { filterModels } = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'ai', 'modelFilter.ts')).href
)
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log('  OK  ' + name)
  else {
    failures++
    console.error('  FAIL  ' + name + (detail ? ' - ' + detail : ''))
  }
}

// Catálogo simulado con 300+ entradas estilo OpenRouter
const catalog = Array.from({ length: 320 }, (_, i) => ({
  id: `proveedor${i % 20}/modelo-${i}-v${i % 7}`,
  name: `Vendor ${i % 20}: Modelo ${i} variante ${i % 7}`,
  maxContextTokens: 128000,
  modalities: ['text'],
}))
check('catálogo 320 entradas', catalog.length === 320)

// Query vacía: catálogo completo
check('query vacía = todo', filterModels(catalog, '').length === 320)
check('query espacios = todo', filterModels(catalog, '   ').length === 320)

// Filtrado por id
const byId = filterModels(catalog, 'modelo-15-v1')
check('filtra por id', byId.length === 1, `esperado 1, recibido ${byId.length}`)
check('id correcto', byId.every((m) => m.id.includes('modelo-15-v1')))
const byIdWide = filterModels(catalog, 'modelo-15')
// ids que contienen "modelo-15": i=15 ("modelo-15-v1") + i=150..159 (prefijo)
check('filtra por id parcial', byIdWide.length === 11, `esperado 11, recibido ${byIdWide.length}`)

// Filtrado por nombre (case-insensitive)
const byName = filterModels(catalog, 'vendor 3:')
check('filtra por nombre', byName.length === 16, `esperado 16, recibido ${byName.length}`)
const byNameLower = filterModels(catalog, 'VENDOR 3:')
check('nombre case-insensitive', byNameLower.length === byName.length)

// Sin coincidencias: array vacío
check('sin coincidencias = vacío', filterModels(catalog, 'zzz-inexistente').length === 0)

// Ids con "/" y ":" no rompen el filtro
const slash = filterModels(catalog, 'proveedor7/')
check('ids con "/" funcionan', slash.length === 16, `esperado 16, recibido ${slash.length}`)
const colon = filterModels(catalog, ': modelo 42')
check('nombres con ":" funcionan', colon.length === 1, `esperado 1, recibido ${colon.length}`)

// Modelos sin name: filtra solo por id, no rompe
const noName = [{ id: 'gpt-4o', maxContextTokens: null, modalities: ['text'] }]
check('sin name no rompe', filterModels(noName, 'gpt').length === 1)
check('sin name, query por name = vacío', filterModels(noName, 'openai:').length === 0)

// Rendimiento: 320 entradas × varias queries (debe ser instantáneo)
const t0 = performance.now()
for (let i = 0; i < 100; i++) filterModels(catalog, `modelo-${i % 40}`)
const ms = performance.now() - t0
check(`100 filtros sobre 320 entradas < 200 ms (${ms.toFixed(1)} ms)`, ms < 200)

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
