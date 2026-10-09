import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect } from 'react'

// Escucha 'workspace-changed' (Rust/notify con debounce) y notifica al shell
// para refrescar el explorer y recargar tabs modificadas externamente.
export function useWorkspaceEvents(onChange: (changedPaths: string[]) => void): void {
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false

    void listen<string[]>('workspace-changed', (event) => onChange(event.payload ?? [])).then(
      (fn) => {
        if (cancelled) fn()
        else unlisten = fn
      },
    )

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [onChange])
}
