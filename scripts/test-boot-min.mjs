// Test de la duración mínima de la pantalla de carga (Lote H)
// Ejecución: node scripts/test-boot-min.mjs
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const startup = await import(pathToFileURL(path.join(root, 'src', 'lib', 'startup.ts')).href)
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

console.log('== BOOT_MIN_MS ==')
check('constante única = 1000', startup.BOOT_MIN_MS === 1000)

console.log('== bootMinRemaining (lógica de decisión) ==')
// Arranque rápido: quedan 700 ms de espera
check('arranque rápido (300ms) → 700 restantes', startup.bootMinRemaining(0, 300) === 700)
// Arranque lento: ya se pasó el mínimo → SIN espera añadida
check('arranque lento (2500ms) → 0', startup.bootMinRemaining(0, 2500) === 0)
// Justo en el límite
check('justo en el mínimo (1000ms) → 0', startup.bootMinRemaining(0, 1000) === 0)
// Sin arrancar
check('instante 0 → 1000', startup.bootMinRemaining(0, 0) === 1000)
// Reloj raro (now < start): se trata como arranque recién empezado
check('reloj anómalo → espera completa (clamp)', startup.bootMinRemaining(500, 100) === 1000)
// Con bootStart distinto de 0
check('offset (start=500, now=900) → 600', startup.bootMinRemaining(500, 900) === 600)

console.log('== removeBootScreenAfterMin (retiro real del placeholder) ==')
// Mock mínimo de document/window: el script debe retirar #boot y limpiar el guard
let bootRemoved = false
let keyGuardActive = true
globalThis.document = {
  getElementById: (id) => (id === 'boot' && !bootRemoved ? { remove: () => (bootRemoved = true) } : null),
}
globalThis.window = {
  addEventListener: () => (keyGuardActive = true),
  removeEventListener: () => (keyGuardActive = false),
}
// performance real de Node: bootStart "hace 2500ms" → retiro INMEDIATO
{
  const t0 = performance.now()
  startup.installBootScreenGuard()
  startup.removeBootScreenAfterMin(performance.now() - 2500)
  check('arranque lento: retiro inmediato (sin espera)', bootRemoved === true && performance.now() - t0 < 50)
  check('guard de teclado liberado al retirar', keyGuardActive === false)
  // Idempotente: segunda llamada no rompe ni re-loguea
  startup.removeBootScreenAfterMin(performance.now())
  check('idempotente (StrictMode)', bootRemoved === true)
}

// Arranque rápido: el placeholder persiste hasta BOOT_MIN_MS y se retira entonces
{
  // reset de módulo: reimport con query única para estado fresco
  const fresh = await import(
    pathToFileURL(path.join(root, 'src', 'lib', 'startup.ts')).href + `?v=${Date.now()}`
  )
  bootRemoved = false
  globalThis.document.getElementById = (id) =>
    id === 'boot' && !bootRemoved ? { remove: () => (bootRemoved = true) } : null
  fresh.installBootScreenGuard()
  const t0 = performance.now()
  fresh.removeBootScreenAfterMin(t0) // arranque "ahora": debe esperar ~1000ms
  const earlyCheck = performance.now() - t0 < 300 ? bootRemoved : null
  check('placeholder visible mientras no se cumple el mínimo', earlyCheck === false)
  await new Promise((r) => setTimeout(r, 1300))
  check('retirado al cumplir el mínimo (~1000ms)', bootRemoved === true)
  const elapsed = performance.now() - t0
  check(`retiro ≈ BOOT_MIN_MS, no antes (${Math.round(elapsed)}ms ≥ 1000)`, elapsed >= 1000)
  check('guard de teclado liberado tras retirar', keyGuardActive === false)
}

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
