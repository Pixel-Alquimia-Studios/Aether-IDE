import { useCallback, useEffect } from 'react'

import { ActivityBar } from '@/components/layout/ActivityBar'
import { EditorView } from '@/components/editor/EditorView'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { Sidebar } from '@/components/layout/Sidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { ChatPanel } from '@/components/ai/ChatPanel'
import { SettingsView } from '@/components/settings/SettingsView'
import { TerminalView } from '@/components/terminal/TerminalView'
import { MenuBar } from '@/components/layout/MenuBar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useSession } from '@/hooks/useSession'
import { useWorkspaceEvents } from '@/hooks/useWorkspaceEvents'
import { useEditorStore } from '@/stores/editorStore'
import { useGitStore } from '@/stores/gitStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export default function App() {
  const sidebarVisible = useUiStore((s) => s.sidebarVisible)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const activeView = useUiStore((s) => s.activeView)
  const panelVisible = useUiStore((s) => s.panelVisible)
  const togglePanel = useUiStore((s) => s.togglePanel)
  useKeyboardShortcuts()
  useSession()

  const refreshTree = useWorkspaceStore((s) => s.refreshTree)
  const reloadExternally = useEditorStore((s) => s.reloadExternally)
  const gitRefresh = useGitStore((s) => s.refresh)
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  // Refresh del estado git al abrir/cambiar de workspace
  useEffect(() => {
    void gitRefresh()
  }, [rootPath, gitRefresh])

  const handleWorkspaceChanged = useCallback(
    (changedPaths: string[]) => {
      void refreshTree()
      for (const path of changedPaths) void reloadExternally(path)
      void gitRefresh()
    },
    [refreshTree, reloadExternally, gitRefresh],
  )
  useWorkspaceEvents(handleWorkspaceChanged)

  return (
    <div className="flex h-full flex-col">
      <MenuBar />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        {sidebarVisible && (activeView === 'ai' ? <ChatPanel /> : <Sidebar />)}
        {activeView === 'settings' ? <SettingsView /> : <EditorView />}
      </div>
      {/* Panel inferior: terminal integrada (Ctrl+J) */}
      {panelVisible && (
        <div className="flex h-56 shrink-0 flex-col border-t border-aether-border bg-aether-bg">
          <div className="flex items-center justify-between border-b border-aether-border bg-aether-surface px-3 py-1 text-[11px] font-semibold tracking-wider text-aether-text-dim uppercase">
            <span>Terminal</span>
            <button
              title="Cerrar panel"
              onClick={() => togglePanel()}
              className="rounded px-1.5 text-aether-text-dim hover:bg-white/10"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <TerminalView />
          </div>
        </div>
      )}
      <StatusBar />
      {paletteOpen && <CommandPalette />}
    </div>
  )
}
