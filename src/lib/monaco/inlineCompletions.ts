import type * as Monaco from 'monaco-editor'

import { inlineCompletion } from '@/lib/ai/api'
import { getActiveProviderConfig } from '@/stores/settingsStore'

const DEBOUNCE_MS = 350
const PREFIX_LIMIT = 4000
const SUFFIX_LIMIT = 2000
const MIN_PREFIX_CHARS = 8

// Provider de ghost text: al pausar la escritura (~350ms) envía prefijo/sufijo
// del cursor al modelo activo; la sugerencia se acepta con Tab (default Monaco).
export function registerInlineCompletions(monaco: typeof Monaco): void {
  const languages = [
    'typescript',
    'javascript',
    'json',
    'css',
    'scss',
    'less',
    'html',
    'markdown',
    'rust',
    'python',
    'go',
    'java',
    'c',
    'cpp',
    'shell',
    'yaml',
    'xml',
    'sql',
    'ini',
    'plaintext',
  ]

  monaco.languages.registerInlineCompletionsProvider(languages, {
    async provideInlineCompletions(model, position, _context, token) {
      const config = getActiveProviderConfig()
      if (!config || !config.model) return { items: [] }

      // Debounce: abortar si el usuario siguió escribiendo durante la espera
      const versionAtCall = model.getVersionId()
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS))
      if (token.isCancellationRequested || model.getVersionId() !== versionAtCall) {
        return { items: [] }
      }

      const prefix = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      if (prefix.trim().length < MIN_PREFIX_CHARS) return { items: [] }

      const lastLine = model.getLineCount()
      const suffix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: lastLine,
        endColumn: model.getLineMaxColumn(lastLine),
      })

      const suggestion = await inlineCompletion({
        providerId: config.providerId,
        model: config.model,
        prefix: prefix.slice(-PREFIX_LIMIT),
        suffix: suffix.slice(0, SUFFIX_LIMIT),
        language: model.getLanguageId(),
      })
      if (token.isCancellationRequested) return { items: [] }
      if (!suggestion || suggestion.trim() === '') return { items: [] }
      return { items: [{ insertText: suggestion }] }
    },

    disposeInlineCompletions() {
      // Sin caché: nada que liberar
    },
  })
}
