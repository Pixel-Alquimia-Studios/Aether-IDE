import { useUiStore, type SidebarView } from '@/stores/uiStore'

const VIEWS: Array<{ id: SidebarView; icon: string; title: string; group: number }> = [
  { id: 'explorer', icon: '📁', title: 'Explorer', group: 1 },
  { id: 'search', icon: '🔍', title: 'Search', group: 1 },
  { id: 'git', icon: '🌿', title: 'Source Control', group: 1 },
  { id: 'ai', icon: '💬', title: 'AI Chat', group: 2 },
  { id: 'settings', icon: '⚙️', title: 'Settings', group: 3 },
]

export function ActivityBar() {
  const activeView = useUiStore((s) => s.activeView)
  const sidebarVisible = useUiStore((s) => s.sidebarVisible)
  const setActiveView = useUiStore((s) => s.setActiveView)

  return (
    <div className="flex w-12 flex-col items-center border-r border-aether-border bg-aether-surface py-2">
      {/* Logo */}
      <div
        title="Aether IDE"
        className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-aether-accent/15 text-lg text-aether-accent"
      >
        ✦
      </div>

      {VIEWS.map((view, i) => {
        const isActive = sidebarVisible && activeView === view.id
        const prevGroup = i > 0 ? VIEWS[i - 1].group : 0
        const showSeparator = prevGroup !== 0 && view.group !== prevGroup
        return (
          <div key={view.id} className="flex w-full flex-col items-center">
            {showSeparator && <div className="my-1.5 h-px w-6 bg-white/[0.07]" />}
            <button
              title={view.title}
              onClick={() => setActiveView(view.id)}
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-all ${
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-aether-text-dim hover:bg-white/[0.04] hover:text-aether-text'
              }`}
            >
              {/* Barra indicadora lateral (estilo VS Code) */}
              {isActive && (
                <span className="absolute left-[-8px] h-5 w-0.5 rounded-full bg-aether-accent" />
              )}
              {view.icon}
            </button>
          </div>
        )
      })}
    </div>
  )
}
