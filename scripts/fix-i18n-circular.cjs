// Limpia i18n.ts: quita Language duplicado, arregla circular import
const fs = require('fs')
let raw = fs.readFileSync('src/lib/i18n.ts', 'utf8')

// 1. Re-exportar Language desde @/lib/language (no duplicar)
raw = raw.replace(
  "import type { Language } from '@/lib/language'\n\n// Sistema",
  "import type { Language } from '@/lib/language'\n\n// Sistema"
)
// Ya está importado — solo quitar la definición local si existe
raw = raw.replace("export type Language = 'es' | 'en'\n\n", "")

// 2. Fix circular import: usar variable de módulo en vez de settingsStore
raw = raw.replace(
  /export function useT\(\): \(key: TranslationKey\) => string \{\n  const language = useSettingsStore\(\(s\) => s\.language\)\n  return \(key\) => \{\n    const dict = dictionaries\[language\] \?\? en\n    return dict\[key\] \?\? en\[key\] \?\? key\n  \}\n\}/,
  `// Idioma actual inyectado por settingsStore (evita importación circular)
let _currentLanguage: Language = 'en'

export function setI18nLanguage(lang: Language): void {
  _currentLanguage = lang
}

export function getI18nLanguage(): Language {
  return _currentLanguage
}

/** Hook reactivo: devuelve la función de traducción según el idioma activo */
export function useT(): (key: TranslationKey) => string {
  const language = useLanguage()
  return (key) => {
    const dict = dictionaries[language] ?? en
    return dict[key] ?? en[key] ?? key
  }
}`
)

// 3. Fix tSync igual
raw = raw.replace(
  /export function tSync\(key: TranslationKey\): string \{\n  const language = useSettingsStore\.getState\(\)\.language\n  const dict = dictionaries\[language\] \?\? en\n  return dict\[key\] \?\? en\[key\] \?\? key\n\}/,
  `export function tSync(key: TranslationKey): string {
  const dict = dictionaries[_currentLanguage] ?? en
  return dict[key] ?? en[key] ?? key
}`
)

// 4. Quitar detectLanguage (ya está en @/lib/language)
raw = raw.replace(
  /\n\/\*\* Idioma por defecto según el locale del SO.*?\n\}/s,
  ''
)

// 5. Añadir import de useLanguage desde el store (para reactividad)
raw = raw.replace(
  "import type { Language } from '@/lib/language'",
  "import { useLanguage } from '@/hooks/useLanguage'\nimport type { Language } from '@/lib/language'"
)

fs.writeFileSync('src/lib/i18n.ts', raw)
console.log('i18n.ts limpiado')
