// Tests del terminalStore (Lote B, v0.4.0): límite de 8, labels automáticos,
// cierre con reasignación de activa, markExited, panelShouldClose.
// Ejecución: node scripts/test-terminal-store.mjs
//
// En Node isTauri() es false: open() marca 'exited' sin invocar Rust — los
// tests de creación real (invoke) corren en cargo test. Aquí se prueba la
// lógica de estado del store.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { useTerminalStore, nextLabelFor, canOpenTerminal, MAX_TERMINALS } = await import(
  pathToFileURL(path.join(root, 'src', 'stores', 'terminalStore.ts')).href
)
const { panelShouldClose } = await import(
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

function reset() {
  useTerminalStore.setState({ terminals: [], activeKey: null, shells: null, shellsLoading: false })
}

console.log('== nextLabelFor (nombres automáticos por shell y número) ==')
check('primero: "PowerShell"', nextLabelFor('PowerShell', []) === 'PowerShell')
check('segundo: "PowerShell 2"', nextLabelFor('PowerShell', ['PowerShell']) === 'PowerShell 2')
check('tercero: "PowerShell 3"', nextLabelFor('PowerShell', ['PowerShell', 'PowerShell 2']) === 'PowerShell 3')
check('hueco: si falta "PowerShell 2" lo rellena', nextLabelFor('PowerShell', ['PowerShell', 'PowerShell 3']) === 'PowerShell 2')
check('shells distintos no numeran', nextLabelFor('Git Bash', ['PowerShell']) === 'Git Bash')

console.log('== canOpenTerminal (límite 8) ==')
check('7 terminales → puede abrir', canOpenTerminal(7) === true)
check('8 terminales → NO puede abrir', canOpenTerminal(8) === false)
check('MAX es 8', MAX_TERMINALS === 8)

console.log('== open + markRunning (con invoke no disponible → exited) ==')
reset()
useTerminalStore.getState().open('auto', 'Terminal')
const afterOpen = useTerminalStore.getState().terminals
check('open añade una entrada', afterOpen.length === 1)
check('open marca activa', useTerminalStore.getState().activeKey === afterOpen[0].key)
// En Node isTauri=false → spawnFor marca exited inmediatamente (sin backend)
check('sin Tauri: estado exited (fallo visible)', afterOpen[0].status === 'exited')

console.log('== markExited por rustId ==')
reset()
useTerminalStore.setState({
  terminals: [
    { key: 'k1', id: 'term-1', shellId: 'auto', label: 'Terminal', status: 'running' },
    { key: 'k2', id: 'term-2', shellId: 'auto', label: 'Terminal 2', status: 'running' },
  ],
  activeKey: 'k2',
})
useTerminalStore.getState().markExited('term-1')
const afterExit = useTerminalStore.getState().terminals
check('solo la terminal con ese rustId cambia', afterExit[0].status === 'exited' && afterExit[1].status === 'running')

console.log('== close: elimina + reasigna activa ==')
reset()
useTerminalStore.setState({
  terminals: [
    { key: 'k1', id: 'term-1', shellId: 'auto', label: 'T1', status: 'running' },
    { key: 'k2', id: 'term-2', shellId: 'auto', label: 'T2', status: 'running' },
    { key: 'k3', id: 'term-3', shellId: 'auto', label: 'T3', status: 'running' },
  ],
  activeKey: 'k2',
})
useTerminalStore.getState().close('k2')
const afterClose = useTerminalStore.getState()
check('entry eliminada', afterClose.terminals.length === 2)
check('activa reasignada a la última restante', afterClose.activeKey === 'k3')

// Cerrar la activa cuando es la primera
reset()
useTerminalStore.setState({
  terminals: [
    { key: 'k1', id: 'term-1', shellId: 'auto', label: 'T1', status: 'running' },
    { key: 'k2', id: 'term-2', shellId: 'auto', label: 'T2', status: 'running' },
  ],
  activeKey: 'k1',
})
useTerminalStore.getState().close('k1')
check('cerrar la primera → activa la siguiente', useTerminalStore.getState().activeKey === 'k2')

// Cerrar todas → activa null
reset()
useTerminalStore.setState({
  terminals: [{ key: 'k1', id: 'term-1', shellId: 'auto', label: 'T1', status: 'running' }],
  activeKey: 'k1',
})
useTerminalStore.getState().close('k1')
check('cerrar todas → activa null', useTerminalStore.getState().activeKey === null)
check('cerrar todas → lista vacía', useTerminalStore.getState().terminals.length === 0)

console.log('== panelShouldClose ==')
check('transición 1→0 cierra', panelShouldClose(1, 0) === true)
check('transición 3→0 cierra', panelShouldClose(3, 0) === true)
check('estado inicial 0→0 NO cierra', panelShouldClose(0, 0) === false)
check('1→2 NO cierra', panelShouldClose(1, 2) === false)

if (failures > 0) {
  console.error(`\n${failures} fallos`)
  process.exit(1)
}
console.log('\nTests del terminalStore: todos los checks pasaron')
