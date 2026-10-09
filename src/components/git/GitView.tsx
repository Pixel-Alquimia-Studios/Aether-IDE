import { useState } from 'react'

import { useEditorStore } from '@/stores/editorStore'
import { useGitStore } from '@/stores/gitStore'

const PAGE_SIZE = 50

const STATUS_COLORS: Record<string, string> = {
  M: '#e2c08d',
  U: '#73c991',
  A: '#73c991',
  D: '#f14c4c',
  R: '#73c991',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="shrink-0 rounded px-1 text-[10px] font-bold"
      style={{ color: STATUS_COLORS[status] ?? '#8b8d98' }}
    >
      {status}
    </span>
  )
}

function FileRow({
  path,
  status,
  staged,
}: {
  path: string
  status: string
  staged: boolean
}) {
  const openFile = useEditorStore((s) => s.openFile)
  const stage = useGitStore((s) => s.stage)
  const unstage = useGitStore((s) => s.unstage)
  const name = path.split(/[\\/]/).pop() ?? path
  const dir = path.split(/[\\/]/).slice(0, -1).join('/')
  return (
    <div className="group flex w-full items-center gap-1.5 py-0.5 pr-2 text-[13px] text-aether-text hover:bg-white/5">
      <button onClick={() => void openFile(path)} title={path} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <StatusBadge status={status} />
        <span className="min-w-0 flex-1 truncate">
          {name}
          {!staged && dir && <span className="ml-1 text-[10px] text-aether-text-dim">{dir}</span>}
        </span>
      </button>
      <button
        title={staged ? 'Unstage (-)' : 'Stage (+)'}
        onClick={() => void (staged ? unstage(path) : stage(path))}
        className="shrink-0 rounded px-1 text-aether-text-dim opacity-0 hover:bg-white/10 group-hover:opacity-100"
      >
        {staged ? '−' : '＋'}
      </button>
    </div>
  )
}

function FileList({ files, staged }: { files: Array<{ path: string; status: string }>; staged: boolean }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Paginación: evita congelar la UI con repos enormes
  const visible = files.slice(0, visibleCount)
  const remaining = files.length - visible.length

  return (
    <>
      {visible.map((f) => (
        <FileRow
          key={`${staged ? 's' : 'u'}-${f.path}-${f.status}`}
          path={f.path}
          status={f.status}
          staged={staged}
        />
      ))}
      {remaining > 0 && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full px-3 py-1 text-left text-[11px] text-aether-text-dim hover:bg-white/5"
        >
          Mostrar más ({remaining} restantes)
        </button>
      )}
    </>
  )
}

export function GitView() {
  const status = useGitStore((s) => s.status)
  const loading = useGitStore((s) => s.loading)
  const error = useGitStore((s) => s.error)
  const lastAction = useGitStore((s) => s.lastAction)
  const acting = useGitStore((s) => s.acting)
  const refresh = useGitStore((s) => s.refresh)
  const stageAll = useGitStore((s) => s.stageAll)
  const unstageAll = useGitStore((s) => s.unstageAll)
  const commit = useGitStore((s) => s.commit)
  const push = useGitStore((s) => s.push)
  const pull = useGitStore((s) => s.pull)

  const [commitMessage, setCommitMessage] = useState('')

  const staged = status.filter((f) => f.staged)
  const unstaged = status.filter((f) => !f.staged)
  const disabled = acting || loading

  const doCommit = (): void => {
    if (!commitMessage.trim()) return
    setCommitMessage('')
    void commit(commitMessage)
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Acciones globales */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button title="Stage all (＋)" onClick={() => void stageAll()} disabled={disabled} className="rounded px-2 py-1 text-[13px] text-aether-text hover:bg-white/10 disabled:opacity-40">＋</button>
        <button title="Unstage all (−)" onClick={() => void unstageAll()} disabled={disabled} className="rounded px-2 py-1 text-[13px] text-aether-text hover:bg-white/10 disabled:opacity-40">−</button>
        <button title="Pull (⬇)" onClick={() => void pull()} disabled={disabled} className="rounded px-2 py-1 text-[13px] text-aether-text hover:bg-white/10 disabled:opacity-40">⬇</button>
        <button title="Push (⬆)" onClick={() => void push()} disabled={disabled} className="rounded px-2 py-1 text-[13px] text-aether-text hover:bg-white/10 disabled:opacity-40">⬆</button>
        <button title="Refrescar" onClick={() => void refresh()} disabled={disabled} className="rounded px-2 py-1 text-[13px] text-aether-text-dim hover:bg-white/10 disabled:opacity-40">↻</button>
      </div>

      {/* Caja de commit */}
      <div className="border-y border-aether-border p-2">
        <input
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') doCommit()
          }}
          placeholder="Mensaje de commit…"
          disabled={disabled}
          className="w-full rounded border border-aether-border bg-aether-bg px-2 py-1.5 text-[12px] text-aether-text outline-none placeholder:text-aether-text-dim focus:border-aether-accent disabled:opacity-50"
        />
        <button
          onClick={doCommit}
          disabled={disabled || !commitMessage.trim() || staged.length === 0}
          className="mt-1.5 w-full rounded bg-aether-accent px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
        >
          ✓ Commit ({staged.length} preparados)
        </button>
        {lastAction && <p className="mt-1 text-[10px] text-emerald-400">{lastAction}</p>}
        {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
      </div>

      {/* Lista de cambios (paginada) */}
      <div className="flex-1">
        {loading && <p className="px-3 py-1 text-[13px] text-aether-text-dim">Cargando…</p>}
        {!loading && status.length === 0 && !error && (
          <p className="px-3 py-1 text-[13px] text-aether-text-dim">Sin cambios pendientes</p>
        )}

        {staged.length > 0 && (
          <>
            <div className="mt-1 px-3 py-1 text-[11px] font-semibold tracking-wider text-aether-text-dim uppercase">
              Cambios preparados (staged)
            </div>
            <FileList files={staged} staged />
          </>
        )}
        {unstaged.length > 0 && (
          <>
            <div className="mt-1 px-3 py-1 text-[11px] font-semibold tracking-wider text-aether-text-dim uppercase">
              Cambios (unstaged)
            </div>
            <FileList files={unstaged} staged={false} />
          </>
        )}
      </div>
    </div>
  )
}
