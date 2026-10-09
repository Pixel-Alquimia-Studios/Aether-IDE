import type { FileNode } from '@/types/workspace'

// Workspace en memoria para desarrollo de la Fase 1.
// En Fase 2 será sustituido por comandos IPC de Tauri contra el FS real.

export const MOCK_FILE_TREE: FileNode[] = [
  {
    path: 'src',
    name: 'src',
    kind: 'directory',
    children: [
      { path: 'src/main.ts', name: 'main.ts', kind: 'file' },
      { path: 'src/App.tsx', name: 'App.tsx', kind: 'file' },
      { path: 'src/index.css', name: 'index.css', kind: 'file' },
    ],
  },
  {
    path: 'docs',
    name: 'docs',
    kind: 'directory',
    children: [{ path: 'docs/roadmap.md', name: 'roadmap.md', kind: 'file' }],
  },
  { path: 'package.json', name: 'package.json', kind: 'file' },
  { path: 'README.md', name: 'README.md', kind: 'file' },
]

export const MOCK_FILE_CONTENTS: Record<string, string> = {
  'src/main.ts': `import { createApp } from './App'\n\ncreateApp()\n`,
  'src/App.tsx': `export default function App() {\n  return <h1>Hello from Aether IDE</h1>\n}\n`,
  'src/index.css': `:root {\n  color-scheme: dark;\n}\n`,
  'docs/roadmap.md': `# Aether IDE — Roadmap\n\n- [x] Scaffolding\n- [x] Layout base\n- [ ] Monaco Editor\n- [ ] Gateway de APIs de IA\n`,
  'package.json': `{\n  "name": "aether-ide",\n  "private": true,\n  "version": "0.0.0"\n}\n`,
  'README.md': `# Aether IDE\n\nEditor de código con integración de APIs de IA.\n`,
}
