import { useEditorStore } from '@/stores/editorStore'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { FileNode } from '@/types/workspace'

const STATUS_COLORS: Record<string, string> = {
  M: '#e2c08d',
  U: '#73c991',
  A: '#73c991',
  D: '#f14c4c',
  R: '#73c991',
}

export function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const expandedDirs = useWorkspaceStore((s) => s.expandedDirs)
  const toggleDir = useWorkspaceStore((s) => s.toggleDir)
  const openFile = useEditorStore((s) => s.openFile)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const gitStatus = useGitStore((s) => s.status)

  const isDir = node.kind === 'directory'
  const isExpanded = expandedDirs.has(node.path)
  const isActive = activeTabId === node.path
  // Badge de estado git (M/U/D/A) estilo VS Code
  const gitEntry = gitStatus.find((f) => f.path === node.path)
  const gitColor = gitEntry ? STATUS_COLORS[gitEntry.status] : undefined

  const handleClick = () => {
    if (isDir) {
      toggleDir(node.path)
    } else {
      openFile(node.path)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`flex w-full items-center gap-1.5 py-0.5 pr-2 text-left text-[13px] ${
          isActive ? 'bg-aether-accent/15 text-white' : 'text-aether-text hover:bg-white/5'
        }`}
      >
        <span className="w-4 shrink-0 text-center text-[10px] text-aether-text-dim">
          {isDir ? (isExpanded ? '▾' : '▸') : ''}
        </span>
        <span className="truncate">{node.name}</span>
        {gitColor && (
          <span className="ml-auto shrink-0 text-[10px] font-bold" style={{ color: gitColor }}>
            {gitEntry?.status}
          </span>
        )}
        {gitColor && (
          <span className="ml-auto shrink-0 text-[10px] font-bold" style={{ color: gitColor }}>
            {gitEntry?.status}
          </span>
        )}
      </button>
      {isDir &&
        isExpanded &&
        node.children?.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
    </>
  )
}
