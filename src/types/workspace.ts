export interface FileNode {
  /** Ruta completa dentro del workspace, p.ej. "src/App.tsx" */
  path: string
  name: string
  kind: 'file' | 'directory'
  children?: FileNode[]
}
