import { useEditorStore } from '@/stores/editorStore'

export function StatusBar() {
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId))

  return (
    <div className="flex h-6 items-center justify-between border-t border-aether-border bg-aether-surface px-3 text-xs text-aether-text-dim">
      <span>{activeTabId ?? 'Ningún archivo abierto'}</span>
      <span>{activeTab ? activeTab.language : ''}</span>
    </div>
  )
}
