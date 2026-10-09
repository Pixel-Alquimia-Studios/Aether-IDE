export interface EditorTab {
  /** Identificador único = ruta del archivo */
  id: string
  title: string
  /** Contenido actual (puede diferir del disco si está modificado) */
  content: string
  language: string
  isDirty: boolean
}
