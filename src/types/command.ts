export interface Command {
  id: string
  title: string
  /** Categoría mostrada como prefijo en la paleta */
  category?: string
  /** Atajo informativo; la detección real vive en useKeyboardShortcuts */
  keybinding?: string
  run: () => void
}
