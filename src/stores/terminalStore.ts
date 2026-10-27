// Store de terminales (Lote B, v0.4.0): múltiples PTYs vivas, sidebar y spawn
// diferido. El backend (pty.rs) ya es multi-sesión por id; este store gestiona
// la lista del frontend, el límite (8) y los listeners CENTRALES de salida:
//
//   - Un único par de listeners 'terminal-output'/'terminal-exited' (no uno por
//     instancia): enruta el output al buffer de su terminal o, si la vista ya
//     está suscrita, directo al xterm. Los buffers cubren el gap entre el spawn
//     y la conexión de la vista (el prompt inicial no se pierde).
//   - En Node (tests) isTauri() es false: los invokes se guardan y los tests
//     ejercitan la lógica de estado sin backend.
//
// Seguridad: el frontend solo manda el ID del shell; la ruta/executable la
// resuelve Rust contra la lista detectada (pty.rs shell_command_for).

import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { create } from 'zustand'

/** Límite de terminales simultáneas (~3-6 MB por terminal: buffer xterm + ConPTY) */
export const MAX_TERMINALS = 8

export type TerminalStatus = 'creating' | 'running' | 'exited'

export interface TerminalEntry {
  /** Clave local estable (sobrevive mientras el entry exista) */
  key: string
  /** id de Rust; null mientras la PTY se crea */
  id: string | null
  /** id lógico del shell ('auto' = default detectado en Rust) */
  shellId: string
  label: string
  status: TerminalStatus
  /** Error de spawn/conexión (se muestra EN el panel, nunca "conectando…" infinito) */
  error?: string
}

export interface ShellInfo {
  id: string
  label: string
}

interface TerminalState {
  terminals: TerminalEntry[]
  activeKey: string | null
  /** Shells detectados (cache de sesión; list_shells NO corre al arrancar) */
  shells: ShellInfo[] | null
  shellsLoading: boolean

  open: (shellId: string, label: string) => void
  openDefault: () => void
  close: (key: string) => void
  restart: (key: string) => void
  setActive: (key: string) => void
  markRunning: (key: string, rustId: string) => void
  markExited: (rustId: string) => void
  markExitedByKey: (key: string) => void
  markError: (key: string, message: string) => void
  loadShells: () => Promise<void>
}

function makeKey(): string {
  return `tkey-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Nombre automático por shell y número: "PowerShell", "PowerShell 2", … */
export function nextLabelFor(base: string, existingLabels: string[]): string {
  if (!existingLabels.includes(base)) return base
  let n = 2
  while (existingLabels.includes(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** Límite: el botón + se deshabilita al llegar a MAX_TERMINALS */
export function canOpenTerminal(count: number): boolean {
  return count < MAX_TERMINALS
}

/** Cerrar la última terminal cierra el panel (transición, no estado inicial) */
export function panelShouldClose(prevCount: number, nextCount: number): boolean {
  return prevCount > 0 && nextCount === 0
}

// ============ Listeners centrales (uno por app, no por instancia) ============

const pendingOutput = new Map<string, string>()
const outputSubs = new Map<string, (data: string) => void>()
let listenersReady = false

export function initListeners(): void {
  if (!isTauri() || listenersReady) return
  listenersReady = true
  void listen<{ terminalId: string; data: string }>('terminal-output', (event) => {
    const { terminalId, data } = event.payload
    const sub = outputSubs.get(terminalId)
    if (sub) {
      sub(data)
      return
    }
    // Vista aún no conectada: buffer acotado (el prompt inicial no se pierde)
    const buffered = (pendingOutput.get(terminalId) ?? '') + data
    pendingOutput.set(terminalId, buffered.length > 256_000 ? buffered.slice(-256_000) : buffered)
  })
  void listen<string>('terminal-exited', (event) => {
    pendingOutput.delete(event.payload)
    useTerminalStore.getState().markExited(event.payload)
  })
}

/** Suscribe el writer de una vista al output de su PTY (replay del buffer) */
export function subscribeOutput(
  rustId: string,
  writer: (data: string) => void,
): () => void {
  outputSubs.set(rustId, writer)
  return () => {
    outputSubs.delete(rustId)
  }
}

/** Drena y limpia el buffer pendiente de una PTY (al conectar la vista) */
export function drainPending(rustId: string): string {
  const buffered = pendingOutput.get(rustId) ?? ''
  pendingOutput.delete(rustId)
  return buffered
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  terminals: [],
  activeKey: null,
  shells: null,
  shellsLoading: false,

  open: (shellId, label) => {
    const { terminals } = get()
    if (!canOpenTerminal(terminals.length)) return
    const key = makeKey()
    const fullLabel = nextLabelFor(label, terminals.map((t) => t.label))
    set({
      terminals: [
        ...terminals,
        { key, id: null, shellId, label: fullLabel, status: 'creating' },
      ],
      activeKey: key,
    })
    void spawnFor(key)
  },

  openDefault: () => {
    get().open('auto', 'Terminal')
  },

  // Cerrar: mata SU proceso (árbol incluido, killer propio en Rust) y limpia
  // la entrada del store sin afectar a las demás
  close: (key) => {
    const entry = get().terminals.find((t) => t.key === key)
    if (entry?.id && isTauri()) {
      void invoke('terminal_kill', { terminalId: entry.id }).catch(() => undefined)
    }
    pendingOutput.delete(entry?.id ?? '')
    const remaining = get().terminals.filter((t) => t.key !== key)
    let activeKey = get().activeKey
    if (activeKey === key) {
      activeKey = remaining[remaining.length - 1]?.key ?? null
    }
    set({ terminals: remaining, activeKey })
  },

  // Reiniciar con el MISMO shell (↻): mata la PTY vieja y lanza otra igual
  restart: (key) => {
    const entry = get().terminals.find((t) => t.key === key)
    if (!entry || entry.status === 'creating') return
    if (entry.id && isTauri()) {
      void invoke('terminal_kill', { terminalId: entry.id }).catch(() => undefined)
    }
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.key === key ? { ...t, id: null, status: 'creating' } : t,
      ),
      activeKey: key,
    }))
    void spawnFor(key)
  },

  setActive: (key) => set({ activeKey: key }),

  markRunning: (key, rustId) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.key === key ? { ...t, id: rustId, status: 'running' } : t,
      ),
    })),

  // Llegó 'terminal-exited' de una PTY (proceso terminó solo)
  markExited: (rustId) => {
    set((state) => ({
      terminals: state.terminals.map((t) => (t.id === rustId ? { ...t, status: 'exited' } : t)),
    }))
  },

  markExitedByKey: (key) =>
    set((state) => ({
      terminals: state.terminals.map((t) => (t.key === key ? { ...t, status: 'exited' } : t)),
    })),

  markError: (key, message) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.key === key ? { ...t, status: 'exited', error: message } : t,
      ),
    })),

  // list_shells: al abrir el menú + (no al arrancar); cache de sesión
  loadShells: async () => {
    if (get().shells || get().shellsLoading || !isTauri()) return
    set({ shellsLoading: true })
    try {
      const shells = await invoke<ShellInfo[]>('list_shells')
      set({ shells, shellsLoading: false })
    } catch {
      set({ shellsLoading: false })
    }
  },
}))

async function spawnFor(key: string): Promise<void> {
  const entry = useTerminalStore.getState().terminals.find((t) => t.key === key)
  if (!entry || entry.id) return
  if (!isTauri()) {
    useTerminalStore.getState().markExitedByKey(key)
    return
  }
  try {
    // 'auto' → shell_id null en Rust → detect_shell (comportamiento actual)
    const rustId = await invoke<string>('terminal_spawn', {
      shellId: entry.shellId === 'auto' ? null : entry.shellId,
    })
    useTerminalStore.getState().markRunning(key, rustId)
  } catch (e) {
    // Fallo al crear (sin workspace, shell desaparecida, límite del SO…):
    // el error se muestra EN el panel con el botón ↻ — nunca "conectando" infinito
    const message = e instanceof Error ? e.message : String(e)
    useTerminalStore.getState().markError(key, message)
  }
}
