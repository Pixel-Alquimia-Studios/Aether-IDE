import { useUiStore, type SidebarView } from '@/stores/uiStore'
import { useT } from '@/lib/i18n'

const VIEWS: Array<{ id: SidebarView; icon: string; group: number }> = [
  { id: 'explorer', icon: '📁', group: 1 },
  { id: 'search', icon: '🔍', group: 1 },
  { id: 'git', icon: '🌿', group: 1 },
  { id: 'extensions', icon: '🧩', group: 1 },
]

const SIDEBAR_TITLE_KEYS = {
  explorer: 'side.explorer',
  search: 'side.search',
  git: 'side.git',
  extensions: 'side.extensions',
} as const

export function ActivityBar() {
  const activeView = useUiStore((s) => s.activeView)
  const sidebarVisible = useUiStore((s) => s.sidebarVisible)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const t = useT()

  return (
    <div className="flex w-12 flex-col items-center border-r border-aether-border bg-aether-surface py-2">
      <div
        title="Aether IDE"
        className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-aether-accent/25 to-aether-accent/5 text-lg text-aether-accent shadow-[0_0_12px_rgba(167,139,250,0.25)]"
      >
        ✦
      </div>

      {VIEWS.map((view, i) => {
        const prevGroup = i > 0 ? VIEWS[i - 1].group : 0
        const showSeparator = prevGroup !== 0 && view.group !== prevGroup
        return (
          <div key={view.id} className="flex w-full flex-col items-center">
            {showSeparator && <div className="my-1.5 h-px w-6 bg-white/[0.07]" />}
            <button
              title={t(SIDEBAR_TITLE_KEYS[view.id as keyof typeof SIDEBAR_TITLE_KEYS])}
              onClick={() => setActiveView(view.id)}
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-all ${
                sidebarVisible && activeView === view.id
                  ? 'bg-white/[0.08] text-white'
                  : 'text-aether-text-dim hover:bg-white/[0.04] hover:text-aether-text'
              }`}
            >
              {sidebarVisible && activeView === view.id && (
                <span className="absolute left-[-8px] h-5 w-0.5 rounded-full bg-aether-accent shadow-[0_0_8px_2px_rgba(167,139,250,0.5)]" />
              )}
              {view.icon}
            </button>
          </div>
        )
      })}
    </div>
  )
}
