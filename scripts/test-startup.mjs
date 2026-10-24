// Tests de arranque (Parte 3, v0.4.0): scheduler idle con fallback y lógica
// del spawn diferido de la terminal.
// Ejecución: node scripts/test-startup.mjs

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { scheduleIdle, shouldSpawnTerminal } = await import(
  pathToFileURL(path.join(root, 'src', 'lib', 'startup.ts')).href
)

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('== shouldSpawnTerminal (spawn diferido de la PTY) ==')
check('panel oculto al montar → NO spawn', shouldSpawnTerminal(false, false) === false)
check('sesión restaurada con terminal abierta → spawn al montar', shouldSpawnTerminal(true, false) === true)
check('primer Ctrl+J → spawn', shouldSpawnTerminal(true, false) === true)
check('ocultar tras crear → NO re-spawn (B4: sobrevive)', shouldSpawnTerminal(false, true) === false)
check('re-abrir tras crear → NO re-spawn (PTY viva)', shouldSpawnTerminal(true, true) === false)

console.log('== scheduleIdle (fallback sin requestIdleCallback) ==')
// En Node no existe requestIdleCallback → debe usar el fallback setTimeout
const hasRIC = typeof globalThis.requestIdleCallback === 'function'
await new Promise((resolve) => {
  let calls = 0
  scheduleIdle(() => {
    calls++
    check('invoca el callback exactamente una vez', calls === 1)
    if (!hasRIC) check('usa fallback setTimeout en Node', true)
    setTimeout(resolve, 50) // detectar doble-invocación tardía
  })
})

await new Promise((resolve) => {
  let count = 0
  scheduleIdle(() => count++)
  scheduleIdle(() => count++)
  setTimeout(() => {
    check('dos schedulers independientes ejecutan ambos', count === 2)
    resolve()
  }, 1400)
})

if (failures > 0) {
  console.error(`\n${failures} fallos`)
  process.exit(1)
}
console.log('\nTests de arranque: todos los checks pasaron')
