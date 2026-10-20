import { useCallback, useEffect, useState } from 'react'

import { check, type Update } from '@tauri-apps/plugin-updater'

import { ActivityBar } from '@/components/layout/ActivityBar'
import { EditorView } from '@/components/editor/EditorView'
import { CommandPalette } from '@/components/palette/CommandPalette'
import { Sidebar } from '@/components/layout/Sidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { ChatPanel } from '@/components/ai/ChatPanel'
import { SettingsView } from '@/components/settings/SettingsView'
import { TerminalView } from '@/components/terminal/TerminalView'
import { MenuBar } from '@/components/layout/MenuBar'
import { termsAccepted } from '@/lib/terms'
import { TermsDialog } from '@/components/settings/TermsDialog'
import { UpdateOverlay } from '@/components/updater/UpdateOverlay'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useSession } from '@/hooks/useSession'
import { useWorkspaceEvents } from '@/hooks/useWorkspaceEvents'
import { useEditorStore } from '@/stores/editorStore'
import { useAgentStore } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'
import { useGitStore } from '@/stores/gitStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export default function App() {
  const sidebarVisible = useUiStore((s) => s.sidebarVisible)
  const paletteOpen = useUiStore((s) => s.paletteOpen)
  const activeView = useUiStore((s) => s.activeView)
  const panelVisible = useUiStore((s) => s.panelVisible)
  const togglePanel = useUiStore((s) => s.togglePanel)
  const chatPanelVisible = useUiStore((s) => s.chatPanelVisible)
  const termsDialogOpen = useUiStore((s) => s.termsDialogOpen)
  const [termsVisible, setTermsVisible] = useState(() => !termsAccepted())
  // Update disponible (persistent mientras la app viva) vs overlay abierto:
  // "Más tarde" cierra el overlay pero el botón ⬆ debe seguir visible
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null)
  const [updateOverlayOpen, setUpdateOverlayOpen] = useState(false)
  useKeyboardShortcuts()
  useSession()

  const refreshTree = useWorkspaceStore((s) => s.refreshTree)
  const reloadExternally = useEditorStore((s) => s.reloadExternally)
  const gitRefresh = useGitStore((s) => s.refresh)
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  // Refresh del estado git y del HISTORIAL DE CHATS al abrir/cambiar de
  // workspace (los chats son por carpeta). Si el chat activo pertenece a otra
  // carpeta, se guarda y se limpia el panel.
  useEffect(() => {
    void gitRefresh()
    const chat = useChatStore.getState()
    if (chat.chatWorkspaceRoot && rootPath && chat.chatWorkspaceRoot !== rootPath) {
      // B2 (v0.3.1): corta TODO el trabajo en vuelo ligado al workspace
      // anterior — el stream "resucitado" y el agente ya no pueden seguir
      // escribiendo en la carpeta vieja. stopAgent también auto-deniega
      // cualquier confirmación pendiente (C1).
      chat.cancelStream()
      useAgentStore.getState().stopAgent()
      void chat
        .persistActive()
        .then(() => {
          useChatStore.getState().clearActiveChat()
          return useChatStore.getState().refreshHistory()
        })
        .catch(() => undefined)
    } else {
      void useChatStore.getState().refreshHistory()
    }
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

  // Fase G: comprobar actualizaciones al abrir la app
  useEffect(() => {
    if (!termsAccepted()) return
    void check()
      .then((update) => {
        if (update) {
          setAvailableUpdate(update)
          setUpdateOverlayOpen(true)
        }
      })
      .catch(() => undefined)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <MenuBar availableUpdate={availableUpdate} onOpenUpdate={() => setUpdateOverlayOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        {sidebarVisible && <Sidebar />}
        {activeView === 'settings' ? <SettingsView /> : <EditorView />}
        {/* Chat de IA: PANEL DERECHO (dock) — visible en cualquier vista central */}
        {chatPanelVisible && <ChatPanel />}
      </div>
      {/* Fase F: Términos y Privacidad al primer arranque (o reabrible desde Ajustes) */}
      {(termsVisible || termsDialogOpen) && (
        <TermsDialog
          onAccept={() => {
            setTermsVisible(false)
            useUiStore.getState().setTermsDialogOpen(false)
          }}
        />
      )}
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
      {/* Fase G: overlay de actualización con progreso */}
      {availableUpdate && updateOverlayOpen && (
        <UpdateOverlay update={availableUpdate} onClose={() => setUpdateOverlayOpen(false)} />
      )}
    </div>
  )
}
