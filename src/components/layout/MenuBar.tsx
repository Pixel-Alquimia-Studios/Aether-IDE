import { invoke, isTauri } from '@tauri-apps/api/core'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Update } from '@tauri-apps/plugin-updater'

import { pickOpenFile, pickSaveFile } from '@/lib/workspace/fs'
import { useEditorStore } from '@/stores/editorStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useT } from '@/lib/i18n'

interface MenuItem {
  id: string
  label: string
  shortcut?: string
  checked?: boolean
  separator?: boolean
  run?: () => void
}

export function MenuBar({
  availableUpdate,
  onOpenUpdate,
}: {
  availableUpdate: Update | null
  onOpenUpdate: () => void
}) {
  const openMenu = useUiStore((s) => s.openMenu)
  const setOpenMenu = useUiStore((s) => s.setOpenMenu)
  const autoSave = useUiStore((s) => s.autoSave)
  const toggleAutoSave = useUiStore((s) => s.toggleAutoSave)
  const showView = useUiStore((s) => s.showView)
  const panelVisible = useUiStore((s) => s.panelVisible)
  const togglePanel = useUiStore((s) => s.togglePanel)
  const sidebarVisible = useUiStore((s) => s.sidebarVisible)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const chatPanelVisible = useUiStore((s) => s.chatPanelVisible)
  const setChatPanelVisible = useUiStore((s) => s.setChatPanelVisible)
  const t = useT()

  const close = (): void => setOpenMenu(null)

  const runAndClose = (item: MenuItem): void => {
    close()
    item.run?.()
  }

  const fileMenu: MenuItem[] = [
    {
      id: 'new-file',
      label: t('menu.newFile'),
      run: () => void useEditorStore.getState().openUntitledFile(),
    },
    {
      id: 'open-file',
      label: t('menu.openFile'),
      run: () => {
        void (async () => {
          const path = await pickOpenFile()
          if (path) void useEditorStore.getState().openFile(path)
        })()
      },
    },
    {
      id: 'open-folder',
      label: t('menu.openFolder'),
      run: () => void useWorkspaceStore.getState().openWorkspace(),
    },
    { id: 'sep-1', label: '', separator: true },
    {
      id: 'save',
      label: t('menu.save'),
      shortcut: 'Ctrl+S',
      run: () => {
        // saveTab fuerza Save As para pestañas untitled (misma ruta que Ctrl+S)
        const { activeTabId, saveTab } = useEditorStore.getState()
        if (activeTabId) void saveTab(activeTabId)
      },
    },
    {
      id: 'save-as',
      label: t('menu.saveAs'),
      run: () => {
        void (async () => {
          const { activeTabId, saveTabAs, tabs } = useEditorStore.getState()
          if (!activeTabId) return
          const tab = tabs.find((tabItem) => tabItem.id === activeTabId)
          const newPath = await pickSaveFile(tab?.title)
          if (newPath) void saveTabAs(activeTabId, newPath)
        })()
      },
    },
    { id: 'sep-2', label: '', separator: true },
    {
      id: 'auto-save',
      label: t('menu.autoSave'),
      checked: autoSave,
      run: () => toggleAutoSave(),
    },
    { id: 'sep-3', label: '', separator: true },
    {
      id: 'preferences',
      label: t('menu.preferences'),
      run: () => showView('settings'),
    },
    {
      id: 'exit',
      label: t('menu.exit'),
      run: () => {
        if (isTauri()) void invoke('exit_app')
      },
    },
  ]

  const viewMenu: MenuItem[] = [
    {
      id: 'terminal',
      label: t('menu.terminal'),
      shortcut: 'Ctrl+J',
      checked: panelVisible,
      run: () => togglePanel(),
    },
    {
      id: 'sidebar',
      label: t('menu.sidebar'),
      shortcut: 'Ctrl+B',
      checked: sidebarVisible,
      run: () => toggleSidebar(),
    },
    {
      id: 'ai-chat',
      label: t('side.ai'),
      checked: chatPanelVisible,
      run: () => {
        const current = useUiStore.getState().chatPanelVisible
        useUiStore.setState({ chatPanelVisible: !current })
      },
    },
    {
      id: 'palette',
      label: t('menu.palette'),
      shortcut: 'Ctrl+Shift+P',
      run: () => setPaletteOpen(true),
    },
  ]

  const menus: Array<{ id: string; label: string; items: MenuItem[] }> = [
    { id: 'file', label: t('menu.file'), items: fileMenu },
    { id: 'view', label: t('menu.view'), items: viewMenu },
  ]

  const handleKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }

  return (
    <div className="relative z-40 flex h-8 shrink-0 items-center border-b border-aether-border bg-aether-surface px-1">
      {menus.map((menu) => (
        <div key={menu.id} className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
            className={`rounded px-3 py-1 text-[13px] transition-colors ${
              openMenu === menu.id
                ? 'bg-white/10 text-white'
                : 'text-aether-text-dim hover:bg-white/5 hover:text-aether-text'
            }`}
          >
            {menu.label}
          </button>

          {openMenu === menu.id && (
            <>
              {/* Backdrop invisible: cierra el menú al hacer clic fuera */}
              <div className="fixed inset-0 z-40" onClick={close} />
              <div
                onKeyDown={handleKeyDown}
                className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-aether-border bg-aether-surface py-1 shadow-2xl"
              >
                {menu.items.map((item) =>
                  item.separator ? (
                    <div key={item.id} className="my-1 border-t border-aether-border" />
                  ) : (
                    <button
                      key={item.id}
                      onClick={() => runAndClose(item)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] text-aether-text hover:bg-aether-accent/20"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-4 text-center text-[11px] text-aether-text-dim">
                          {item.checked ? '✓' : ''}
                        </span>
                        {item.label}
                      </span>
                      {item.shortcut && (
                        <kbd className="rounded border border-aether-border px-1.5 py-0.5 font-mono text-[10px] text-aether-text-dim">
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      ))}

      <span className="ml-2 truncate text-[12px] text-aether-text-dim">Aether IDE</span>
      <span className="flex-1" />
      {/* 💬 Chat de IA: panel derecho (toggle en la upbar) */}
      <button
        title={t('side.ai')}
        onClick={() => setChatPanelVisible(!chatPanelVisible)}
        className={`rounded px-2 py-1 text-[14px] transition-colors ${
          chatPanelVisible
            ? 'bg-aether-accent/15 text-aether-accent'
            : 'text-aether-text-dim hover:bg-white/10 hover:text-aether-text'
        }`}
      >
        💬
      </button>
      {/* Engranaje de Ajustes: esquina superior derecha */}
      <button
        title={t('menu.settings')}
        onClick={() => showView('settings')}
        className="rounded px-2 py-1 text-[14px] text-aether-text-dim transition-colors hover:bg-white/10 hover:text-aether-text"
      >
        ⚙️
      </button>
      <span className="pr-2 text-[10px] text-aether-text-dim">v0.2.0</span>
      {/* Fase G: botón de actualización disponible (esquina superior derecha) */}
      {availableUpdate && (
        <button
          title={`Actualizar a v${availableUpdate.version}`}
          onClick={onOpenUpdate}
          className="mr-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20"
        >
          ⬆ Actualizar
        </button>
      )}
    </div>
  )
}
