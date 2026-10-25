import { useEffect } from 'react'

import { useEditorStore } from '@/stores/editorStore'
import { useTerminalStore } from '@/stores/terminalStore'
import { useUiStore } from '@/stores/uiStore'
import { getEditorInstance } from '@/lib/monaco/editorRef'

function isCtrl(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey
}

// Atajos globales del shell, en fase de captura para tener prioridad sobre Monaco.
// Nota: en navegador Chrome Ctrl+W no es interceptable (cierra la pestaña del
// navegador); funcionará de forma fiable en Tauri/WebView (Fase 2).
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const ui = useUiStore.getState()
      const key = e.key.toLowerCase()

      if (isCtrl(e) && e.shiftKey && key === 'p') {
        e.preventDefault()
        ui.setPaletteOpen(!ui.paletteOpen)
        return
      }
      if (isCtrl(e) && !e.shiftKey && key === 'b') {
        e.preventDefault()
        ui.toggleSidebar()
        return
      }
      if (isCtrl(e) && !e.shiftKey && key === 'j') {
        e.preventDefault()
        // Lote B: con CERO terminales, Ctrl+J crea una con el shell por
        // defecto y abre el panel (sin respawn en bucle: con terminales
        // existentes solo alterna visibilidad — B4 las mantiene vivas)
        const term = useTerminalStore.getState()
        if (term.terminals.length === 0) {
          term.openDefault()
          ui.showPanel()
        } else {
          ui.togglePanel()
        }
        return
      }
      if (isCtrl(e) && e.shiftKey && key === 'x') {
        // Vista de Extensiones (Marketplace de Open VSX)
        e.preventDefault()
        ui.showView('extensions')
        return
      }
      if (isCtrl(e) && !e.shiftKey && key === 'i') {
        // Edit with prompt: solo con selección activa en el editor
        const editor = getEditorInstance()
        const selection = editor?.getSelection()
        if (selection && !selection.isEmpty()) {
          e.preventDefault()
          ui.setInlineEditOpen(true)
        }
        return
      }
      if (isCtrl(e) && !e.shiftKey && key === 's') {
        const { activeTabId, saveTab } = useEditorStore.getState()
        if (activeTabId) {
          e.preventDefault()
          void saveTab(activeTabId)
        }
        return
      }
      if (isCtrl(e) && !e.shiftKey && key === 'w') {
        const { activeTabId, closeTab } = useEditorStore.getState()
        if (activeTabId) {
          e.preventDefault()
          closeTab(activeTabId)
        }
        return
      }
      if (e.key === 'Escape' && ui.paletteOpen) {
        ui.setPaletteOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
