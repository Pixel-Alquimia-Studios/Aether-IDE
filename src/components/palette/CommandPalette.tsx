import { useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { fuzzyScore } from '@/lib/commands/fuzzy'
import { COMMANDS, getFileCommands } from '@/lib/commands/registry'
import { useUiStore } from '@/stores/uiStore'
import type { Command } from '@/types/command'

const MAX_RESULTS = 50

// Se monta solo cuando paletteOpen (renderizado condicional en App),
// de modo que el estado se reinicializa en cada apertura sin effects.
export function CommandPalette() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const results = useMemo<Command[]>(() => {
    const all = [...COMMANDS, ...getFileCommands()]
    const q = query.trim()
    if (q === '') return all.slice(0, MAX_RESULTS)
    return all
      .map((cmd) => ({ cmd, score: fuzzyScore(q, `${cmd.category ?? ''} ${cmd.title}`) }))
      .filter((r): r is { cmd: Command; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.cmd)
  }, [query])

  const execute = (cmd: Command): void => {
    setPaletteOpen(false)
    cmd.run()
  }

  const handleKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setPaletteOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = results[activeIndex]
      if (cmd) execute(cmd)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-lg border border-aether-border bg-aether-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIndex(0)
          }}
          placeholder="Escribe un comando o busca un archivo…"
          className="w-full border-b border-aether-border bg-transparent px-4 py-3 text-[13px] text-aether-text outline-none placeholder:text-aether-text-dim"
        />
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-aether-text-dim">Sin resultados</p>
          )}
          {results.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => execute(cmd)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left text-[13px] ${
                i === activeIndex ? 'bg-aether-accent/20 text-white' : 'text-aether-text'
              }`}
            >
              <span className="truncate">
                {cmd.category && <span className="text-aether-text-dim">{cmd.category}: </span>}
                {cmd.title}
              </span>
              {cmd.keybinding && (
                <kbd className="shrink-0 rounded border border-aether-border px-1.5 py-0.5 font-mono text-[10px] text-aether-text-dim">
                  {cmd.keybinding}
                </kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
