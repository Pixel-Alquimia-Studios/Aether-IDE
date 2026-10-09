import type { editor } from 'monaco-editor'

let instance: editor.IStandaloneCodeEditor | null = null

export function setEditorInstance(e: editor.IStandaloneCodeEditor | null): void {
  instance = e
}

export function getEditorInstance(): editor.IStandaloneCodeEditor | null {
  return instance
}