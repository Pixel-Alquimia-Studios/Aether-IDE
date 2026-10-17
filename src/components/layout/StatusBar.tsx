import { useEditorStore } from '@/stores/editorStore'
import { useGitStore } from '@/stores/gitStore'

export function StatusBar() {
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const dirty = useGitStore((s) => s.status.length)

  return (
    <div className="flex h-6 items-center justify-between border-t border-aether-border bg-aether-surface px-3 text-[11px] text-aether-text-dim">
      <div className="flex min-w-0 items-center gap-3">
        {dirty > 0 && (
          <span title="Cambios sin confirmar" className="flex shrink-0 items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {dirty} cambio{dirty !== 1 ? 's' : ''}
          </span>
        )}
        <span className="truncate">{activeTabId ?? 'Ningún archivo abierto'}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-aether-accent/70">✦ Aether</span>
        {activeTab && <span className="uppercase">{activeTab.language}</span>}
      </div>
    </div>
  )
}
