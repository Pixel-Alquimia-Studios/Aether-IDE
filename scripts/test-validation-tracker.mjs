// Test del tracker de carreras de validación de keys (Lote F 5)
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { createValidationTracker } = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'ai', 'validationToken.ts')).href
)
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log('  OK  ' + name)
  else {
    failures++
    console.error('  FAIL  ' + name + (detail ? ' - ' + detail : ''))
  }
}

// Validación normal: start → isValid true
const t = createValidationTracker()
const tok1 = t.start('openai')
check('token válido tras start', t.isValid('openai', tok1))

// Nueva validación del MISMO proveedor invalida el token anterior (reemplazo)
const tok2 = t.start('openai')
check('reemplazo invalida el token anterior', !t.isValid('openai', tok1))
check('reemplazo: el nuevo token es válido', t.isValid('openai', tok2))

// Borrar la key descarta la validación en vuelo
t.discard('openai')
check('discard invalida la validación en vuelo', !t.isValid('openai', tok2))

// Proveedores independientes
const tokA = t.start('openai')
const tokB = t.start('anthropic')
check('proveedores independientes A', t.isValid('openai', tokA))
check('proveedores independientes B', t.isValid('anthropic', tokB))
t.discard('openai')
check('discard de A no afecta a B', !t.isValid('openai', tokA) && t.isValid('anthropic', tokB))

// Cambio de proveedor: discard del anterior no rompe el nuevo
const tokC = t.start('gemini')
t.discard('anthropic')
check('cambio de proveedor descarta el anterior', !t.isValid('anthropic', tokB))
check('el nuevo sigue válido', t.isValid('gemini', tokC))

// Token de otra "época" nunca es válido
check('token desconocido inválido', !t.isValid('openai', 999999))

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
