/** Tipo de idioma compartido entre i18n y settings (sin importación circular) */
export type Language = 'es' | 'en'

/** Idioma por defecto según el locale del SO (es-* → español latino) */
export function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}
