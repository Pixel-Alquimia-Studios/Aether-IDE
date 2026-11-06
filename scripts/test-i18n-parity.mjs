// Test de paridad i18n (Lote G parte 2.4): las claves de ES y EN deben ser
// IDÉNTICAS - falla si una clave existe en un idioma y no en el otro.
// Además: ninguna clave USADA puede faltar en el diccionario EN (fuente del
// tipo TranslationKey).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const i18nSrc = fs.readFileSync(path.join(root, 'src/lib/i18n.ts'), 'utf8')
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log('  OK  ' + name)
  else {
    failures++
    console.error('  FAIL  ' + name + (detail ? ' - ' + detail : ''))
  }
}

// Extrae el bloque de cada diccionario y sus claves
function keysOf(dictName) {
  const start = i18nSrc.indexOf(`const ${dictName}`)
  if (start === -1) throw new Error(`diccionario ${dictName} no encontrado`)
  // cuenta llaves para cerrar el objeto completo
  let depth = 0
  let end = -1
  let inStr = null
  for (let i = i18nSrc.indexOf('{', start); i < i18nSrc.length; i++) {
    const ch = i18nSrc[i]
    const prev = i18nSrc[i - 1]
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const block = i18nSrc.slice(start, end)
  return new Set([...block.matchAll(/'([a-zA-Z0-9._-]+)':/g)].map((m) => m[1]))
}

const en = keysOf('en')
const es = keysOf('es')
check('diccionario EN tiene claves', en.size > 200, `${en.size}`)
check('diccionario ES tiene claves', es.size > 200, `${es.size}`)

const onlyEn = [...en].filter((k) => !es.has(k))
const onlyEs = [...es].filter((k) => !en.has(k))
check('sin claves solo-EN', onlyEn.length === 0, onlyEn.slice(0, 10).join(', '))
check('sin claves solo-ES', onlyEs.length === 0, onlyEs.slice(0, 10).join(', '))

// Claves usadas en el código que no existen en EN
function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name)
    if (f.isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(f.name)) acc.push(p)
  }
  return acc
}
const srcFiles = walk(path.join(root, 'src'))
const used = new Set()
for (const f of srcFiles) {
  const s = fs.readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\bt(?:Sync)?\(\s*'([a-zA-Z0-9._-]+)'/g)) used.add(m[1])
}
const missing = [...used].filter((k) => !en.has(k))
check('sin claves usadas sin definir', missing.length === 0, missing.slice(0, 10).join(', '))
check('claves usadas en el código', used.size > 100, `${used.size}`)

// Las claves dinámicas settings.reason.* cubren el enum completo
const reasons = ['ok', 'auth', 'rateLimit', 'serverError', 'timeout', 'noNetwork', 'noModelsEndpoint', 'unexpectedStatus', 'redirect', 'noKey', 'noUrl', 'noAuthenticatedCheck']
const missingReasons = reasons.filter((r) => !en.has(`settings.reason.${r}`))
check('settings.reason.* completo (12 motivos)', missingReasons.length === 0, missingReasons.join(', '))

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
