import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

import { useEditorStore } from '@/stores/editorStore'

function reactNodeToText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(reactNodeToText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props
    return reactNodeToText(props?.children)
  }
  return ''
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code(props) {
          const { className, children } = props
          const match = /language-(\w+)/.exec(className ?? '')
          const isBlock = Boolean(match) || String(children).includes('\n')
          if (!isBlock) {
            return <code className="rounded bg-aether-bg px-1 py-0.5 font-mono text-[12px]">{children}</code>
          }
          const language = match?.[1] ?? 'texto'
          return (
            <div className="my-2 overflow-hidden rounded border border-aether-border">
              <div className="flex items-center justify-between bg-aether-surface px-3 py-1">
                <span className="text-[10px] uppercase tracking-wider text-aether-text-dim">{language}</span>
                <button
                  onClick={() => useEditorStore.getState().insertAtCursor(reactNodeToText(children))}
                  className="rounded px-1.5 py-0.5 text-[10px] text-aether-text-dim hover:bg-white/10 hover:text-aether-text"
                >
                  ⇥ Insertar en Editor
                </button>
              </div>
              <pre className="m-0 overflow-x-auto bg-aether-bg p-3 font-mono text-[12px] leading-relaxed">
                <code className={className}>{children}</code>
              </pre>
            </div>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}