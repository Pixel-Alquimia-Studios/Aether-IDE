import { DiffEditor } from '@monaco-editor/react'
import { useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { chatStream } from '@/lib/ai/api'
import { getEditorInstance } from '@/lib/monaco/editorRef'
import { useChatStore } from '@/stores/chatStore'
import { getActiveProviderConfig } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'

const EDIT_SYSTEM_PROMPT =
  'Eres un asistente de edición de código dentro de un IDE. Modifica el código del usuario exactamente según la instrucción. Responde ÚNICAMENTE con el código modificado completo de la selección: sin markdown, sin fences, sin explicaciones.'

interface EditTarget {
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
  originalCode: string
  language: string
}

function stripFences(code: string): string {
  const t = code.trim()
  const m = /^```[a-zA-Z-]*\n([\s\S]*?)```$/.exec(t)
  if (m) return m[1].trimEnd()
  return t
}

// Se monta solo cuando inlineEditOpen (renderizado condicional en EditorView);
// el initializer captura la selección activa en el momento de abrir.
export function InlineEditWidget() {
  const setInlineEditOpen = useUiStore((s) => s.setInlineEditOpen)
  const thinkingLevel = useChatStore((s) => s.thinkingLevel)

  const [target] = useState<EditTarget | null>(() => {
    const editor = getEditorInstance()
    const selection = editor?.getSelection()
    const model = editor?.getModel()
    if (!editor || !selection || !model || selection.isEmpty()) return null
    return {
      range: {
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn,
      },
      originalCode: model.getValueInRange(selection),
      language: model.getLanguageId(),
    }
  })
  const [instruction, setInstruction] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [preview, setPreview] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runEdit = (): void => {
    const text = instruction.trim()
    if (!text || streaming || !target) return
    const config = getActiveProviderConfig()
    if (!config || !config.model) {
      setError('Configura un proveedor y modelo en Ajustes')
      return
    }

    setStreaming(true)
    setPreview('')
    setResult(null)
    setError(null)

    let acc = ''
    void chatStream(
      {
        providerId: config.providerId,
        model: config.model,
        thinkingLevel,
        messages: [
          { role: 'system', content: EDIT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Lenguaje: ${target.language}\n\nInstrucción: ${text}\n\nCódigo actual:\n${target.originalCode}`,
          },
        ],
      },
      {
        onDelta: (delta) => {
          acc += delta
          setPreview(acc)
        },
        onDone: () => {
          setStreaming(false)
          setResult(stripFences(acc))
        },
        onError: (message) => {
          setStreaming(false)
          setError(message)
        },
      },
    )
  }

  const accept = (): void => {
    if (!target || result === null) return
    const editor = getEditorInstance()
    if (editor) {
      // executeEdits dispara onChange del Editor → updateContent marca isDirty
      editor.executeEdits('aether-inline-edit', [{ range: target.range, text: result }])
    }
    setInlineEditOpen(false)
  }

  const reject = (): void => setInlineEditOpen(false)

  if (!target) {
    return (
      <div className="absolute right-4 top-2 z-40 w-[520px] max-w-[90%] rounded-lg border border-aether-border bg-aether-surface p-3 shadow-2xl">
        <p className="text-[13px] text-aether-text-dim">
          Selecciona código en el editor y pulsa Ctrl+I para editar con IA
        </p>
        <button
          onClick={() => setInlineEditOpen(false)}
          className="mt-2 rounded border border-aether-border px-3 py-1 text-[12px] text-aether-text-dim hover:bg-white/5"
        >
          Cerrar
        </button>
      </div>
    )
  }

  return (
    <div className="absolute right-4 top-2 z-40 flex max-h-[80%] w-[620px] max-w-[92%] flex-col overflow-hidden rounded-lg border border-aether-border bg-aether-surface shadow-2xl">
      {/* Instrucción */}
      <div className="flex items-center gap-2 border-b border-aether-border p-2">
        <input
          autoFocus
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              runEdit()
            }
          }}
          placeholder="Describe la modificación… (ej: añade manejo de errores)"
          className="min-w-0 flex-1 rounded border border-aether-border bg-aether-bg px-3 py-1.5 text-[13px] text-aether-text outline-none placeholder:text-aether-text-dim focus:border-aether-accent"
        />
        <button
          onClick={runEdit}
          disabled={streaming || !instruction.trim()}
          className="rounded bg-aether-accent px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          {streaming ? '…' : 'Editar'}
        </button>
        <button
          onClick={() => setInlineEditOpen(false)}
          className="rounded px-2 py-1.5 text-[13px] text-aether-text-dim hover:bg-white/10"
        >
          ✕
        </button>
      </div>

      {/* Streaming preview o Diff original vs propuesto */}
      <div className="min-h-32 flex-1 overflow-auto">
        {error && <p className="p-3 text-xs text-red-400">{error}</p>}
        {result !== null ? (
          <DiffEditor
            original={target.originalCode}
            modified={result}
            language={target.language}
            theme="aether-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              fontSize: 12,
            }}
          />
        ) : (
          <pre className="m-0 whitespace-pre-wrap p-3 font-mono text-[12px] leading-relaxed text-aether-text-dim">
            {preview || (streaming ? '' : 'Escribe una instrucción y pulsa Enter')}
          </pre>
        )}
      </div>

      {/* Aceptar / Rechazar */}
      {result !== null && (
        <div className="flex justify-end gap-2 border-t border-aether-border p-2">
          <button
            onClick={reject}
            className="rounded border border-aether-border px-3 py-1.5 text-[13px] text-aether-text-dim hover:bg-white/5"
          >
            Rechazar
          </button>
          <button
            onClick={accept}
            className="rounded bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-500"
          >
            ✓ Aceptar cambios
          </button>
        </div>
      )}
    </div>
  )
}
