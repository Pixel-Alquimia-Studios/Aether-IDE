import { getEditorInstance } from '@/lib/monaco/editorRef'
import { useEditorStore } from '@/stores/editorStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { FileNode } from '@/types/workspace'
import type { MentionContext } from '@/types/chat'

const CONTEXT_CHAR_LIMIT = 8000

export interface ContextFragment {
  label: string
  content: string
}

/** Contexto del editor activo: selección si existe, si no el archivo completo (truncado) */
export function getActiveEditorContext(): { path: string; content: string } | null {
  const editor = getEditorInstance()
  const model = editor?.getModel()
  const path = useEditorStore.getState().activeTabId
  if (!editor || !model || !path) return null
  const selection = editor.getSelection()
  const raw = selection && !selection.isEmpty() ? model.getValueInRange(selection) : model.getValue()
  const content = raw.length > CONTEXT_CHAR_LIMIT ? `${raw.slice(0, CONTEXT_CHAR_LIMIT)}\n… (truncado)` : raw
  return { path, content }
}

function truncateContext(s: string): string {
  return s.length > CONTEXT_CHAR_LIMIT ? `${s.slice(0, CONTEXT_CHAR_LIMIT)}\n… (truncado)` : s
}

/** Lista plana de archivos del workspace (para el menú de menciones) */
export function listWorkspaceFiles(): Array<{ path: string; name: string }> {
  const { fileTree } = useWorkspaceStore.getState()
  const files: Array<{ path: string; name: string }> = []
  const walk = (nodes: FileNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'file') files.push({ path: node.path, name: node.name })
      if (node.children) walk(node.children)
    }
  }
  walk(fileTree)
  return files
}

function buildWorkspaceTreeSummary(): string {
  const { fileTree } = useWorkspaceStore.getState()
  const lines: string[] = []
  const walk = (nodes: FileNode[], depth: number): void => {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}${node.name}${node.kind === 'directory' ? '/' : ''}`)
      if (node.children && depth < 4) walk(node.children, depth + 1)
    }
  }
  walk(fileTree, 0)
  return lines.join('\n')
}

/** Resuelve las menciones @ a fragmentos de contexto concretos */
export async function resolveMentions(mentions: MentionContext[]): Promise<ContextFragment[]> {
  const fragments: ContextFragment[] = []
  for (const mention of mentions) {
    if (mention.kind === 'file' && mention.path) {
      try {
        const content = await useWorkspaceStore.getState().readFile(mention.path)
        fragments.push({ label: mention.path, content: truncateContext(content) })
      } catch {
        // Archivo ilegible o inexistente: se omite
      }
    } else if (mention.kind === 'current') {
      const ctx = getActiveEditorContext()
      if (ctx) fragments.push({ label: `${ctx.path} (actual)`, content: ctx.content })
    } else if (mention.kind === 'codebase') {
      fragments.push({ label: 'codebase (estructura)', content: buildWorkspaceTreeSummary() })
    }
  }
  return fragments
}

/** Construye el bloque de contexto que se inyecta en el payload al LLM */
export function buildContextBlock(
  fragments: ContextFragment[],
  current?: { path: string; content: string } | null,
): string {
  const parts: string[] = []
  if (current) {
    parts.push(`[Archivo actual: ${current.path}]\n${current.content}`)
  }
  for (const fragment of fragments) {
    parts.push(`[Contexto: ${fragment.label}]\n${fragment.content}`)
  }
  if (parts.length === 0) return ''
  return `--- Contexto adjunto ---\n\n${parts.join('\n\n---\n\n')}\n--- Fin del contexto ---`
}
