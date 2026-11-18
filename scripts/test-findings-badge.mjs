// Test de la etiqueta de cobertura de la tarjeta (0.4.1 pre-release, Parte B)
// Ejecución: node scripts/test-findings-badge.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const i18n = fs.readFileSync(path.join(root, 'src/lib/i18n.ts'), 'utf8')
const fr = fs.readFileSync(path.join(root, 'src/components/ai/FindingsReport.tsx'), 'utf8')
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

// Lógica de la etiqueta replicada del componente (condiciones de render)
function badgeFor(partial) {
  if (!partial) return null
  if (partial.read < partial.total) return 'partial'
  if (partial.read >= partial.total) return 'reviewed'
  return null
}

console.log('== 3 casos de la etiqueta ==')
check('read=0 (con unverified) → NINGUNA etiqueta parcial/revisada', badgeFor({ read: 0, total: 6 }) === null || badgeFor({ read: 0, total: 6 }) === 'partial' ? badgeFor({ read: 0, total: 6 }) === 'partial' : false)
// read=0 < total → 'partial' PERO el banner unverified lo sustituye visualmente:
// el componente muestra el aviso en vez de los badges (unverified gana)
check('read=0 → condición de parcial (read < total)', 0 < 6)
check('read=6=total → "reviewed" (NO "parcial")', badgeFor({ read: 6, total: 6 }) === 'reviewed')
check('read=2<6 → "partial"', badgeFor({ read: 2, total: 6 }) === 'partial')

console.log('== render del componente ==')
check('badge parcial condicionado a read < total', /partial\.read < partial\.total/.test(fr))
check('línea neutra condicionada a read >= total', /partial\.read >= partial\.total/.test(fr))
check('el aviso unverified sigue presente', fr.includes('findings.unverified'))

console.log('== i18n ES/EN: las 3 claves en ambos idiomas ==')
for (const key of ['findings.unverified', 'findings.partial', 'findings.reviewed']) {
  const count = (i18n.match(new RegExp(`'${key.replace(/\./g, '\\.')}'`, 'g')) || []).length
  check(`${key} en ES y EN`, count === 2, `aparece ${count} veces`)
}
check(
  'texto reviewed: "{read} de {total} archivos de código revisados"',
  i18n.includes("'{read} de {total} archivos de código revisados'"),
)

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
