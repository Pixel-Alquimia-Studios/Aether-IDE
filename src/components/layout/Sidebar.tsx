import { FileTreeNode } from '@/components/explorer/FileTreeNode'
import { ExtensionsView } from '@/components/extensions/ExtensionsView'
import { GitView } from '@/components/git/GitView'
import { useEditorStore } from '@/stores/editorStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const VIEW_TITLES = {
  explorer: 'Explorer',
  search: 'Search',
  ai: 'AI Chat',
  git: 'Source Control',
  extensions: 'Extensions',
  settings: 'Settings',
} as const

export function Sidebar() {
  const activeView = useUiStore((s) => s.activeView)
  const rootName = useWorkspaceStore((s) => s.rootName)
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const loading = useWorkspaceStore((s) => s.loading)
  const error = useWorkspaceStore((s) => s.error)
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace)
  const refreshTree = useWorkspaceStore((s) => s.refreshTree)
  const openUntitledFile = useEditorStore((s) => s.openUntitledFile)

  // Nota: los iconos de Material (Open VSX) se restauran del cache en el estado
  // inicial del store — aquí NO se auto-carga, para que "Desinstalar" no
  // reinstale solo (los iconos solo se descargan desde el botón Instalar).

  return (
    <div className="flex w-64 flex-col border-r border-aether-border bg-aether-surface">
      <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
        <span className="text-[10px] font-semibold tracking-[0.08em] text-aether-text-dim uppercase">
          {VIEW_TITLES[activeView]}
        </span>
        {activeView === 'explorer' && (
          <div className="flex items-center gap-0.5">
            <button
              title="New File"
              onClick={() => void openUntitledFile()}
              className="rounded px-1.5 py-0.5 text-[12px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
            >
              ＋
            </button>
            <button
              title="Refresh Explorer"
              onClick={() => void refreshTree()}
              className="rounded px-1.5 py-0.5 text-[12px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
            >
              ↻
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {activeView === 'explorer' && (
          <>
            <button
              onClick={() => void openWorkspace()}
              title="Abrir carpeta…"
              className="group flex w-full items-center gap-1 px-3 py-1 text-left"
            >
              <span className="text-[9px] leading-none text-aether-text-dim transition-transform">▾</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-aether-text group-hover:text-white">
                {rootName ?? 'Sin carpeta abierta'}
              </span>
              <span className="shrink-0 text-[12px] opacity-0 transition-opacity group-hover:opacity-100" title="Abrir carpeta…">
                📂
              </span>
            </button>
            {loading && <p className="px-3 py-1 text-[12px] text-aether-text-dim">Cargando…</p>}
            {error && <p className="px-3 py-1 text-[11px] text-red-400">{error}</p>}
            <div className="mt-0.5">
              {fileTree.map((node) => (
                <FileTreeNode key={node.path} node={node} depth={0} />
              ))}
            </div>
            {!loading && fileTree.length === 0 && !error && (
              <p className="px-3 py-2 text-[12px] text-aether-text-dim">
                Abre una carpeta con 📂 o Archivo → Open Folder...
              </p>
            )}
          </>
        )}
        {activeView === 'search' && (
          <p className="px-3 py-2 text-[12px] text-aether-text-dim">
            Búsqueda global (usa Ctrl+Shift+F en una próxima versión)
          </p>
        )}
        {activeView === 'ai' && (
          <p className="px-3 py-2 text-[12px] text-aether-text-dim">Usa el panel de chat 💬</p>
        )}
        {activeView === 'git' && <GitView />}
        {activeView === 'extensions' && <ExtensionsView />}
        {activeView === 'settings' && (
          <p className="px-3 py-2 text-[12px] text-aether-text-dim">Ajustes en la vista central</p>
        )}
      </div>
    </div>
  )
}
