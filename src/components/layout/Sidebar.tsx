import { FileTreeNode } from '@/components/explorer/FileTreeNode'
import { GitView } from '@/components/git/GitView'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const VIEW_TITLES = {
  explorer: 'Explorer',
  search: 'Search',
  ai: 'AI Chat',
  git: 'Source Control',
  settings: 'Settings',
} as const

export function Sidebar() {
  const activeView = useUiStore((s) => s.activeView)
  const rootName = useWorkspaceStore((s) => s.rootName)
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const loading = useWorkspaceStore((s) => s.loading)
  const error = useWorkspaceStore((s) => s.error)
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace)

  return (
    <div className="flex w-64 flex-col border-r border-aether-border bg-aether-surface">
      <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-aether-text-dim uppercase">
        {VIEW_TITLES[activeView]}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeView === 'explorer' && (
          <>
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[13px] font-semibold text-aether-text">
                {rootName ?? 'Sin carpeta abierta'}
              </span>
              <button
                title="Abrir carpeta…"
                onClick={() => void openWorkspace()}
                className="rounded px-1.5 text-[13px] text-aether-text-dim hover:bg-white/10"
              >
                📂
              </button>
            </div>
            {loading && <p className="px-3 py-1 text-aether-text-dim">Cargando…</p>}
            {error && <p className="px-3 py-1 text-xs text-red-400">{error}</p>}
            {fileTree.map((node) => (
              <FileTreeNode key={node.path} node={node} depth={0} />
            ))}
          </>
        )}
        {activeView === 'search' && (
          <p className="px-3 py-2 text-aether-text-dim">Búsqueda global (próximamente)</p>
        )}
        {activeView === 'ai' && (
          <p className="px-3 py-2 text-aether-text-dim">Usa el panel de chat 💬</p>
        )}
        {activeView === 'git' && <GitView />}
        {activeView === 'settings' && (
          <p className="px-3 py-2 text-aether-text-dim">Ajustes en la vista central</p>
        )}
      </div>
    </div>
  )
}
