// Verificador de la CSP de Aether IDE (Lote H): valida que tauri.conf.json
// permita lo que Monaco y xterm necesitan en producción SIN relajar script-src.
//
// IMPORTANTE: este script SOLO valida la CONFIGURACIÓN declarada, no el
// resultado compilado — la CSP real que sirve Tauri incluye nonces/hashes
// inyectados en compile-time (verifica el build instalado con el checklist
// manual que imprime scripts/verify-release.ps1).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

const security = conf.app?.security ?? {}
const csp = security.csp ?? ''
const directive = (name) => {
  const m = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`, 'i').exec(csp)
  return m ? m[1].trim() : null
}

console.log('== CSP: directivas presentes ==')
check('csp definida', csp.length > 0)
const styleSrc = directive('style-src')
const scriptSrc = directive('script-src')
const fontSrc = directive('font-src')
const imgSrc = directive('img-src')
const defaultSrc = directive('default-src')
const workerSrc = directive('worker-src')
check('style-src definida', styleSrc !== null, styleSrc ?? '(ausente)')
check('script-src definida', scriptSrc !== null, scriptSrc ?? '(ausente)')
check('font-src definida', fontSrc !== null, fontSrc ?? '(ausente)')

console.log('== CSP: estilo (Monaco/xterm inyectan <style> en runtime) ==')
check(
  "style-src contiene 'unsafe-inline'",
  styleSrc?.includes("'unsafe-inline'") === true,
  styleSrc ?? '',
)
check(
  "style-src-elem/attr NO definidas por separado (si lo estuvieran, deberían permitir 'unsafe-inline' y añadirse a dangerousDisableAssetCspModification)",
  directive('style-src-elem') === null && directive('style-src-attr') === null,
)
check(
  "style-src SIN nonces/hashes inyectados a mano en la config",
  !/nonce-|sha\d+-/.test(styleSrc ?? ''),
)

console.log('== CSP: script se queda estricto ==')
check(
  "script-src SIN 'unsafe-inline'",
  scriptSrc?.includes("'unsafe-inline'") !== true,
  scriptSrc ?? '',
)
check(
  "script-src SIN 'unsafe-eval'",
  scriptSrc?.includes("'unsafe-eval'") !== true,
  scriptSrc ?? '',
)
check(
  'script-src SIN blob:/data: (los workers viajan como archivos same-origin)',
  !/blob:|data:/.test(scriptSrc ?? ''),
)

console.log('== CSP: workers de Monaco (Vite los emite como archivos same-origin) ==')
const workerCovered = (workerSrc ?? defaultSrc ?? '').includes("'self'")
check('worker-src o default-src cubren worker-src con self', workerCovered)

console.log('== CSP: fuentes (codicon.ttf es un asset same-origin) ==')
check("font-src contiene 'self'", fontSrc?.includes("'self'") === true, fontSrc ?? '')
check('font-src contiene data: (por si alguna fuente viaja embebida)', fontSrc?.includes('data:') === true)

console.log('== CSP: imágenes ==')
check("img-src contiene 'self'", imgSrc?.includes("'self'") === true, imgSrc ?? '')
check('img-src contiene data: (ImageViewer usa read_file_base64)', imgSrc?.includes('data:') === true)

console.log('== dangerousDisableAssetCspModification ==')
const disabled = security.dangerousDisableAssetCspModification
check(
  "desactiva la modificación de Tauri SOLO para style-src",
  Array.isArray(disabled) && disabled.length === 1 && disabled[0] === 'style-src',
  JSON.stringify(disabled),
)

console.log(
  failures === 0
    ? '\nCSP OK: configuración compatible con Monaco/xterm. (Solo valida la CONFIGURACIÓN —' +
        ' el resultado compilado se verifica con el checklist manual del release: abrir un archivo' +
        ' en el build instalado y ver los colores.)'
    : `\n${failures} FALLOS`,
)
process.exit(failures === 0 ? 0 : 1)
