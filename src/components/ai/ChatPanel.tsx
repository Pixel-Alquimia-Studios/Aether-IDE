import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { AgentView } from '@/components/ai/AgentView'
import { MarkdownRenderer } from '@/components/ai/MarkdownRenderer'
import { ThinkingBlock } from '@/components/ai/ThinkingBlock'
import { collectTurnIdsFrom, rollbackTurns } from '@/lib/agent/rollback'
import { fuzzyScore } from '@/lib/commands/fuzzy'
import { useAgentStore } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'
import { useEditorStore } from '@/stores/editorStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { MentionContext, ThinkingLevel } from '@/types/chat'
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

  // Modo agente
  const agentMode = useAgentStore((s) => s.mode)
  const setAgentMode = useAgentStore((s) => s.setMode)
  const runAgent = useAgentStore((s) => s.runAgent)
  const agentRunning = useAgentStore((s) => s.running)

  const [input, setInput] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Menciones @: query abierto (null = cerrado), índice activo y pills añadidas
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentions, setMentions] = useState<MentionContext[]>([])
  /** Contexto automático del editor: quitado con la ✕ de la pill */
  const [autoContextEnabled, setAutoContextEnabled] = useState(true)

  useEffect(() => {
    if (providers.length === 0) void loadProviders()
  }, [providers.length, loadProviders])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, statusText, error])

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

  // Opciones del menú de menciones: archivos del workspace + @codebase + @current
  const fileTree = useWorkspaceStore((s) => s.fileTree)
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

  const handleInputChange = (value: string): void => {
    setInput(value)
    const match = /@([^\s@]*)$/.exec(value)
    if (match) {
      setMentionQuery(match[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
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
    const currentMentions = [...mentions]
    const contextOptions = { includeAutoContext: autoContextEnabled }
    if (agentMode === 'agent') {
      if (agentRunning) return
      setInput('')
      setMentions([])
      setMentionQuery(null)
      void runAgent(text, currentMentions, contextOptions)
      return
    }
    if (streaming) return
    setInput('')
    setMentions([])
    setMentionQuery(null)
    void sendMessage(text, currentMentions, contextOptions)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
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

  // Agent Time Travel: trunca el chat desde el mensaje i y revierte los
  // cambios de archivos que el agente aplicó desde ese punto
  const truncateFrom = (index: number): void => {
    if (streaming || agentRunning) return
    const turnIds = collectTurnIdsFrom(index)
    void rollbackTurns(turnIds)
  }

  const editMessage = (index: number): void => {
    const msg = messages[index]
    if (!msg || msg.role !== 'user' || streaming || agentRunning) return
    setInput(msg.content)
    truncateFrom(index)
  }

  const commitRename = (): void => {
    if (chatId && renameValue.trim()) {
      void renameChat(chatId, renameValue)
    }
    setRenaming(false)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Historial de chats: nuevo / reanudar / renombrar / eliminar */}
      <div className="flex items-center gap-1.5 border-b border-aether-border bg-aether-surface px-2 py-1.5">
        <button
          title="Nuevo chat"
          onClick={() => void newChat()}
          disabled={streaming}
          className="rounded px-2 py-1 text-[13px] text-aether-text hover:bg-white/10 disabled:opacity-40"
        >
          ＋
        </button>
        <select
          value={chatId ?? ''}
          onChange={(e) => {
            if (e.target.value) void resumeChat(e.target.value)
          }}
          className="min-w-0 flex-1 rounded border border-aether-border bg-aether-bg px-2 py-1 text-[12px] text-aether-text outline-none"
        >
          <option value="">— Chat nuevo —</option>
          {history.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button
          title="Renombrar chat"
          onClick={() => {
            setRenameValue(chatTitle ?? '')
            setRenaming(true)
          }}
          disabled={!chatId || streaming}
          className="rounded px-1.5 py-1 text-[12px] text-aether-text-dim hover:bg-white/10 disabled:opacity-40"
        >
          ✎
        </button>
        <button
          title="Eliminar chat"
          onClick={() => chatId && void deleteChatAction(chatId)}
          disabled={!chatId || streaming}
          className="rounded px-1.5 py-1 text-[12px] text-aether-text-dim hover:bg-white/10 disabled:opacity-40"
        >
          🗑
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

      {/* Selector rápido de proveedor/modelo + thinking level */}
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
          {/* Toggle Chat / Agente */}
          <div className="flex shrink-0 rounded border border-aether-border p-0.5">
            {(['chat', 'agent'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setAgentMode(m)}
                className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                  agentMode === m
                    ? 'bg-aether-accent/25 font-medium text-white'
                    : 'text-aether-text-dim hover:text-aether-text'
                }`}
              >
                {m === 'chat' ? 'Chat' : '🤖 Agente'}
              </button>
            ))}
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

      {/* Área de mensajes (chat) o pasos del agente */}
      {agentMode === 'agent' ? (
        <AgentView onEditTask={(text) => setInput(text)} />
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-aether-text-dim">
              <p className="text-center">
                {selected
                  ? `Haz una pregunta a ${selected.name}`
                  : 'Selecciona un proveedor arriba'}
              </p>
            </div>
          )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`group relative flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] ${
                msg.role === 'user'
                  ? 'bg-aether-accent/25 text-white'
                  : 'border border-aether-border bg-aether-surface text-aether-text'
              }`}
            >
              {msg.role === 'assistant' ? (
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
                    <div className="mt-1 flex justify-end">
                      <span className="text-[10px] text-aether-text-dim">
                        ⚡ {formatElapsed(msg.metrics.elapsedMs)} · ~{msg.metrics.tokens} tokens
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>

            {/* Time Travel: editar / eliminar mensajes del usuario */}
            {msg.role === 'user' && !streaming && !agentRunning && (
              <div className="absolute top-1 right-1 hidden items-center gap-0.5 rounded bg-aether-surface/90 p-0.5 shadow group-hover:flex">
                <button
                  title="Editar y reenviar (revierte los cambios posteriores)"
                  onClick={() => editMessage(i)}
                  className="rounded px-1 text-[11px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
                >
                  ✏️
                </button>
                <button
                  title="Eliminar (revierte los cambios del agente desde aquí)"
                  onClick={() => truncateFrom(i)}
                  className="rounded px-1 text-[11px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
                >
                  🗑
                </button>
              </div>
            )}
          </div>
        ))}
        {statusText && (
          <p className="text-center text-[11px] text-aether-text-dim">{statusText}</p>
        )}
        {error && <p className="text-center text-[11px] text-red-400">{error}</p>}
        <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input con contexto y menciones @ */}
      <div className="relative border-t border-aether-border p-2">
        {/* Pills de contexto actual y menciones añadidas */}
        {(activeCtxName || mentions.length > 0) && (
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
        )}

        {/* Menú flotante de menciones */}
        {mentionQuery !== null && (
          <div className="absolute bottom-full left-2 z-50 mb-1 max-h-64 w-[calc(100%-1rem)] overflow-y-auto rounded-lg border border-aether-border bg-aether-surface shadow-2xl">
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
              agentMode === 'agent'
                ? 'Describe la tarea para el agente… (usa @ para adjuntar contexto)'
                : selected
                  ? 'Mensaje… (usa @ para adjuntar contexto)'
                  : 'Selecciona un proveedor en Ajustes…'
            }
            rows={2}
            disabled={streaming || (agentMode === 'agent' && agentRunning)}
            className="flex-1 resize-none rounded border border-aether-border bg-aether-bg px-3 py-2 text-[13px] outline-none focus:border-aether-accent disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={
              !input.trim() ||
              !selected ||
              !effectiveModel ||
              streaming ||
              (agentMode === 'agent' && agentRunning)
            }
            className="rounded bg-aether-accent px-3 py-2 text-[13px] text-white disabled:opacity-40"
          >
            {streaming || agentRunning ? '…' : agentMode === 'agent' ? 'Ejecutar' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
