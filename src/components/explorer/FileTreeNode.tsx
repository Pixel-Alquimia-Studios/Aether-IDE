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

// Iconos de archivo por extensión (glifo coloreado, estilo minimal)
const FILE_ICONS: Record<string, { glyph: string; color: string }> = {
  ts: { glyph: 'TS', color: '#4d9cd6' },
  tsx: { glyph: 'TSX', color: '#4d9cd6' },
  js: { glyph: 'JS', color: '#e8d44d' },
  jsx: { glyph: 'JSX', color: '#e8d44d' },
  json: { glyph: '{}', color: '#cbcb41' },
  css: { glyph: '#', color: '#519aba' },
  scss: { glyph: '#', color: '#c6538c' },
  less: { glyph: '#', color: '#519aba' },
  html: { glyph: '<>', color: '#e37e51' },
  md: { glyph: 'MD', color: '#519aba' },
  rs: { glyph: 'RS', color: '#dea584' },
  py: { glyph: 'PY', color: '#4b8bbe' },
  go: { glyph: 'GO', color: '#519aba' },
  toml: { glyph: 'T', color: '#9c4221' },
  yml: { glyph: 'Y', color: '#cbcb41' },
  yaml: { glyph: 'Y', color: '#cbcb41' },
  xml: { glyph: '<>', color: '#e37e51' },
  sql: { glyph: 'DB', color: '#dd8a53' },
  sh: { glyph: '$_', color: '#89d185' },
}

function FileIcon({ name }: { name: string }) {
  const ext = name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : ''
  const icon = FILE_ICONS[ext]
  if (!icon) {
    return (
      <span className="w-6 shrink-0 text-center font-mono text-[9px] text-aether-text-dim">
        □
      </span>
    )
  }
  return (
    <span
      className="w-6 shrink-0 text-center font-mono text-[9px] font-bold leading-[22px]"
      style={{ color: icon.color }}
    >
      {icon.glyph}
    </span>
  )
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

  const handleClick = (): void => {
    if (isDir) {
      toggleDir(node.path)
    } else {
      void openFile(node.path)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        title={node.path}
        className={`group flex h-[24px] w-full items-center gap-1 pr-2 text-left text-[13px] transition-colors ${
          isActive
            ? 'border-l-2 border-aether-accent bg-white/[0.06] text-white'
            : 'border-l-2 border-transparent text-aether-text hover:bg-white/[0.04]'
        }`}
      >
        <span className="w-3.5 shrink-0 text-center text-[9px] leading-none text-aether-text-dim transition-transform duration-100" style={{ transform: isDir && isExpanded ? 'rotate(90deg)' : 'none' }}>
          {isDir ? '▶' : ''}
        </span>
        {isDir ? (
          <span className="text-[11px] leading-none">
            {isExpanded ? '📂' : '📁'}
          </span>
        ) : (
          <FileIcon name={node.name} />
        )}
        <span className={`min-w-0 flex-1 truncate ${isDir ? 'font-medium' : ''}`}>{node.name}</span>
        {gitColor && (
          <span className="ml-1 shrink-0 text-[10px] font-bold" style={{ color: gitColor }}>
            {gitEntry?.status}
          </span>
        )}
      </button>
      {isDir && isExpanded && (
        <div className="relative">
          {/* Indent guide estilo VS Code */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/[0.06]"
            style={{ left: `${depth * 14 + 13}px` }}
          />
          {node.children?.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  )
}
