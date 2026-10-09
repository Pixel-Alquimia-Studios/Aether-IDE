import { useUiStore, type SidebarView } from '@/stores/uiStore'

const VIEWS: Array<{ id: SidebarView; icon: string; title: string }> = [
  { id: 'explorer', icon: '📁', title: 'Explorer' },
  { id: 'search', icon: '🔍', title: 'Search' },
  { id: 'ai', icon: '💬', title: 'AI Chat' },
  { id: 'git', icon: '🌿', title: 'Source Control' },
  { id: 'settings', icon: '⚙️', title: 'Settings' },
]

export function ActivityBar() {
  const activeView = useUiStore((s) => s.activeView)
  const sidebarVisible = useUiStore((s) => s.sidebarVisible)
  const setActiveView = useUiStore((s) => s.setActiveView)

  return (
    <div className="flex w-12 flex-col items-center gap-1 border-r border-aether-border bg-aether-surface py-2">
      {VIEWS.map((view) => {
        const isActive = sidebarVisible && activeView === view.id
        return (
          <button
            key={view.id}
            title={view.title}
            onClick={() => setActiveView(view.id)}
            className={`flex h-10 w-10 items-center justify-center rounded text-lg transition-colors ${
              isActive
                ? 'bg-aether-accent/15 text-white'
                : 'text-aether-text-dim hover:bg-white/5 hover:text-aether-text'
            }`}
          >
            {view.icon}
          </button>
        )
      })}
    </div>
  )
}
