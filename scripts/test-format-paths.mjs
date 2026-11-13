// Test de formatDisplayPath y resolvePath (0.4.1-B, rutas)
// Ejecución: node scripts/test-format-paths.mjs
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fmt = await import(pathToFileURL(path.join(root, 'src', 'lib', 'workspace', 'format.ts')).href)
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log(`  OK  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

console.log('== formatDisplayPath (SOLO display, nunca clave ni comparación) ==')
check('verbatim: \\\\?\\C:\\x → C:\\x', fmt.formatDisplayPath('\\\\?\\C:\\x') === 'C:\\x')
check('UNC: \\\\?\\UNC\\srv\\share → \\\\srv\\share', fmt.formatDisplayPath('\\\\?\\UNC\\srv\\share') === '\\\\srv\\share')
check('ruta normal sin cambios', fmt.formatDisplayPath('C:\\Users\\test\\proj') === 'C:\\Users\\test\\proj')
check('POSIX sin cambios', fmt.formatDisplayPath('/home/user/proj') === '/home/user/proj')
check('mezcla de barras sin cambios (solo quita prefijo)', fmt.formatDisplayPath('C:/Users\\test') === 'C:/Users\\test')
check('vacío → vacío', fmt.formatDisplayPath('') === '')
check('relativa sin prefijo sin cambios', fmt.formatDisplayPath('src/main.ts') === 'src/main.ts')

console.log('== resolvePath: "" y "." y "./" son la raíz ==')
const ROOT = 'C:\\Users\\test\\proj'
check('vacío → raíz', fmt.resolvePath('', ROOT) === ROOT)
check('"." → raíz', fmt.resolvePath('.', ROOT) === ROOT)
check('"./" → raíz', fmt.resolvePath('./', ROOT) === ROOT)
check('"./  " con espacios → raíz', fmt.resolvePath('  ./  ', ROOT) === ROOT)
check('relativa normal', fmt.resolvePath('src/main.ts', ROOT) === 'C:\\Users\\test\\proj/src/main.ts')
check('relativa con backslash', fmt.resolvePath('src\\main.ts', ROOT) === 'C:\\Users\\test\\proj/src\\main.ts')

console.log('== resolvePath: "/" NO es la raíz ==')
check('"/" pasa tal cual (Rust la rechaza si sale)', fmt.resolvePath('/', ROOT) === '/')
check('"/etc" pasa tal cual', fmt.resolvePath('/etc', ROOT) === '/etc')

console.log('== resolvePath: prefijo \\\\?\\ normalizado ==')
check(
  '\\\\?\\ dentro del workspace → sin prefijo, tal cual (Rust lo contiene)',
  fmt.resolvePath('\\\\?\\C:\\Users\\test\\proj\\src\\main.ts', ROOT) === 'C:\\Users\\test\\proj\\src\\main.ts',
)
check(
  '\\\\?\\ fuera del workspace → sin prefijo, tal cual (Rust la rechaza)',
  fmt.resolvePath('\\\\?\\C:\\Windows\\system32\\config', ROOT) === 'C:\\Windows\\system32\\config',
)
check(
  '\\\\?\\UNC → \\\\UNC normalizada',
  fmt.resolvePath('\\\\?\\UNC\\srv\\share\\file.txt', ROOT) === '\\\\srv\\share\\file.txt',
)

console.log('== resolvePath: absolutas pasan tal cual (la contención es de Rust) ==')
check('absoluta con drive', fmt.resolvePath('C:\\other\\file.ts', ROOT) === 'C:\\other\\file.ts')
check('.." relativo pasa tal cual (Rust lo rechaza)', fmt.resolvePath('..\\outside.ts', ROOT) === 'C:\\Users\\test\\proj/..\\outside.ts')

console.log(
  '\nNOTA: la contención REAL de rutas la aplica Rust (ensure_in_workspace con canonicalize,' +
    ' probada en cargo test). resolvePath no la salta: solo normaliza y resuelve contra la raíz.',
)
console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
