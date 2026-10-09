import { useEffect } from 'react'

import { useEditorStore } from '@/stores/editorStore'
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
        ui.togglePanel()
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
