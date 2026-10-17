import type { AgentFinding } from '@/types/agent'

const SEVERITY_STYLES: Record<
  AgentFinding['severity'],
  { badge: string; border: string; glow: string; label: string }
> = {
  critical: {
    badge: 'bg-red-500/20 text-red-400 border-red-500/40',
    border: 'border-l-red-500',
    glow: 'shadow-[inset_3px_0_6px_-2px_rgba(239,68,68,0.4)]',
    label: 'CRITICAL',
  },
  high: {
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    border: 'border-l-orange-500',
    glow: 'shadow-[inset_3px_0_6px_-2px_rgba(249,115,22,0.4)]',
    label: 'HIGH',
  },
  medium: {
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    border: 'border-l-yellow-500',
    glow: 'shadow-[inset_3px_0_6px_-2px_rgba(234,179,8,0.4)]',
    label: 'MEDIUM',
  },
  low: {
    badge: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
    border: 'border-l-sky-500',
    glow: 'shadow-[inset_3px_0_6px_-2px_rgba(14,165,233,0.4)]',
    label: 'LOW',
  },
}

const SEVERITY_ORDER: Array<AgentFinding['severity']> = ['critical', 'high', 'medium', 'low']

export function FindingsReport({
  findings,
  botName,
}: {
  findings: AgentFinding[]
  botName?: string
}) {
  const counts = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: findings.filter((f) => f.severity === severity).length,
  })).filter((c) => c.count > 0)

  // Ordenar tarjetas por severidad (critical primero)
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  )

  return (
    <div className="w-full rounded-lg border border-aether-border/60 bg-aether-bg/80 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-aether-text-dim uppercase">
          {botName ? `${botName} · reporte de hallazgos` : 'Reporte de hallazgos'}
        </span>
        {counts.map((c) => (
          <span
            key={c.severity}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${SEVERITY_STYLES[c.severity].badge}`}
          >
            {c.count} {SEVERITY_STYLES[c.severity].label}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.map((finding, i) => {
          const style = SEVERITY_STYLES[finding.severity]
          return (
            <div
              key={i}
              className={`rounded border border-aether-border/60 border-l-4 bg-aether-surface px-3 py-2 transition-colors hover:border-aether-border ${style.border} ${style.glow}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 text-[13px] font-medium text-aether-text">
                  {finding.title}
                </span>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${style.badge}`}>
                  {style.label}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-aether-text-dim">
                {finding.detail}
              </p>
              {(finding.file || finding.line != null) && (
                <p className="mt-1 truncate font-mono text-[10px] text-aether-text-dim">
                  📄 {finding.file ?? '?'}
                  {finding.line != null ? `:${finding.line}` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
