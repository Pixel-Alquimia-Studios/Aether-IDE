// Fuzzy matching por subsecuencia con puntuación simple (MVP Fase 1.4).
// Devuelve null si `query` no es subsecuencia de `text`; mayor score = mejor match.
export function fuzzyScore(query: string, text: string): number | null {
  if (query.length === 0) return 0

  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const wordStarts = new Set(['/', '\\', ' ', '.', '-', '_'])

  let qi = 0
  let score = 0
  let prevIndex = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue
    score += 1
    if (ti === prevIndex + 1) score += 2
    if (ti === 0 || wordStarts.has(t[ti - 1])) score += 3
    prevIndex = ti
    qi++
  }

  if (qi < q.length) return null
  score += Math.max(0, 10 - Math.floor(t.length / 10))
  return score
}
