// Test de la numeración de líneas para subagentes (0.4.1-B)
// Ejecución: node scripts/test-subagent-line-numbers.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { numberLines, stripBom } = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'agent', 'lineNumbers.ts')).href
)
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

console.log('== numberLines: archivo conocido (hallazgo a la línea correcta) ==')
// Archivo de 10 líneas con contenido distintivo por línea
const lines = Array.from({ length: 10 }, (_, i) => `linea-${i + 1}`)
const content = lines.join('\n')
const numbered = numberLines(content, 1, 10)
check('línea 5 numerada como " 5| linea-5" (width 2)', numbered.split('\n')[4] === ' 5| linea-5', numbered.split('\n')[4])
// El hallazgo apunta a la línea correcta: extraer la línea N del output y
// comprobar que es el contenido esperado
const target = 7
const cited = numbered.split('\n')[target - 1].split('| ').slice(1).join('| ')
check(`hallazgo line=${target} cita el contenido correcto`, cited === `linea-${target}`, cited)

console.log('== coincidencia con Monaco (convención 1-based) ==')
check('primera línea = 1', numbered.split('\n')[0] === ' 1| linea-1')
check('última línea = 10', numbered.split('\n')[9].startsWith('10| linea-10'))

console.log('== ancho fijo según el total ==')
check('ancho de 10 líneas = 2 (padding estable)', numbered.split('\n')[0] === ' 1| linea-1')
const wide = numberLines(Array.from({ length: 1000 }, (_, i) => `x${i + 1}`).join('\n'), 1, 1000)
check('ancho de 1000 líneas = 4', wide.split('\n')[0].startsWith('   1| x1'))
check('todas las líneas alineadas', wide.split('\n').every((l) => /^\s*\d+\| /.test(l)))

console.log('== CRLF ==')
const crlf = 'uno\r\ndos\r\ntres'
const crlfNum = numberLines(crlf, 1, 3)
check('CRLF normalizado: 3 líneas', crlfNum.split('\n').length === 3)
check('CRLF sin \r residual', !crlfNum.includes('\r'))
check('CRLF numera igual que Monaco', crlfNum.split('\n')[1] === '2| dos')

console.log('== BOM ==')
const bom = '\uFEFFprimera\nsegunda'
check('BOM quitado de la línea 1 (solo en la salida)', stripBom(bom) === 'primera\nsegunda')
const bomNum = numberLines(bom, 1, 2)
check('línea 1 numerada SIN el BOM pegado', bomNum.split('\n')[0] === '1| primera', bomNum.split('\n')[0])
check('línea 2 correcta tras el BOM', bomNum.split('\n')[1] === '2| segunda')

console.log('== final de línea ==')
const withTrailing = 'a\nb\n' // termina en salto de línea
// Monaco: getLineCount('a\nb\n') = 3 (la 3ª línea es vacía y se cuenta)
const trailingNum = numberLines(withTrailing, 1, 3)
check(
  'con salto final: líneas de contenido como Monaco (a=1, b=2, 3ª vacía)',
  trailingNum.split('\n').map((l) => l.replace(/^\s*\d+\| /, '')).join(',') === 'a,b,',
)
check('con salto final: la línea vacía final se numera como 3', trailingNum.split('\n')[2] === '3| ')
const withoutTrailing = 'a\nb' // sin salto final
check(
  'sin salto final: mismas líneas que Monaco',
  numberLines(withoutTrailing, 1, 2).split('\n').map((l) => l.replace(/^\s*\d+\| /, '')).join(',') === 'a,b',
)

console.log('== rango intermedio (números REALES del archivo) ==')
const range = numberLines(lines.slice(3, 7).join('\n'), 4, 10) // líneas 4-7 de 10
check('rango: primera línea numerada 4', range.split('\n')[0] === ' 4| linea-4', range.split('\n')[0])
check('rango: última línea numerada 7', range.split('\n')[3] === ' 7| linea-7')
check('rango: ancho según TOTAL (10 → 2 dígitos)', range.split('\n')[0].startsWith(' 4'))

console.log('== contenido: instrucción en READ_ONLY_RULES y sin copias ==')
const subagentsTs = fs.readFileSync(path.join(root, 'src', 'lib', 'agent', 'subagents.ts'), 'utf8')
check(
  'READ_ONLY_RULES contiene la instrucción de numeración',
  /LECTURA NUMERADA[\s\S]{0,400}NNN\| código[\s\S]{0,400}números EXACTOS/.test(subagentsTs),
)
check(
  'READ_ONLY_RULES: evidencia SIN prefijo + line = primera línea',
  /SIN el prefijo "NNN\|"[\s\S]{0,200}PRIMERA línea/.test(subagentsTs),
)
const agentsDir = path.join(root, 'src', 'resources', 'subagents', 'agents')
for (const f of fs.readdirSync(agentsDir)) {
  const text = fs.readFileSync(path.join(agentsDir, f), 'utf8')
  check(`agents/${f} NO duplica la instrucción de numeración`, !text.includes('LECTURA NUMERADA'))
}

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
