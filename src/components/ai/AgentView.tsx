import { useEffect, useRef } from 'react'

import { MarkdownRenderer } from '@/components/ai/MarkdownRenderer'
import { resolveApproval } from '@/lib/agent/tools'
import { rollbackTurns } from '@/lib/agent/rollback'
import { useAgentStore } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'

// Agent Time Travel: eliminar/editar una tarea revierte los cambios de
// archivos que el agente aplicó desde ese punto (vía checkpoints).
function deleteTaskWithRollback(turnId: string): void {
  const steps = useAgentStore.getState().steps
  const stepIdx = steps.findIndex((s) => s.turnId === turnId)

  const ids = new Set<string>([turnId])
  if (stepIdx >= 0) {
    for (const step of steps.slice(stepIdx)) {
      if (step.turnId) ids.add(step.turnId)
    }
  }
  const messages = useChatStore.getState().messages
  const msgIdx = messages.findIndex((m) => m.role === 'user' && m.turnId === turnId)
  if (msgIdx >= 0) {
    for (const message of messages.slice(msgIdx)) {
      if (message.role === 'user' && message.turnId) ids.add(message.turnId)
    }
  }
  void rollbackTurns(ids)
}

export function AgentView({ onEditTask }: { onEditTask: (text: string) => void }) {
  const steps = useAgentStore((s) => s.steps)
  const running = useAgentStore((s) => s.running)
  const pendingCommand = useAgentStore((s) => s.pendingCommand)
  const error = useAgentStore((s) => s.error)
  const reset = useAgentStore((s) => s.reset)

  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps, pendingCommand, error])

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3">
      {steps.length === 0 && !running && (
        <div className="flex h-full items-center justify-center text-aether-text-dim">
          <p className="max-w-[90%] text-center text-[13px]">
            Describe una tarea para el agente (ej: “Busca dónde está definido el tipo User y
            agrégale el campo email”). Puede leer, buscar, escribir archivos y ejecutar comandos
            con tu confirmación.
          </p>
        </div>
      )}
      {steps.map((step, i) => (
        <div
          key={i}
          className={
            step.type === 'tool'
              ? ''
              : step.role === 'user'
                ? 'group relative flex justify-end'
                : 'flex justify-start'
          }
        >
          {step.type === 'tool' ? (
            <div className="w-full rounded border border-aether-border bg-aether-bg px-2.5 py-1.5 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="font-mono text-aether-text-dim">⚙ {step.name}</span>
                {step.status === 'running' ? (
                  <span className="text-aether-accent">ejecutando…</span>
                ) : (
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer text-[11px] text-aether-text-dim">
                      ver resultado
                    </summary>
                  </details>
                )}
              </div>
              {step.status === 'done' && step.output && (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-aether-text-dim">
                  {step.output}
                </pre>
              )}
            </div>
          ) : (
            <>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] ${
                  step.role === 'user'
                    ? 'bg-aether-accent/25 text-white'
                    : 'border border-aether-border bg-aether-surface text-aether-text'
                }`}
              >
                {step.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{step.content}</p>
                ) : (
                  <MarkdownRenderer content={step.content ?? ''} />
                )}
              </div>
              {step.role === 'user' && step.turnId && !running && (
                <div className="absolute top-1 right-1 hidden items-center gap-0.5 rounded bg-aether-surface/90 p-0.5 shadow group-hover:flex">
                  <button
                    title="Editar tarea (revierte los cambios posteriores)"
                    onClick={() => {
                      onEditTask(step.content ?? '')
                      deleteTaskWithRollback(step.turnId as string)
                    }}
                    className="rounded px-1 text-[11px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
                  >
                    ✏️
                  </button>
                  <button
                    title="Eliminar tarea (revierte los cambios del agente desde aquí)"
                    onClick={() => deleteTaskWithRollback(step.turnId as string)}
                    className="rounded px-1 text-[11px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
                  >
                    🗑
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* Confirmación previa de acciones destructivas (write_file / execute_command) */}
      {pendingCommand && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-[13px] font-medium text-amber-300">El agente solicita tu permiso:</p>
          <p className="mt-1 break-all font-mono text-[12px] text-aether-text">{pendingCommand}</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => resolveApproval(true)}
              className="rounded bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-500"
            >
              Aprobar
            </button>
            <button
              onClick={() => resolveApproval(false)}
              className="rounded border border-aether-border px-3 py-1.5 text-[12px] text-aether-text-dim hover:bg-white/5"
            >
              Denegar
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-center text-[11px] text-red-400">{error}</p>}
      {steps.length > 0 && !running && !pendingCommand && (
        <div className="flex justify-center">
          <button
            onClick={reset}
            className="rounded border border-aether-border px-3 py-1 text-[11px] text-aether-text-dim hover:bg-white/5"
          >
            Nueva tarea
          </button>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
