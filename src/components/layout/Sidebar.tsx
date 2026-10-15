import { FileTreeNode } from '@/components/explorer/FileTreeNode'
import { ExtensionsView } from '@/components/extensions/ExtensionsView'
import { GitView } from '@/components/git/GitView'
import { useT } from '@/lib/i18n'
import { useEditorStore } from '@/stores/editorStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const SIDEBAR_KEY_BY_VIEW = {
  explorer: 'side.explorer',
  search: 'side.search',
  ai: 'side.ai',
  git: 'side.git',
  extensions: 'side.extensions',
  settings: 'side.settings',
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
  const t = useT()

  const titleKey = SIDEBAR_KEY_BY_VIEW[activeView as keyof typeof SIDEBAR_KEY_BY_VIEW] ?? 'side.explorer'

  return (
    <div className="flex w-64 flex-col border-r border-aether-border bg-aether-surface">
      <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
        <span className="text-[10px] font-semibold tracking-[0.08em] text-aether-text-dim uppercase">
          {t(titleKey as never)}
        </span>
        {activeView === 'explorer' && (
          <div className="flex items-center gap-0.5">
            <button
              title={t('side.newFile')}
              onClick={() => void openUntitledFile()}
              className="rounded px-1.5 py-0.5 text-[12px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
            >
              ＋
            </button>
            <button
              title={t('side.refresh')}
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
              title={t('side.openFolder')}
              className="group flex w-full items-center gap-1 px-3 py-1 text-left"
            >
              <span className="text-[9px] leading-none text-aether-text-dim transition-transform">▾</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-aether-text group-hover:text-white">
                {rootName ?? t('side.noFolder')}
              </span>
              <span className="shrink-0 text-[12px] opacity-0 transition-opacity group-hover:opacity-100" title={t('side.openFolder')}>
                📂
              </span>
            </button>
            {loading && <p className="px-3 py-1 text-[12px] text-aether-text-dim">{t('side.loading')}</p>}
            {error && <p className="px-3 py-1 text-[11px] text-red-400">{error}</p>}
            <div className="mt-0.5">
              {fileTree.map((node) => (
                <FileTreeNode key={node.path} node={node} depth={0} />
              ))}
            </div>
            {!loading && fileTree.length === 0 && !error && (
              <p className="px-3 py-2 text-[12px] text-aether-text-dim">{t('side.openFolderHint')}</p>
            )}
          </>
        )}
        {activeView === 'search' && (
          <p className="px-3 py-2 text-[12px] text-aether-text-dim">
            {t('side.search')} (próximamente)
          </p>
        )}
        {activeView === 'git' && <GitView />}
        {activeView === 'extensions' && <ExtensionsView />}
      </div>
    </div>
  )
}
