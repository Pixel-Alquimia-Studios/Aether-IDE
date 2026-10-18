export interface EditorTab {
  /** Identificador único = ruta del archivo */
  id: string
  title: string
  /** Contenido actual (puede diferir del disco si está modificado) */
  content: string
  language: string
  isDirty: boolean
  /** Tipo de tab: texto (Monaco) o imagen (visualizador). Default: text */
  kind?: 'text' | 'image'
  /** Data URL de la imagen (solo kind === 'image') */
  dataUrl?: string
}
