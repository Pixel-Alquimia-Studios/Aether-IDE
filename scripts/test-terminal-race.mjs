// Tests de regresión del bug de la carrera listeners vs spawn (v0.4.0).
// Ejecución: node scripts/test-terminal-race.mjs
//
// Simula el orden "spawn y output ANTES de montar el componente" y comprueba
// que el primer output NO se pierde gracias al buffer pendiente.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { useTerminalStore, subscribeOutput, drainPending, pushPendingOutput } = await import(
  pathToFileURL(path.join(root, 'src', 'stores', 'terminalStore.ts')).href
)

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function resetStore() {
  useTerminalStore.setState({ terminals: [], activeKey: null })
}

console.log('== Escenario: spawn + output ANTES de montar el componente ==')

const rustId = 'term-99'
useTerminalStore.setState({
  terminals: [{ key: 'k-race', id: rustId, shellId: 'auto', label: 'Terminal', status: 'running' }],
  activeKey: 'k-race',
})

// El output de la PTY llega ANTES de que la vista se suscriba.
// pushPendingOutput simula lo que el listener central hace.
pushPendingOutput(rustId, 'user@host:~/project$ ')
pushPendingOutput(rustId, 'ls -la\r\n')
pushPendingOutput(rustId, 'total 0\r\nuser@host:~/project$ ')

// La vista se conecta: drainPending entrega el buffer acumulado
const buffered = drainPending(rustId)
const received = []
const un = subscribeOutput(rustId, (data) => received.push(data))
if (buffered) received.push(buffered)

check(
  'output completo (prompt+ls+prompt)',
  received.join('').includes('user@host') && received.join('').includes('ls -la'),
)

// Unsubscribe → el buffer captura lo nuevo
un()
pushPendingOutput(rustId, 'post-unsubscribe\r\n')
const postBuf = drainPending(rustId)
check('output tras unsubscribe va al buffer', postBuf.includes('post-unsubscribe'))

// Re-suscribe → drain entrega lo nuevo
const received2 = []
const un2 = subscribeOutput(rustId, (data) => received2.push(data))
pushPendingOutput(rustId, 'after-resubscribe\r\n')
const buf2 = drainPending(rustId)
if (buf2) received2.push(buf2)
check('re-suscribe recibe nuevos chunks', received2.join('').includes('after-resubscribe'))
un2()

console.log('== markExited por rustId ==')
resetStore()
useTerminalStore.setState({
  terminals: [{ key: 'k-x', id: 'term-x', shellId: 'auto', label: 'T', status: 'running' }],
  activeKey: 'k-x',
})
useTerminalStore.getState().markExited('term-x')
check('markExited cambia status', useTerminalStore.getState().terminals[0].status === 'exited')

console.log('== markError: nunca conectando infinito ==')
resetStore()
useTerminalStore.setState({
  terminals: [{ key: 'k-err', id: null, shellId: 'auto', label: 'Terminal', status: 'creating' }],
  activeKey: 'k-err',
})
useTerminalStore.getState().markError('k-err', 'No hay un workspace abierto')
const errEntry = useTerminalStore.getState().terminals[0]
check('status exited (nunca creating)', errEntry.status === 'exited')
check('error presente', errEntry.error === 'No hay un workspace abierto')

resetStore()

if (failures > 0) {
  console.error(`\n${failures} fallos`)
  process.exit(1)
}
console.log('\nTests de regresión de la carrera: todos los checks pasaron')
