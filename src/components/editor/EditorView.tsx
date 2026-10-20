import { useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'

import Editor from '@monaco-editor/react'

// Side-effect: workers locales + tema aether-dark + instancia local de Monaco
import '@/lib/monaco/setup'
import { InlineEditWidget } from '@/components/editor/InlineEditWidget'
import { ImageViewer } from '@/components/editor/ImageViewer'
import { useEditorStore } from '@/stores/editorStore'
import { setEditorInstance, getEditorInstance } from '@/lib/monaco/editorRef'
import { useGitStore } from '@/stores/gitStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { monaco } from '@/lib/monaco/setup'

// Contenedor de la zona de edición: barra de tabs + Monaco.
// El prop `path` crea un modelo por archivo (Uri → Model), preservando
// cursor e historial de undo/redo al cambiar de pestaña.
export function EditorView() {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const closeTab = useEditorStore((s) => s.closeTab)
  const updateContent = useEditorStore((s) => s.updateContent)
  const editorError = useEditorStore((s) => s.error)
  const clearEditorError = () => useEditorStore.setState({ error: null })
  const inlineEditOpen = useUiStore((s) => s.inlineEditOpen)
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Gutter diff de Git: decoraciones en el margen según las líneas cambiadas
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const diffByPath = useGitStore((s) => s.diffByPath)
  const fetchDiff = useGitStore((s) => s.fetchDiff)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const isImageTab = activeTab?.kind === 'image'

  useEffect(() => {
    const editor = getEditorInstance()
    // Sin gutter para tabs de imagen (no hay editor activo ni diff que mostrar)
    if (!editor || !activeTabId || !rootPath || isImageTab) return
    const lines = diffByPath[activeTabId]
    if (lines === undefined) {
      void fetchDiff(activeTabId)
      return
    }
    const decorations = lines.map((line) => ({
      range: new monaco.Range(line.lineNumber, 1, line.lineNumber, 1),
      options: {
        linesDecorationsClassName:
          line.kind === 'added' ? 'git-gutter-added' : 'git-gutter-modified',
      },
    }))
    if (decorationsRef.current) {
      decorationsRef.current.set(decorations)
    } else {
      decorationsRef.current = editor.createDecorationsCollection(decorations)
    }
  }, [activeTabId, diffByPath, rootPath, fetchDiff, isImageTab])

  if (tabs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-aether-text-dim">
        <div className="text-center">
          <p className="text-lg">Aether IDE</p>
          <p className="mt-2 text-sm">Selecciona un archivo en el Explorer para empezar</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      {/* LOW (v0.3.1): los errores del editor ya no son invisibles — antes
          fallaba en silencio abrir un archivo ilegible/demasiado grande */}
      {editorError && (
        <div className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[12px] text-red-400">
          <span className="min-w-0 flex-1 truncate" title={editorError}>
            ⚠ {editorError}
          </span>
          <button
            title="Descartar"
            onClick={clearEditorError}
            className="rounded px-1 hover:bg-white/10"
          >
            ✕
          </button>
        </div>
      )}
      {/* Barra de tabs */}
      <div className="flex h-9 items-stretch overflow-x-auto border-b border-aether-border bg-aether-surface">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex cursor-pointer items-center gap-2 border-r border-aether-border px-3 text-[13px] ${
                isActive
                  ? 'bg-aether-bg text-white'
                  : 'text-aether-text-dim hover:bg-white/5 hover:text-aether-text'
              }`}
            >
              <span>
                {tab.title}
                {tab.isDirty && <span className="ml-1 text-aether-accent">●</span>}
              </span>
              <button
                title="Cerrar"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="rounded px-1 text-aether-text-dim opacity-0 group-hover:opacity-100 hover:bg-white/10"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* Contenido: Monaco para texto, visualizador para imágenes */}
      {activeTab?.kind === 'image' ? (
        <ImageViewer tab={activeTab} />
      ) : (
        activeTab && (
          <Editor
            path={activeTab.id}
            language={activeTab.language}
            value={activeTab.content}
            theme="aether-dark"
            onChange={(value) => updateContent(activeTab.id, value ?? '')}
            onMount={(editor) => setEditorInstance(editor)}
            loading={<div className="p-4 text-aether-text-dim">Cargando editor…</div>}
            options={{
              fontSize: 13,
              fontFamily: "'Cascadia Code', Consolas, monospace",
              fontLigatures: true,
              tabSize: 2,
              automaticLayout: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              padding: { top: 8 },
            }}
          />
        )
      )}

      {/* Edit with prompt (Ctrl+I): diff inline sobre la selección */}
      {inlineEditOpen && <InlineEditWidget />}
    </div>
  )
}
