// Bloque colapsable de razonamiento (Chain of Thought) sobre la respuesta
export function ThinkingBlock({
  thinking,
  durationMs,
  active,
}: {
  thinking: string
  durationMs?: number
  active?: boolean
}) {
  const label = active
    ? '🧠 Procesando…'
    : `🧠 Razonamiento${durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : ''}`
  return (
    <details
      className="mb-2 rounded border border-aether-border bg-aether-bg/60 px-2 py-1"
      open={active || undefined}
    >
      <summary className="cursor-pointer select-none text-[11px] text-aether-text-dim">
        {label}
      </summary>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-aether-text-dim">
        {thinking}
      </pre>
    </details>
  )
}
