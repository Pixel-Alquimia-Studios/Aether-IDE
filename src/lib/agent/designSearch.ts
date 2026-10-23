// Port a TypeScript del buscador BM25 de ui-ux-pro-max (MIT, Next Level
// Builder — ver THIRD_PARTY_NOTICES.md). Original: src/ui-ux-pro-max/
// scripts/core.py + search.py (solo stdlib, sin dependencias).
//
// Fidelidad al original:
// - BM25 (k1=1.5, b=0.75) con tokenización idéntica: sinónimos en bordes de
//   palabra, puntuación fuera, stopwords mínimas (conserva ui/ux/css/3d/os)
// - Umbrales de abstención por dominio (style 4.3, icons 5.8) + cobertura de
//   la query
// - Reescrituras de query por dominio (wcag→accessibility, palette→∅…)
// - Identidad exacta de estilos (Style ID/Categoría/Aliases) y resolución de
//   estilos deprecados vía Parent Style ID
// - Filtrado de estilos por Status=active
// - Auto-detección de dominio por keywords con peso por especificidad,
//   bonus hex-color y desempate por orden fijo
// - Iconos: "lucide" → abstención (biblioteca no soportada)
//
// Diferencias declaradas:
// - Sugerencias por Levenshtein simple (el original usa difflib)
// - Dominios recortados a 7 (sin google-fonts/stacks/gsap/react/web/landing/
//   product); Decision_Rules se pasan como TEXTO al LLM sin resolver (el
//   nivel 1 no es trivial y el modelo las interpreta igual de bien)

// ============ TOKENIZACIÓN ============

const STOPWORDS = new Set([
  'to', 'in', 'on', 'at', 'is', 'of', 'by', 'or', 'an', 'if', 'no', 'so',
  'do', 'be', 'we', 'it', 'as', 'the', 'and', 'for', 'are', 'was',
])

const SYNONYMS: Record<string, string> = {
  'q&a': 'question answer',
  'e-commerce': 'ecommerce',
  'dark-mode': 'dark',
  darkmode: 'dark',
  'light-mode': 'light',
  lightmode: 'light',
  a11y: 'accessibility',
  nav: 'navigation',
  'sign-up': 'signup',
  'log-in': 'login',
  colour: 'color',
  colours: 'colors',
  customisation: 'customization',
  organisation: 'organization',
  behaviour: 'behavior',
  'ux/ui': 'ux ui',
}

/** Sustitución de sinónimos longest-first en bordes de palabra */
function normalize(text: string): string {
  let normalized = String(text)
  for (const [variant, canonical] of Object.entries(SYNONYMS).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    const pattern = new RegExp(`(?<!\\w)${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'gi')
    normalized = normalized.replace(pattern, canonical)
  }
  return normalized
}

// ============ BM25 ============

export type CsvRow = Record<string, string>

export class Bm25Index {
  private readonly k1 = 1.5
  private readonly b = 0.75
  private corpus: string[][] = []
  private docLengths: number[] = []
  private avgdl = 0
  private idf = new Map<string, number>()
  private docFreqs = new Map<string, number>()
  private termFreqs: Map<string, number>[] = []
  private N = 0

  tokenize(text: string): string[] {
    const normalized = normalize(String(text).toLowerCase())
      .replace(/[^\w\s]/g, ' ')
    return normalized
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
  }

  fit(documents: string[]): void {
    this.corpus = documents.map((doc) => this.tokenize(doc))
    this.N = this.corpus.length
    if (this.N === 0) return
    this.docLengths = this.corpus.map((doc) => doc.length)
    this.avgdl = this.docLengths.reduce((a, b) => a + b, 0) / this.N || 1

    this.termFreqs = []
    for (const doc of this.corpus) {
      const tf = new Map<string, number>()
      for (const word of doc) tf.set(word, (tf.get(word) ?? 0) + 1)
      this.termFreqs.push(tf)
      for (const word of tf.keys()) {
        this.docFreqs.set(word, (this.docFreqs.get(word) ?? 0) + 1)
      }
    }
    for (const [word, freq] of this.docFreqs) {
      this.idf.set(word, Math.log((this.N - freq + 0.5) / (freq + 0.5) + 1))
    }
  }

  /** Todos los documentos puntuados, ordenados por score descendente */
  score(query: string): Array<[number, number]> {
    const queryTokens = this.tokenize(query)
    const scores: Array<[number, number]> = []
    for (let idx = 0; idx < this.N; idx++) {
      let score = 0
      const docLen = this.docLengths[idx]
      const termFreqs = this.termFreqs[idx]
      for (const token of queryTokens) {
        const idf = this.idf.get(token)
        if (idf === undefined) continue
        const tf = termFreqs.get(token) ?? 0
        const numerator = tf * (this.k1 + 1)
        const denominator = tf + this.k1 * (1 - this.b + (this.b * docLen) / this.avgdl)
        score += (idf * numerator) / denominator
      }
      scores.push([idx, score])
    }
    return scores.sort((a, b) => b[1] - a[1])
  }

  vocabulary(): string[] {
    return [...this.idf.keys()]
  }

  freqOf(term: string): number {
    return this.docFreqs.get(term) ?? 0
  }
}

// ============ CSV (RFC4180: comillas, comas y saltos dentro de campo) ============

export function parseCsv(raw: string): CsvRow[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const text = raw.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''))
      field = ''
      rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== '')).map((r) => {
    const obj: CsvRow = {}
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? ''
    })
    return obj
  })
}

// ============ CONFIGURACIÓN DE DOMINIOS ============

interface DomainConfig {
  file: string
  searchCols: string[]
  outputCols: string[]
  /** Umbral mínimo de score para no abstenerse (calibrado en el original) */
  minScore: number
  keywords: string[]
  rewrites: Record<string, string | null>
}

// Tabla ÚNICA dominio → configuración (incluye el archivo CSV real). Cualquier
// resolución dominio→archivo DEBE pasar por aquí (el bug de "ux.csv" fue
// construirla a mano en el loader)
export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  style: {
    file: 'styles.csv',
    searchCols: ['Style ID', 'Style Category', 'Aliases', 'Keywords', 'Best For', 'Type', 'AI Prompt Keywords'],
    outputCols: ['Style ID', 'Style Category', 'Aliases', 'Status', 'Parent Style ID', 'Preferred Mode', 'Type', 'Keywords', 'Primary Colors', 'Effects & Animation', 'Best For', 'Light Mode ✓', 'Dark Mode ✓', 'Performance', 'Accessibility', 'Framework Compatibility', 'Complexity', 'AI Prompt Keywords', 'CSS/Technical Keywords', 'Implementation Checklist', 'Design System Variables'],
    minScore: 4.3,
    keywords: ['style', 'design', 'ui', 'minimalism', 'glassmorphism', 'neumorphism', 'brutalism', 'dark mode', 'flat', 'aurora', 'css', 'implementation', 'variable', 'checklist', 'tailwind'],
    rewrites: { css: null, implementation: null, variable: null, checklist: null, tailwind: null },
  },
  color: {
    file: 'colors.csv',
    searchCols: ['Product Type', 'Notes'],
    outputCols: ['Product Type', 'Primary', 'On Primary', 'Secondary', 'On Secondary', 'Accent', 'On Accent', 'Background', 'Foreground', 'Card', 'Card Foreground', 'Muted', 'Muted Foreground', 'Border', 'Destructive', 'On Destructive', 'Ring', 'Notes'],
    minScore: 0,
    keywords: ['color', 'palette', 'hex', 'rgb', 'token', 'semantic', 'accent', 'destructive', 'muted', 'foreground'],
    rewrites: { color: null, palette: null, hex: null, rgb: null, token: null, semantic: null, destructive: null, muted: null, foreground: null },
  },
  typography: {
    file: 'typography.csv',
    searchCols: ['Font Pairing Name', 'Category', 'Mood/Style Keywords', 'Best For', 'Heading Font', 'Body Font'],
    outputCols: ['Font Pairing Name', 'Category', 'Heading Font', 'Body Font', 'Mood/Style Keywords', 'Best For', 'Google Fonts URL', 'CSS Import', 'Tailwind Config', 'Notes'],
    minScore: 0,
    keywords: ['font pairing', 'typography pairing', 'heading font', 'body font'],
    rewrites: {},
  },
  ux: {
    file: 'ux-guidelines.csv',
    searchCols: ['Category', 'Issue', 'Description', 'Platform'],
    outputCols: ['Category', 'Issue', 'Platform', 'Description', 'Do', "Don't", 'Code Example Good', 'Code Example Bad', 'Severity'],
    minScore: 0,
    keywords: ['ux', 'usability', 'accessibility', 'wcag', 'touch', 'scroll', 'animation', 'keyboard', 'navigation', 'mobile'],
    rewrites: { ux: 'accessibility', usability: 'accessibility', wcag: 'accessibility' },
  },
  charts: {
    file: 'charts.csv',
    searchCols: ['Data Type', 'Keywords', 'Best Chart Type', 'When to Use', 'When NOT to Use', 'Accessibility Notes'],
    outputCols: ['Data Type', 'Keywords', 'Best Chart Type', 'Secondary Options', 'When to Use', 'When NOT to Use', 'Data Volume Threshold', 'Color Guidance', 'Accessibility Grade', 'Accessibility Risk', 'Accessibility Notes', 'A11y Fallback', 'Library Recommendation', 'Interactive Level'],
    minScore: 0,
    keywords: ['time series', 'chart', 'graph', 'visualization', 'trend', 'bar chart', 'pie', 'scatter', 'heatmap', 'funnel', 'forecast'],
    rewrites: {},
  },
  icons: {
    file: 'icons.csv',
    searchCols: ['Category', 'Icon Name', 'Keywords', 'Best For', 'Library'],
    outputCols: ['Category', 'Icon Name', 'Keywords', 'Library', 'Import Code', 'Usage', 'Best For', 'Style', 'Semantic Role', 'Allowed Contexts'],
    minScore: 5.8,
    keywords: ['icon', 'icons', 'lucide', 'phosphor', 'heroicons', 'symbol', 'glyph', 'pictogram', 'svg icon'],
    rewrites: { lucide: null, symbol: null, glyph: null, pictogram: null },
  },
  'ui-reasoning': {
    file: 'ui-reasoning.csv',
    searchCols: ['UI_Category', 'Recommended_Pattern', 'Style_Priority', 'Color_Mood', 'Typography_Mood', 'Key_Effects', 'Anti_Patterns'],
    outputCols: ['UI_Category', 'Recommended_Pattern', 'Style_Priority', 'Color_Mood', 'Typography_Mood', 'Key_Effects', 'Decision_Rules', 'Anti_Patterns', 'Severity'],
    minScore: 0,
    keywords: ['design system', 'recommendation', 'recommendations', 'ui category', 'product type', 'patterns'],
    rewrites: {},
  },
}

export const UX_DOMAINS = Object.keys(DOMAIN_CONFIG)

// Campos de salida cuyo contenido (código, checklists) jamás se trunca
const UNTRUNCATED_COLS = new Set([
  'Code Example Good', 'Code Example Bad', 'Code Good', 'Code Bad',
  'Implementation Checklist', 'Design System Variables', 'CSS Import',
  'Tailwind Config', 'GSAP Snippet',
])
const TRUNCATE_AT = 300

// ============ AUTO-DETECCIÓN DE DOMINIO ============

// Orden fijo de desempate (determinismo, no orden de inserción)
const DOMAIN_TIEBREAK: Record<string, number> = {
  ux: 0, style: 2, color: 3, typography: 4, charts: 6, icons: 8, 'ui-reasoning': 12,
}

function containsPhrase(text: string, phrase: string): boolean {
  if (!/\w/.test(phrase)) return text.includes(phrase)
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'i').test(text)
}

export function detectDomain(query: string): { domain: string; runnerUp: string | null } {
  const queryLower = normalize(query.toLowerCase())
  const scores: Record<string, number> = {}
  for (const [domain, config] of Object.entries(DOMAIN_CONFIG)) {
    let total = 0
    for (const kw of config.keywords) {
      if (containsPhrase(queryLower, kw)) {
        const specificity = Math.max(1, kw.split(/\s+/).length)
        total += 2 * specificity
      }
    }
    scores[domain] = total
  }
  if (/(?<!\w)#[0-9a-f]{3,8}(?!\w)/i.test(queryLower)) {
    scores.color = (scores.color ?? 0) + 2
  }
  const ranked = Object.entries(scores).sort(
    (a, b) => b[1] - a[1] || (DOMAIN_TIEBREAK[a[0]] ?? 999) - (DOMAIN_TIEBREAK[b[0]] ?? 999),
  )
  const [bestDomain, bestScore] = ranked[0]
  const runnerUp = ranked[1] && ranked[1][1] > 0 ? ranked[1][0] : null
  return { domain: bestScore > 0 ? bestDomain : 'style', runnerUp }
}

// ============ REESCRITURA DE QUERY POR DOMINIO ============

function rewriteQueryForDomain(
  query: string,
  domain: string,
  index: Bm25Index,
): { query: string; rewrites: string[] } {
  const config = DOMAIN_CONFIG[domain]
  if (!config) return { query, rewrites: [] }
  const normalized = normalize(query.toLowerCase())
  const vocabulary = new Set(index.vocabulary())
  const rewrites: string[] = []
  const replacementTerms: string[] = []
  for (const keyword of config.keywords) {
    if (!containsPhrase(normalized, keyword)) continue
    if (index.tokenize(keyword).some((t) => vocabulary.has(t))) continue
    const replacement = config.rewrites[keyword]
    if (replacement) {
      rewrites.push(`${keyword}->${replacement}`)
      replacementTerms.push(replacement)
    }
  }
  if (replacementTerms.length === 0) return { query, rewrites }
  return {
    query: `${query} ${[...new Set(replacementTerms)].sort().join(' ')}`,
    rewrites,
  }
}

// ============ SUGERENCIAS (Levenshtein simple, sin difflib) ============

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[b.length]
}

function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1
  const dist = levenshtein(a, b)
  return 1 - dist / Math.max(a.length, b.length)
}

/** Términos del vocabulario más cercanos a la query cuando hubo 0 resultados */
function suggestTerms(index: Bm25Index, query: string, limit = 6): string[] {
  const queryTokens = new Set(index.tokenize(query))
  if (queryTokens.size === 0) return []
  const candidates: Array<{ term: string; sim: number; freq: number }> = []
  for (const term of index.vocabulary()) {
    if (queryTokens.has(term)) continue
    let best = 0
    for (const token of queryTokens) {
      best = Math.max(best, similarity(token, term))
    }
    if (best >= 0.72) candidates.push({ term, sim: best, freq: index.freqOf(term) })
  }
  return candidates
    .sort((a, b) => b.sim - a.sim || b.freq - a.freq || a.term.localeCompare(b.term))
    .slice(0, limit)
    .map((c) => c.term)
}

// ============ BÚSQUEDA ============

export interface SearchResult {
  domain: string
  query: string
  file: string
  count: number
  results: CsvRow[]
  autoDetected?: boolean
  runnerUpDomain?: string | null
  suggestions?: string[]
  /** Nota para el LLM cuando la query no pegó en la base (0 resultados) */
  note?: string
}

function projectRow(row: CsvRow, columns: string[]): CsvRow {
  const out: CsvRow = {}
  for (const col of columns) if (col in row) out[col] = row[col]
  return out
}

/** Identidad pública de un estilo: Style ID / Categoría / Aliases */
function styleIdentities(row: CsvRow): string[] {
  const identities: string[] = []
  for (const field of ['Style ID', 'Style Category', 'Aliases']) {
    const values = field === 'Aliases' ? (row[field] ?? '').split('|') : [row[field] ?? '']
    identities.push(...values.map((v) => v.trim()).filter(Boolean))
  }
  return identities
}

/** Resuelve un estilo por identidad EXACTA (casefold) */
function exactStyleRow(rows: CsvRow[], query: string): CsvRow | null {
  const folded = query.trim().toLowerCase()
  const matches = rows.filter((row) =>
    styleIdentities(row).some((id) => id.toLowerCase() === folded),
  )
  return matches.length === 1 ? matches[0] : null
}

/** Identidad contenida en la query (solo dominio style explícito) */
function containedStyleRow(rows: CsvRow[], query: string): CsvRow | null {
  const folded = query.trim().toLowerCase()
  const queryTokens = new Set(normalize(folded).match(/\w+/g) ?? [])
  const generic = new Set(['app', 'design', 'interface', 'style', 'system', 'ui'])
  const candidates: Array<{ distinct: number; total: number; len: number; row: CsvRow }> = []
  for (const row of rows) {
    for (const identity of styleIdentities(row)) {
      const identityTokens = new Set(normalize(identity.toLowerCase()).match(/\w+/g) ?? [])
      if (identityTokens.size === 0) continue
      const contained = [...identityTokens].every((t) => queryTokens.has(t))
      if (!contained || ![...identityTokens].some((t) => t.length >= 4)) continue
      const distinct = [...identityTokens].filter((t) => !generic.has(t)).length
      candidates.push({ distinct, total: identityTokens.size, len: identity.length, row })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.distinct - a.distinct || b.total - a.total || b.len - a.len)
  const best = candidates[0]
  // El original deduplica POR Style ID (dict): Style ID y Categoría de la
  // MISMA fila son dos candidatos idénticos — cuentan como una sola fila
  const bestRows = new Map<string, CsvRow>()
  for (const c of candidates) {
    if (c.distinct === best.distinct && c.total === best.total && c.len === best.len) {
      bestRows.set(c.row['Style ID'] ?? '', c.row)
    }
  }
  return bestRows.size === 1 ? [...bestRows.values()][0] : null
}

/** Estilo deprecado → padre (Parent Style ID) */
function resolveDeprecated(rows: CsvRow[], matched: CsvRow): { row: CsvRow | null; redirected: boolean } {
  if ((matched.Status || 'active') !== 'deprecated') return { row: matched, redirected: false }
  const parentId = (matched['Parent Style ID'] ?? '').trim()
  if (parentId) {
    const parent = rows.find((r) => r['Style ID'] === parentId)
    return { row: parent ?? null, redirected: false }
  }
  return { row: null, redirected: true }
}

/** Cobertura de la query: fracción de tokens presentes en el vocabulario */
function queryCoverage(index: Bm25Index, query: string): number {
  const tokens = new Set(index.tokenize(query))
  if (tokens.size === 0) return 0
  const vocabulary = new Set(index.vocabulary())
  let hits = 0
  for (const token of tokens) if (vocabulary.has(token)) hits++
  return hits / tokens.size
}

interface DomainSearchOutput {
  results: CsvRow[]
  index: Bm25Index | null
  abstained: boolean
}

function searchDomainRows(
  rows: CsvRow[],
  domain: string,
  query: string,
  maxResults: number,
): DomainSearchOutput {
  const config = DOMAIN_CONFIG[domain]
  if (rows.length === 0) return { results: [], index: null, abstained: true }

  // Estilos: solo filas activas participan del ranking
  const data =
    domain === 'style' ? rows.filter((r) => (r.Status || 'active') === 'active') : rows
  if (data.length === 0) return { results: [], index: null, abstained: true }

  const index = new Bm25Index()
  index.fit(data.map((row) => config.searchCols.map((c) => row[c] ?? '').join(' ')))
  const rewritten = rewriteQueryForDomain(query, domain, index)
  const ranked = index.score(rewritten.query)
  const topScore = ranked[0]?.[1] ?? 0
  const coverage = queryCoverage(index, rewritten.query)
  const abstained = topScore <= config.minScore || coverage < 0

  const results: CsvRow[] = []
  if (!abstained) {
    for (const [idx, score] of ranked.slice(0, maxResults)) {
      if (score <= 0) continue
      results.push(projectRow(data[idx], config.outputCols))
    }
  }
  return { results, index, abstained }
}

/** Búsqueda principal (equivalente a search() de core.py) */
export function searchRows(
  rowsByDomain: Record<string, CsvRow[]>,
  query: string,
  domain?: string,
  maxResults = 3,
): SearchResult {
  const limit = Math.max(1, Math.min(20, Math.floor(maxResults) || 3))
  const autoDetected = domain === undefined
  let runnerUp: string | null = null
  let searchDomain = domain ?? 'style'

  if (domain === undefined) {
    // Atajo de identidad exacta de estilo (como el original)
    const exact = exactStyleRow(rowsByDomain.style ?? [], query)
    if (exact) {
      searchDomain = 'style'
      const config = DOMAIN_CONFIG.style
      const { row } = resolveDeprecated(rowsByDomain.style ?? [], exact)
      if (row) {
        return {
          domain: 'style', query, file: config.file, count: 1,
          results: [projectRow(row, config.outputCols)],
        }
      }
    } else {
      const detected = detectDomain(query)
      searchDomain = detected.domain
      runnerUp = detected.runnerUp
    }
  }
  if (!UX_DOMAINS.includes(searchDomain)) searchDomain = 'style'
  const config = DOMAIN_CONFIG[searchDomain]
  const rows = rowsByDomain[searchDomain] ?? []

  let exactRow: CsvRow | null = null
  if (searchDomain === 'style') {
    // Identidad de estilo (como el original): exacta y contenida se resuelven
    // TANTO en dominio explícito como tras auto-detectar style — "…glassmorphism…"
    // contiene la identidad "glassmorphism" y devuelve ESA fila directamente
    const matched = exactStyleRow(rows, query) ?? containedStyleRow(rows, query)
    if (matched) {
      const { row, redirected } = resolveDeprecated(rows, matched)
      if (row) exactRow = row
      else if (redirected) {
        return {
          domain: searchDomain, query, file: config.file, count: 0, results: [],
          note: 'Este estilo fue redirigido a otro dominio; busca por otras palabras clave.',
        }
      }
    }
  }

  let out: SearchResult
  if (exactRow) {
    out = {
      domain: searchDomain, query, file: config.file, count: 1,
      results: [projectRow(exactRow, config.outputCols)],
    }
  } else {
    const { results, index, abstained } = searchDomainRows(rows, searchDomain, query, limit)
    out = {
      domain: searchDomain, query, file: config.file, count: results.length, results,
    }
    if (autoDetected) {
      out.autoDetected = true
      out.runnerUpDomain = runnerUp
    }
    if (results.length === 0 && index) {
      out.suggestions = suggestTerms(index, query)
      out.note = abstained
        ? 'Sin coincidencias en la base de datos: prueba palabras clave más amplias antes de recurrir a defaults genéricos, y dilo explícitamente.'
        : 'Sin resultados suficientes tras el ranking: prueba otras palabras clave.'
    }
  }

  // Iconos: "lucide" explícito → biblioteca no soportada (como el original)
  if (searchDomain === 'icons' && /(?<!\w)lucide(?!\w)/i.test(normalize(query.toLowerCase()))) {
    out.results = []
    out.count = 0
    out.note = 'Biblioteca no soportada en este catálogo (solo Phosphor/Heroicons).'
  }
  return out
}

// ============ FORMATO DE SALIDA (para el LLM) ============

export function formatResult(result: SearchResult): string {
  const out: string[] = []
  if (result.autoDetected) {
    let domainNote = result.domain
    if (result.runnerUpDomain) domainNote += ` (runner-up: ${result.runnerUpDomain})`
    out.push(`## UI Pro Max Search Results`)
    out.push(`**Domain:** ${domainNote} | **Query:** ${result.query}`)
  } else {
    out.push(`## UI Pro Max Search Results`)
    out.push(`**Domain:** ${result.domain} | **Query:** ${result.query}`)
  }
  out.push(`**Source:** ${result.file} | **Found:** ${result.count} results\n`)
  if (result.count === 0) {
    if (result.note) out.push(result.note)
    if (result.suggestions && result.suggestions.length > 0) {
      out.push(`**Closest known terms:** ${result.suggestions.join(', ')}`)
    }
    return out.join('\n')
  }
  result.results.forEach((row, i) => {
    out.push(`### Result ${i + 1}`)
    for (const [key, value] of Object.entries(row)) {
      let valueStr = String(value)
      if (!UNTRUNCATED_COLS.has(key) && valueStr.length > TRUNCATE_AT) {
        valueStr = valueStr.slice(0, TRUNCATE_AT) + '...'
      }
      out.push(`- **${key}:** ${valueStr}`)
    }
    out.push('')
  })
  return out.join('\n')
}

// La capa de CARGA BAJO DEMANDA (import.meta.glob de Vite) vive en
// uxData.ts para que este módulo siga siendo puro y testeable con Node.
