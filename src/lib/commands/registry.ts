import { useEditorStore } from '@/stores/editorStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { FileNode } from '@/types/workspace'

import type { Command } from '@/types/command'

// Comandos estáticos del shell. run() accede a las stores vía getState()
// para evitar closures obsoletas.
export const COMMANDS: Command[] = [
  {
    id: 'view.explorer',
    title: 'Mostrar Explorer',
    category: 'Ver',
    run: () => useUiStore.getState().showView('explorer'),
  },
  {
    id: 'view.search',
    title: 'Mostrar Búsqueda',
    category: 'Ver',
    run: () => useUiStore.getState().showView('search'),
  },
  {
    id: 'view.ai',
    title: 'Mostrar AI Chat',
    category: 'Ver',
    run: () => useUiStore.getState().showView('ai'),
  },
  {
    id: 'view.settings',
    title: 'Mostrar Ajustes',
    category: 'Ver',
    run: () => useUiStore.getState().showView('settings'),
  },
  {
    id: 'view.toggleSidebar',
    title: 'Alternar barra lateral',
    category: 'Ver',
    keybinding: 'Ctrl+B',
    run: () => useUiStore.getState().toggleSidebar(),
  },
  {
    id: 'view.togglePanel',
    title: 'Alternar panel inferior',
    category: 'Ver',
    keybinding: 'Ctrl+J',
    run: () => useUiStore.getState().togglePanel(),
  },
  {
    id: 'palette.open',
    title: 'Mostrar todos los comandos',
    category: 'Ver',
    keybinding: 'Ctrl+Shift+P',
    run: () => useUiStore.getState().setPaletteOpen(true),
  },
  {
    id: 'workspace.openFolder',
    title: 'Abrir carpeta…',
    category: 'Archivo',
    run: () => {
      void useWorkspaceStore.getState().openWorkspace()
    },
  },
  {
    id: 'tab.save',
    title: 'Guardar',
    category: 'Archivo',
    keybinding: 'Ctrl+S',
    run: () => {
      const { activeTabId, saveTab } = useEditorStore.getState()
      if (activeTabId) void saveTab(activeTabId)
    },
  },
  {
    id: 'tab.close',
    title: 'Cerrar pestaña',
    category: 'Archivo',
    keybinding: 'Ctrl+W',
    run: () => {
      const { activeTabId, closeTab } = useEditorStore.getState()
      if (activeTabId) closeTab(activeTabId)
    },
  },
  {
    id: 'tab.closeAll',
    title: 'Cerrar todas las pestañas',
    category: 'Archivo',
    run: () => useEditorStore.getState().closeAllTabs(),
  },
]

// Comandos dinámicos: quick open de archivos del workspace
export function getFileCommands(): Command[] {
  const { fileTree } = useWorkspaceStore.getState()
  const { openFile } = useEditorStore.getState()

  const files: Command[] = []
  const walk = (nodes: FileNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'file') {
        files.push({
          id: `file.open:${node.path}`,
          title: node.name,
          category: node.path,
          run: () => openFile(node.path),
        })
      }
      if (node.children) walk(node.children)
    }
  }
  walk(fileTree)
  return files
}
