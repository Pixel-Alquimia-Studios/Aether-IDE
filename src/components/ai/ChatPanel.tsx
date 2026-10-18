import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { FindingsReport } from '@/components/ai/FindingsReport'
import { MarkdownRenderer } from '@/components/ai/MarkdownRenderer'
import { ThinkingBlock } from '@/components/ai/ThinkingBlock'
import { collectTurnIdsFrom, rollbackTurns } from '@/lib/agent/rollback'
import { CHAT_COMMANDS } from '@/lib/agent/commands'
import type { ChatCommand } from '@/lib/agent/commands'
import { detectSubagent, SUBAGENTS } from '@/lib/agent/subagents'
import { fuzzyScore } from '@/lib/commands/fuzzy'
import { useT } from '@/lib/i18n'
import { useAgentStore } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'
import { useEditorStore } from '@/stores/editorStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ChatMessage, MentionContext, ThinkingLevel } from '@/types/chat'
import type { AgentStep } from '@/types/agent'
import type { FileNode } from '@/types/workspace'

const MODALITY_LABELS: Record<string, string> = {
  text: 'Texto',
  image: 'Imagen',
  audio: 'Audio',
  video: 'Vídeo',
}

const MAX_MENTION_RESULTS = 30

function formatTokens(n: number | null): string {
  if (n == null) return ''
  if (n >= 1_000_000) return `${n / 1_000_000}M`
  return `${Math.round(n / 1000)}k`
}

function formatElapsed(ms: number): string {
  if (ms < 60_000) {
    const secs = ms / 1000
    return secs >= 100 ? `${Math.round(secs)}s` : `${secs.toFixed(1).padStart(4, '0')}s`
  }
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

const THINKING_OPTIONS: Array<{ value: ThinkingLevel; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
]

/** Item del timeline unificado (mensajes de Plan + pasos del Agente) */
type TimelineItem =
  | { kind: 'chat'; ts: number; index: number; msg: ChatMessage }
  | { kind: 'agent'; ts: number; step: AgentStep }

/** Identidad visual por subagente (fase 2: avatars con color propio) */
const BOT_THEME: Record<string, { ring: string; avatarBg: string; glow: string }> = {
  BugBot: {
    ring: 'border-rose-500/30',
    avatarBg: 'bg-rose-500/15 shadow-[0_0_10px_rgba(244,63,94,0.25)]',
    glow: 'bg-rose-500/[0.03]',
  },
  SecBot: {
    ring: 'border-emerald-500/30',
    avatarBg: 'bg-emerald-500/15 shadow-[0_0_10px_rgba(16,185,129,0.25)]',
    glow: 'bg-emerald-500/[0.03]',
  },
  AuditBot: {
    ring: 'border-amber-500/30',
    avatarBg: 'bg-amber-500/15 shadow-[0_0_10px_rgba(245,158,11,0.25)]',
    glow: 'bg-amber-500/[0.03]',
  },
}

export function ChatPanel() {
  const providers = useSettingsStore((s) => s.providers)
  const selectedProviderId = useSettingsStore((s) => s.selectedProviderId)
  const modelByProvider = useSettingsStore((s) => s.modelByProvider)
  const fetchedModels = useSettingsStore((s) => s.fetchedModels)
  const selectProvider = useSettingsStore((s) => s.selectProvider)
  const setModel = useSettingsStore((s) => s.setModel)
  const loadProviders = useSettingsStore((s) => s.loadProviders)

  const messages = useChatStore((s) => s.messages)
  const history = useChatStore((s) => s.history)
  const streaming = useChatStore((s) => s.streaming)
  const statusText = useChatStore((s) => s.statusText)
  const error = useChatStore((s) => s.error)
  const chatId = useChatStore((s) => s.chatId)
  const chatTitle = useChatStore((s) => s.chatTitle)
  const thinkingLevel = useChatStore((s) => s.thinkingLevel)
  const setThinkingLevel = useChatStore((s) => s.setThinkingLevel)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const newChat = useChatStore((s) => s.newChat)
  const resumeChat = useChatStore((s) => s.resumeChat)
  const renameChat = useChatStore((s) => s.renameChat)
  const deleteChatAction = useChatStore((s) => s.deleteChat)
  const refreshHistory = useChatStore((s) => s.refreshHistory)

  // Modo del panel: Plan (texto normal) o Agente (ejecuta tareas)
  const agentMode = useAgentStore((s) => s.mode)
  const setAgentMode = useAgentStore((s) => s.setMode)
  const runAgent = useAgentStore((s) => s.runAgent)
  const agentRunning = useAgentStore((s) => s.running)
  const agentError = useAgentStore((s) => s.error)
  const steps = useAgentStore((s) => s.steps)

  const [input, setInput] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentions, setMentions] = useState<MentionContext[]>([])
  // Menú de comandos "/" (fase E): query tras el slash, o null si está cerrado
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [autoContextEnabled, setAutoContextEnabled] = useState(true)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const t = useT()
  const setChatPanelVisible = useUiStore((s) => s.setChatPanelVisible)

  // Timeline unificado: mensajes del chat + pasos del agente, ordenados por ts
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((msg, index) => ({
        kind: 'chat' as const,
        ts: msg.ts ?? 0,
        index,
        msg,
      })),
      // Los steps 'user' del agente son redundantes: la tarea vive como mensaje
      ...steps
        .filter((s) => !(s.type === 'text' && s.role === 'user'))
        .map((step) => ({ kind: 'agent' as const, ts: step.ts ?? 0, step })),
    ]
    // Sort estable: items sin ts mantienen su orden relativo dentro del grupo
    return items.sort((a, b) => a.ts - b.ts)
  }, [messages, steps])

  useEffect(() => {
    if (providers.length === 0) void loadProviders()
  }, [providers.length, loadProviders])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [timeline, statusText, error, agentError])

  const selected = providers.find((p) => p.id === selectedProviderId) ?? null
  const models = selected
    ? fetchedModels[selected.id]?.length
      ? fetchedModels[selected.id]
      : selected.defaultModels
    : []
  const effectiveModel =
    modelByProvider[selectedProviderId ?? ''] ?? selected?.defaultModels[0]?.id ?? ''
  const modelInfo = models.find((m) => m.id === effectiveModel) ?? models[0]

  // Contexto del editor activo (pill informativa sobre el input)
  const activeTabPath = useEditorStore((s) => s.activeTabId)
  const activeCtxName = activeTabPath ? (activeTabPath.split(/[\\/]/).pop() ?? '') : ''
  const fileTree = useWorkspaceStore((s) => s.fileTree)

  // Opciones del menú de menciones: archivos del workspace + @codebase + @current
  const mentionOptions = useMemo<MentionContext[]>(() => {
    const walk = (nodes: FileNode[]): MentionContext[] =>
      nodes.flatMap((node) => {
        if (node.kind === 'file') {
          return [{ kind: 'file' as const, label: node.name, path: node.path }]
        }
        return node.children ? walk(node.children) : []
      })
    const options = walk(fileTree)
    options.push({ kind: 'codebase', label: 'codebase' })
    options.push({ kind: 'current', label: 'current' })
    return options
  }, [fileTree])

  const filteredMentionOptions = useMemo<MentionContext[]>(() => {
    const q = mentionQuery ?? ''
    if (q === '') return mentionOptions.slice(0, MAX_MENTION_RESULTS)
    return mentionOptions
      .map((opt) => ({ opt, score: fuzzyScore(q, `${opt.label} ${opt.path ?? ''}`) }))
      .filter((r) => r.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, MAX_MENTION_RESULTS)
      .map((r) => r.opt)
  }, [mentionQuery, mentionOptions])

  // Comandos "/" filtrados difusamente sobre nombre + descripción
  const filteredCommands = useMemo<ChatCommand[]>(() => {
    const q = slashQuery ?? ''
    if (q === '') return CHAT_COMMANDS
    return CHAT_COMMANDS.filter((c) => fuzzyScore(q, `${c.name} ${c.description}`) !== null)
  }, [slashQuery])

  const selectCommand = (cmd: ChatCommand): void => {
    setInput((prev) => prev.replace(/(^|\s)\/(\w*)$/, `$1${cmd.insert} `))
    setSlashQuery(null)
  }

  const handleInputChange = (value: string): void => {
    setInput(value)
    const mentionMatch = /@([^\s@]*)$/.exec(value)
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1])
      setMentionIndex(0)
      setSlashQuery(null)
      return
    }
    // Menú de comandos: "/" al inicio del input o tras espacio/salto de línea
    // (no interfiere con rutas como src/lib)
    const slashMatch = /(^|\s)\/(\w*)$/.exec(value)
    if (slashMatch) {
      setSlashQuery(slashMatch[2])
      setSlashIndex(0)
    } else {
      setSlashQuery(null)
    }
  }

  const selectMention = (m: MentionContext): void => {
    setMentions((prev) =>
      prev.some((p) => p.kind === m.kind && p.path === m.path) ? prev : [...prev, m],
    )
    setInput((prev) => prev.replace(/@([^\s@]*)$/, ''))
    setMentionQuery(null)
  }

  const removeMention = (index: number): void => {
    setMentions((prev) => prev.filter((_, i) => i !== index))
  }

  const send = (): void => {
    const text = input.trim()
    if (!text) return

    // Subagentes (/qa, /security, /audit): disponibles en ambos modos
    const detected = detectSubagent(text)
    const currentMentions = [...mentions]
    const contextOptions = { includeAutoContext: autoContextEnabled }

    if (detected || agentMode === 'agent') {
      const busy = agentMode === 'agent' ? agentRunning : streaming
      if (busy) return
      setInput('')
      setMentions([])
      setMentionQuery(null)
      void runAgent(text, currentMentions, contextOptions, undefined, detected?.subagent)
      return
    }

    if (streaming) return
    setInput('')
    setMentions([])
    setMentionQuery(null)
    void sendMessage(text, currentMentions, contextOptions)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    // Navegación del menú de comandos "/" (Enter NO envía mientras esté abierto)
    if (slashQuery !== null && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => Math.min(i + 1, filteredCommands.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const cmd = filteredCommands[slashIndex]
        if (cmd) selectCommand(cmd)
        return
      }
      if (e.key === 'Escape') {
        setSlashQuery(null)
        return
      }
    }
    // Navegación del menú de menciones cuando está abierto
    if (mentionQuery !== null && filteredMentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => Math.min(i + 1, filteredMentionOptions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const opt = filteredMentionOptions[mentionIndex]
        if (opt) selectMention(opt)
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // Time Travel: trunca el chat desde el turno indicado y revierte los
  // archivos que el agente aplicó desde ese punto (vía checkpoints)
  const truncateFromTurn = (turnId: string): void => {
    if (streaming || agentRunning) return
    const idx = useChatStore.getState().messages.findIndex((m) => m.turnId === turnId)
    if (idx === -1) return
    const turnIds = collectTurnIdsFrom(idx)
    void rollbackTurns(turnIds)
  }

  const editMessageByTurn = (turnId: string, text: string): void => {
    if (streaming || agentRunning) return
    setInput(text)
    truncateFromTurn(turnId)
  }

  const commitRename = (): void => {
    if (chatId && renameValue.trim()) {
      void renameChat(chatId, renameValue)
    }
    setRenaming(false)
  }

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-aether-border bg-aether-bg">
      {/* Historial de chats: nuevo / reanudar / renombrar / eliminar + ✕ cerrar */}
      <div className="flex items-center gap-1 border-b border-aether-border bg-aether-surface px-2.5 py-2">
        <button
          title={t('chat.newChat')}
          onClick={() => void newChat()}
          disabled={streaming || agentRunning}
          className="rounded-md px-1.5 py-1 text-[15px] leading-none text-aether-text transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          ＋
        </button>
        <select
          value={chatId ?? ''}
          onChange={(e) => {
            if (e.target.value) void resumeChat(e.target.value)
          }}
          className="min-w-0 flex-1 cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-[12px] text-aether-text outline-none transition-colors hover:border-aether-border hover:bg-aether-bg focus:border-aether-accent"
        >
          <option value="">— Chat nuevo —</option>
          {history.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button
          title={t('chat.renameChat')}
          onClick={() => {
            setRenameValue(chatTitle ?? '')
            setRenaming(true)
          }}
          disabled={!chatId || streaming || agentRunning}
          className="rounded-md px-1.5 py-1 text-[12px] text-aether-text-dim transition-colors hover:bg-white/10 hover:text-aether-text disabled:opacity-30"
        >
          ✎
        </button>
        <button
          title={t('chat.deleteChat')}
          onClick={() => chatId && void deleteChatAction(chatId)}
          disabled={!chatId || streaming || agentRunning}
          className="rounded-md px-1.5 py-1 text-[12px] text-aether-text-dim transition-colors hover:bg-white/10 hover:text-red-400 disabled:opacity-30"
        >
          🗑
        </button>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-aether-border" />
        <button
          title={t('chat.close')}
          onClick={() => setChatPanelVisible(false)}
          className="rounded-md px-1.5 py-1 text-[12px] text-aether-text-dim transition-colors hover:bg-white/10 hover:text-aether-text"
        >
          ✕
        </button>
      </div>
      {renaming && chatId && (
        <div className="flex gap-1.5 border-b border-aether-border bg-aether-surface px-2 py-1.5">
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
            className="flex-1 rounded border border-aether-border bg-aether-bg px-2 py-1 text-[12px] text-aether-text outline-none focus:border-aether-accent"
          />
          <button
            onClick={commitRename}
            className="rounded bg-aether-accent px-2 py-1 text-[12px] text-white"
          >
            OK
          </button>
          <button
            onClick={() => setRenaming(false)}
            className="rounded border border-aether-border px-2 py-1 text-[12px] text-aether-text-dim"
          >
            ✕
          </button>
        </div>
      )}

      {/* Selector rápido de proveedor/modelo + toggle Plan/Agente */}
      <div className="border-b border-aether-border bg-aether-surface p-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedProviderId ?? ''}
            onChange={(e) => selectProvider(e.target.value)}
            className="flex-1 rounded border border-aether-border bg-aether-bg px-2 py-1 text-[12px] outline-none"
          >
            <option value="" disabled>
              Proveedor…
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={effectiveModel}
            onChange={(e) => selected && setModel(selected.id, e.target.value)}
            disabled={!selected}
            className="flex-1 rounded border border-aether-border bg-aether-bg px-2 py-1 text-[12px] outline-none"
          >
            {models.length === 0 ? (
              <option value="">Sin modelos</option>
            ) : (
              models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          {/* Selector de modo: botón único desplegable (Plan / Agente) */}
          <div className="relative shrink-0">
            <button
              onClick={() => setModeMenuOpen(!modeMenuOpen)}
              className="flex items-center gap-1 rounded border border-aether-border bg-aether-bg px-2 py-1 text-[11px] font-medium text-aether-text"
            >
              {agentMode === 'agent' ? '🤖 Agente' : '📝 Plan'}
              <span className="text-[8px]">▾</span>
            </button>
            {modeMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModeMenuOpen(false)} />
                <div className="absolute bottom-full left-0 z-50 mb-1 w-40 overflow-hidden rounded-lg border border-aether-border bg-aether-surface/90 py-1 shadow-2xl backdrop-blur-xl">
                  {(['plan', 'agent'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setAgentMode(m)
                        setModeMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-aether-text hover:bg-aether-accent/20"
                    >
                      <span className="w-4 text-center text-[11px] text-aether-text-dim">
                        {agentMode === m ? '✓' : ''}
                      </span>
                      {m === 'plan' ? `📝 ${t('chat.plan')}` : `🤖 ${t('chat.agent')}`}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <select
            value={thinkingLevel}
            onChange={(e) => setThinkingLevel(e.target.value as ThinkingLevel)}
            className="rounded border border-aether-border bg-aether-bg px-2 py-1 text-[12px] outline-none"
          >
            {THINKING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Razonamiento: {o.label}
              </option>
            ))}
          </select>
          {modelInfo && (
            <span className="min-w-0 flex-1 truncate text-right text-[10px] text-aether-text-dim">
              {formatTokens(modelInfo.maxContextTokens) &&
                `${formatTokens(modelInfo.maxContextTokens)} tokens`}
              {modelInfo.modalities.length > 0 && (
                <span>
                  {' '}
                  | {modelInfo.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(' + ')}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* TIMELINE UNIFICADO: visible en ambos modos (Plan y Agente) */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {timeline.length === 0 && (
          <div className="flex h-full items-center justify-center text-aether-text-dim">
            <p className="max-w-[90%] text-center text-[13px]">
              {agentMode === 'agent'
                ? 'Describe una tarea para el agente o usa /qa, /security, /audit para análisis de solo lectura.'
                : selected
                  ? `Haz una pregunta a ${selected.name} — usa @ para adjuntar contexto`
                  : 'Selecciona un proveedor arriba'}
            </p>
          </div>
        )}
        {timeline.map((item, i) => {
          if (item.kind === 'agent') {
            const step = item.step
            const prevItem = i > 0 ? timeline[i - 1] : null
            const botKey = step.botName ?? null
            const showBotHeader =
              botKey !== null && !(prevItem?.kind === 'agent' && prevItem.step.botName === botKey)
            const subagentDef = SUBAGENTS.find((s) => s.botName === botKey)
            const botEmoji = subagentDef?.emoji ?? '🤖'
            const botTheme = botKey ? BOT_THEME[botKey] : undefined

            let content: React.ReactNode
            if (step.type === 'tool') {
              content = (
                <div className="rounded-md border border-aether-border/60 bg-aether-surface px-2.5 py-1.5 text-[12px] transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-aether-text-dim">⚙ {step.name}</span>
                    {step.status === 'running' ? (
                      <span className="text-aether-accent">ejecutando…</span>
                    ) : (
                      <details className="min-w-0 flex-1">
                        <summary className="cursor-pointer text-[11px] text-aether-text-dim hover:text-aether-text">
                          ver resultado
                        </summary>
                      </details>
                    )}
                  </div>
                  {step.status === 'done' && step.output && (
                    <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-aether-bg px-2 py-1.5 font-mono text-[11px] leading-relaxed text-aether-text-dim">
                      {step.output}
                    </pre>
                  )}
                </div>
              )
            } else if (step.type === 'report' && step.findings) {
              content = <FindingsReport findings={step.findings} botName={step.botName} />
            } else {
              content = (
                <div className="rounded-lg border border-aether-border/60 bg-aether-surface px-3 py-2 text-[13px] text-aether-text">
                  <MarkdownRenderer content={step.content ?? ''} />
                </div>
              )
            }

            return (
              <div
                key={`a-${i}-${step.ts}`}
                className={`message-enter rounded-lg p-2 ${
                  botKey && botTheme
                    ? `border border-dashed ${botTheme.ring} ${botTheme.glow}`
                    : ''
                }`}
              >
                {showBotHeader && botKey && (
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${botTheme?.avatarBg ?? 'bg-aether-accent/15'}`}
                    >
                      {botEmoji}
                    </span>
                    <span className="text-[11px] font-bold text-aether-text">{botKey}</span>
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[9px] text-aether-text-dim">
                      subagente · solo lectura
                    </span>
                  </div>
                )}
                <div className="space-y-2">{content}</div>
              </div>
            )
          }

          // Mensajes del modo Plan
          const msg = item.msg
          const isUser = msg.role === 'user'
          return (
            <div
              key={`chat-${item.index}-${msg.ts ?? i}`}
              className={`message-enter group relative flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed transition-shadow ${
                  isUser
                    ? 'rounded-br-sm bg-gradient-to-br from-aether-accent/30 to-aether-accent/15 text-white ring-1 ring-aether-accent/25'
                    : 'rounded-bl-sm border border-aether-border/60 bg-aether-surface text-aether-text shadow-sm'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <>
                    {msg.thinking && (
                      <ThinkingBlock
                        thinking={msg.thinking}
                        durationMs={msg.thinkingDurationMs}
                        active={streaming && msg.content === ''}
                      />
                    )}
                    <MarkdownRenderer content={msg.content} />
                    {msg.metrics && (
                      <div className="mt-1.5 flex justify-end">
                        <span className="text-[10px] tabular-nums text-aether-text-dim/70">
                          ⚡ {formatElapsed(msg.metrics.elapsedMs)} ·{" "}
                          {msg.metrics.inputTokens != null
                            ? `${msg.metrics.tokens}`
                            : `~${msg.metrics.tokens}`}{" "}
                          tokens
                          {msg.metrics.inputTokens != null && ` · ↑${msg.metrics.inputTokens}`}
                          {msg.metrics.cachedTokens != null &&
                            msg.metrics.cachedTokens > 0 &&
                            ` · 💰 ${formatTokens(msg.metrics.cachedTokens)} ${t('chat.cachedTokens')}`}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {isUser && msg.turnId && !streaming && !agentRunning && (
                <div className="absolute top-1 right-1 hidden items-center gap-0.5 rounded-md bg-aether-surface/95 p-0.5 shadow-md ring-1 ring-aether-border group-hover:flex">
                  <button
                    title="Editar y reenviar (revierte los cambios posteriores)"
                    onClick={() => editMessageByTurn(msg.turnId as string, msg.content)}
                    className="rounded px-1.5 py-0.5 text-[11px] text-aether-text-dim transition-colors hover:bg-white/10 hover:text-aether-text"
                  >
                    ✏️
                  </button>
                  <button
                    title="Eliminar (revierte los cambios del agente desde aquí)"
                    onClick={() => truncateFromTurn(msg.turnId as string)}
                    className="rounded px-1.5 py-0.5 text-[11px] text-aether-text-dim transition-colors hover:bg-white/10 hover:text-red-400"
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {statusText && (
          <p className="text-center text-[11px] text-aether-text-dim">{statusText}</p>
        )}
        {error && <p className="text-center text-[11px] text-red-400">{error}</p>}
        {agentError && <p className="text-center text-[11px] text-red-400">{agentError}</p>}
        <div ref={messagesEndRef} />
      </div>

      {/* Chips de contexto + menciones (los comandos viven en el menú "/") */}
      <div className="relative border-t border-aether-border p-2">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {autoContextEnabled && activeCtxName && (
            <span
              title={`Contexto automático: ${activeTabPath}`}
              className="flex items-center gap-1 rounded-full border border-aether-border bg-aether-bg px-2 py-0.5 text-[10px] text-aether-text-dim"
            >
              📄 {activeCtxName}
              <button
                title="Quitar contexto automático"
                onClick={() => setAutoContextEnabled(false)}
                className="text-aether-text-dim hover:text-aether-text"
              >
                ✕
              </button>
            </span>
          )}
          {!autoContextEnabled && activeCtxName && (
            <button
              title="Restaurar contexto automático del editor"
              onClick={() => setAutoContextEnabled(true)}
              className="rounded-full border border-dashed border-aether-border px-2 py-0.5 text-[10px] text-aether-text-dim hover:text-aether-text"
            >
              ＋ {activeCtxName}
            </button>
          )}
          {mentions.map((m, i) => (
            <span
              key={`${m.kind}-${m.label}-${i}`}
              className="flex items-center gap-1 rounded-full border border-aether-accent/40 bg-aether-accent/10 px-2 py-0.5 text-[10px] text-aether-text"
            >
              {m.kind === 'codebase' ? '🌐' : '📄'} {m.label}
              <button
                title="Quitar"
                onClick={() => removeMention(i)}
                className="text-aether-text-dim hover:text-aether-text"
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        {/* Menú flotante de comandos "/" */}
        {slashQuery !== null && (
          <div className="absolute bottom-full left-2 z-50 mb-1 max-h-64 w-[calc(100%-1rem)] overflow-y-auto rounded-lg border border-aether-border bg-aether-surface/90 shadow-2xl backdrop-blur-xl">
            <p className="border-b border-aether-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-aether-text-dim">
              {t('chat.commands')}
            </p>
            {filteredCommands.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-aether-text-dim">{t('chat.noMatches')}</p>
            )}
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                onClick={() => selectCommand(cmd)}
                onMouseEnter={() => setSlashIndex(i)}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] ${
                  i === slashIndex
                    ? 'bg-aether-accent/20 text-white'
                    : 'text-aether-text hover:bg-white/5'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] ${cmd.avatarClass}`}
                >
                  {cmd.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-aether-text">/{cmd.name}</span>
                  <span className="block truncate text-[10px] text-aether-text-dim">
                    {cmd.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Menú flotante de menciones */}
        {mentionQuery !== null && (
          <div className="absolute bottom-full left-2 z-50 mb-1 max-h-64 w-[calc(100%-1rem)] overflow-y-auto rounded-lg border border-aether-border bg-aether-surface/90 shadow-2xl backdrop-blur-xl">
            {filteredMentionOptions.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-aether-text-dim">Sin coincidencias</p>
            )}
            {filteredMentionOptions.map((opt, i) => (
              <button
                key={`${opt.kind}-${opt.label}-${opt.path ?? ''}`}
                onClick={() => selectMention(opt)}
                onMouseEnter={() => setMentionIndex(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] ${
                  i === mentionIndex
                    ? 'bg-aether-accent/20 text-white'
                    : 'text-aether-text hover:bg-white/5'
                }`}
              >
                <span className="truncate">
                  {opt.kind === 'codebase' ? '🌐 ' : '📄 '}@{opt.label}
                </span>
                <span className="shrink-0 truncate text-[10px] text-aether-text-dim">
                  {opt.kind === 'codebase'
                    ? 'estructura del workspace'
                    : opt.kind === 'current'
                      ? 'archivo actual'
                      : (opt.path ?? '')}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !selected
                ? t('chat.placeholderNoProvider')
                : t('chat.placeholderCommands')
            }
            rows={2}
            disabled={streaming || (agentMode === 'agent' && agentRunning)}
            className="flex-1 resize-none rounded border border-aether-border bg-aether-bg px-3 py-2 text-[13px] outline-none focus:border-aether-accent disabled:opacity-50"
          />
          {/* Fase E: botón Detener (rojo) mientras hay trabajo en curso */}
          {(streaming || (agentMode === 'agent' && agentRunning)) && (
            <button
              title={t('chat.stop')}
              onClick={() => {
                void useChatStore.getState().cancelStream()
                useAgentStore.getState().stopAgent()
              }}
              className="rounded border border-red-500/40 px-3 py-2 text-[13px] font-medium text-red-400 hover:bg-red-500/10"
            >
              ■
            </button>
          )}
          <button
            onClick={send}
            disabled={
              !input.trim() ||
              !selected ||
              !effectiveModel ||
              streaming ||
              (agentMode === 'agent' && agentRunning)
            }
            className="rounded bg-gradient-to-br from-aether-accent to-aether-accent-strong px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-all hover:shadow-[0_0_14px_rgba(167,139,250,0.4)] disabled:opacity-40 disabled:shadow-none"
          >
            {streaming || agentRunning
              ? '…'
              : detectedSubagentLabel(input)
                ? 'Analizar'
                : agentMode === 'agent'
                  ? 'Ejecutar'
                  : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function detectedSubagentLabel(text: string): boolean {
  return detectSubagent(text) !== null
}
