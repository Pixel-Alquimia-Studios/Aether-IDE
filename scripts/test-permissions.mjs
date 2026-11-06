import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const perms = await import(pathToFileURL(path.join(root, 'src', 'lib', 'agent', 'permissions.ts')).href)
let failures = 0
function check(name, cond, detail) { if (cond) console.log('  OK  ' + name); else { failures++; console.error('  FAIL  ' + name + (detail ? ' - ' + detail : '')) } }
console.log('== normalizeWorkspaceKey ==')
check('ruta normal', perms.normalizeWorkspaceKey('C:\\Users\\test\\proj') === 'c:/users/test/proj')
check('raiz unidad null', perms.normalizeWorkspaceKey('C:\\') === null)
check('vacia null', perms.normalizeWorkspaceKey('') === null)
console.log('== fail-closed ==')
check('sin entrada ask', perms.getPermissions('C:\\test\\proj').write === 'ask')
const mockStore = {}
globalThis.localStorage = { getItem: function(k) { return mockStore[k] || null }, setItem: function(k, v) { mockStore[k] = v } }
perms.setPermissions('C:\\test\\proj', { write: 'allow', execute: 'safe' })
check('roundtrip allow', perms.getPermissions('C:\\test\\proj').write === 'allow')
check('roundtrip safe', perms.getPermissions('C:\\test\\proj').execute === 'safe')
perms.revokePermissions('C:\\test\\proj')
check('revoke ask', perms.getPermissions('C:\\test\\proj').write === 'ask')
console.log('== isProtectedPath ==')
check('.git/', perms.isProtectedPath('.git/config'))
check('.github/', perms.isProtectedPath('.github/ci.yml'))
check('.vscode/', perms.isProtectedPath('.vscode/settings.json'))
check('.env', perms.isProtectedPath('.env'))
check('.env.local', perms.isProtectedPath('.env.local'))
check('src/main.ts NO', !perms.isProtectedPath('src/main.ts'))
check('.gitignore NO', !perms.isProtectedPath('.gitignore'))
console.log('== isCommandSafe ==')
check('git status', perms.isCommandSafe('git status'))
// Lote G: cat/ls/type/head/tail/wc/dir FUERA de la allowlist — el agente usa
// read_file/list_directory/search_files; estos comandos piden confirmación
check('ls -la NO (fuera de allowlist)', !perms.isCommandSafe('ls -la'))
check('cat README.md NO (fuera de allowlist)', !perms.isCommandSafe('cat README.md'))
check('type archivo NO (fuera de allowlist)', !perms.isCommandSafe('type archivo.txt'))
check('head -5 x NO (fuera de allowlist)', !perms.isCommandSafe('head -5 x'))
check('tail -5 x NO (fuera de allowlist)', !perms.isCommandSafe('tail -5 x'))
check('wc -l x NO (fuera de allowlist)', !perms.isCommandSafe('wc -l x'))
check('dir NO (fuera de allowlist)', !perms.isCommandSafe('dir'))
check('echo hello', perms.isCommandSafe('echo hello'))
check('rm -rf NO', !perms.isCommandSafe('rm -rf /'))
check('npm install NO', !perms.isCommandSafe('npm install'))
check('git push NO', !perms.isCommandSafe('git push origin main'))
check('redirect NO', !perms.isCommandSafe('echo hello > file.txt'))
check('subshell NO', !perms.isCommandSafe('echo $(rm -rf /)'))
check('EncodedCommand NO', !perms.isCommandSafe('powershell -EncodedCommand SGVs'))
check('chain dangerous NO', !perms.isCommandSafe('git status; rm -rf /'))
check('git status && git diff safe', perms.isCommandSafe('git status && git diff'))
check('ls; cat file.txt NO (fuera de allowlist)', !perms.isCommandSafe('ls; cat file.txt'))

console.log('== isCommandSafe: argumentos validados ==')
check('git branch -a safe', perms.isCommandSafe('git branch -a'))
check('git branch --list safe', perms.isCommandSafe('git branch --list'))
check('git branch -v safe', perms.isCommandSafe('git branch -v'))
check('git branch -D x NO', !perms.isCommandSafe('git branch -D x'))
check('git branch new-branch NO', !perms.isCommandSafe('git branch new-branch'))
check('git diff --output=a.txt NO', !perms.isCommandSafe('git diff --output=a.txt'))
check('git diff --ext-diff NO', !perms.isCommandSafe('git diff --ext-diff'))
check('git log --textconv NO', !perms.isCommandSafe('git log --textconv'))
check('git commit NO', !perms.isCommandSafe('git commit -m x'))
check('git push NO', !perms.isCommandSafe('git push'))
check('git add NO', !perms.isCommandSafe('git add .'))
check('date sin args safe', perms.isCommandSafe('date'))
check('date 01-01-2020 NO', !perms.isCommandSafe('date 01-01-2020'))
check('hostname sin args safe', perms.isCommandSafe('hostname'))
check('hostname nuevo NO', !perms.isCommandSafe('hostname nuevo'))
check('pwd sin args safe', perms.isCommandSafe('pwd'))
check('pwd extra NO', !perms.isCommandSafe('pwd extra'))
check('whoami sin args safe', perms.isCommandSafe('whoami'))
check('whoami --help NO', !perms.isCommandSafe('whoami --help'))

console.log('== isProtectedPath: normalización y rutas nuevas ==')
check('.GIT/config (case-insensitive)', perms.isProtectedPath('.GIT/config'))
check('src/../.git/config (resuelve ..)', perms.isProtectedPath('src/../.git/config'))
check('.Git/hooks/pre-commit (backslash)', perms.isProtectedPath('.Git\\hooks\\pre-commit'))
check('.ENV.local (case)', perms.isProtectedPath('.ENV.local'))
check('.husky/ protegida', perms.isProtectedPath('.husky/pre-commit'))
check('.npmrc protegido', perms.isProtectedPath('.npmrc'))
check('.cargo/ protegida', perms.isProtectedPath('.cargo/config.toml'))
check('.gitmodules protegido', perms.isProtectedPath('.gitmodules'))
check('package.json protegido', perms.isProtectedPath('package.json'))
check('src/package.json NO (no es raíz)', !perms.isProtectedPath('src/package.json'))

console.log('== isCommandSafe: contención de rutas (Lote G: fuera de allowlist) ==')
// Con la allowlist reducida, cualquier comando con rutas pide confirmación:
// la contención real la aplican read_file/list_directory/search_files en Rust
const testRoot = 'C:\\test\\proj'
check('cat C:\\Users\\.ssh NO (fuera de allowlist)', !perms.isCommandSafe('cat C:\\Users\\test\\.ssh\\id_rsa', testRoot))
check('cat ../../../etc/passwd NO (fuera de allowlist)', !perms.isCommandSafe('cat ../../../etc/passwd', testRoot))
check('ls /etc NO (fuera de allowlist)', !perms.isCommandSafe('ls /etc', testRoot))
check('cat ~/.bashrc NO (fuera de allowlist)', !perms.isCommandSafe('cat ~/.bashrc', testRoot))
check('cat .env NO (fuera de allowlist)', !perms.isCommandSafe('cat .env', testRoot))
check('cat .git/config NO (fuera de allowlist)', !perms.isCommandSafe('cat .git/config', testRoot))
check('ls node_modules NO (fuera de allowlist)', !perms.isCommandSafe('ls node_modules', testRoot))

console.log('== isCommandSafe: git con rutas protegidas (Lote G) ==')
// La forma rev:ruta y todo lo que sigue a -- que apunten a una ruta
// protegida => ask (estos checks FALLABAN con el código anterior)
check('git show HEAD:.env NO', !perms.isCommandSafe('git show HEAD:.env'))
check('git show :.env NO', !perms.isCommandSafe('git show :.env'))
check('git log -p -- .env NO', !perms.isCommandSafe('git log -p -- .env'))
check('git diff -- .env NO', !perms.isCommandSafe('git diff -- .env'))
check('git diff HEAD -- .git/config NO', !perms.isCommandSafe('git diff HEAD -- .git/config'))
check('git log -p -- package.json NO', !perms.isCommandSafe('git log -p -- package.json'))
check('git show HEAD:src/main.ts safe (no protegida)', perms.isCommandSafe('git show HEAD:src/main.ts'))
check('git log -p -- src/main.ts safe (no protegida)', perms.isCommandSafe('git log -p -- src/main.ts'))
check('git diff -- .en* NO (comodín)', !perms.isCommandSafe('git diff -- .en*'))
check('git show HEAD:.env.local NO (protegida)', !perms.isCommandSafe('git show HEAD:.env.local'))
check('git show HEAD:.GIT/config NO (case)', !perms.isCommandSafe('git show HEAD:.GIT/config'))

console.log('== isCommandSafe: variables y expansiones (req. 2) ==')
check('echo $HOME NO (variable)', !perms.isCommandSafe('echo $HOME'))
check('echo %USERPROFILE% NO (cmd var)', !perms.isCommandSafe('echo %USERPROFILE%'))
check('echo $env:PATH NO (PS env)', !perms.isCommandSafe('echo $env:PATH'))
check('echo ${HOME} NO (brace)', !perms.isCommandSafe('echo ${HOME}'))
check('echo @(ls) NO (PS array)', !perms.isCommandSafe('echo @(ls)'))

console.log('== isCommandSafe: git opciones globales (req. 3) ==')
check('git -c core.x status NO', !perms.isCommandSafe('git -c core.x status'))
check('git --git-dir=/tmp status NO', !perms.isCommandSafe('git --git-dir=/tmp status'))
check('git --no-index diff NO', !perms.isCommandSafe('git --no-index diff'))
check('git --work-tree=/tmp log NO', !perms.isCommandSafe('git --work-tree=/tmp log'))
check('git -p status NO', !perms.isCommandSafe('git -p status'))
check('git diff --no-ext-diff safe', perms.isCommandSafe('git diff --no-ext-diff'))
check('git diff --no-textconv safe', perms.isCommandSafe('git diff --no-textconv'))

console.log('== evaluatePermission ==')
delete globalThis.localStorage
// Lote G: el fail-closed del home exige el home resuelto para el flujo normal
perms.setHomeDir('C:\\Users\\test')
check('write ask auto=false', perms.evaluatePermission('write_file', 'C:\\test\\proj').auto === false)
globalThis.localStorage = { getItem: function() { return JSON.stringify({ workspaces: { 'c:/test/proj': { write: 'allow', execute: 'safe' } } }) }, setItem: function() {} }
check('write allow + normal auto', perms.evaluatePermission('write_file', 'C:\\test\\proj', { relativePath: 'src/main.ts' }).auto === true)
check('write allow + protegida ask', !perms.evaluatePermission('write_file', 'C:\\test\\proj', { relativePath: '.git/config' }).auto)
check('exec safe git status auto', perms.evaluatePermission('execute_command', 'C:\\test\\proj', { command: 'git status' }).auto === true)
check('exec safe rm ask', !perms.evaluatePermission('execute_command', 'C:\\test\\proj', { command: 'rm -rf /' }).auto)
check('exec ask auto false', !perms.evaluatePermission('execute_command', 'C:\\test\\proj2', { command: 'git status' }).auto)
delete globalThis.localStorage

console.log('== isUnsafeWorkspace cableado (Lote G: fallaban antes) ==')
// Sin home resuelto: fail-closed, NADA se auto-aprueba
perms.setHomeDir(null)
globalThis.localStorage = { getItem: function() { return JSON.stringify({ workspaces: { 'c:/test/proj': { write: 'allow', execute: 'safe' } } }) }, setItem: function() {} }
check('sin home: write allow NO auto', !perms.evaluatePermission('write_file', 'C:\\test\\proj', { relativePath: 'src/main.ts' }).auto)
check('sin home: exec safe NO auto', !perms.evaluatePermission('execute_command', 'C:\\test\\proj', { command: 'git status' }).auto)

// Home resuelto: workspace normal auto-aprueba; el HOME y la raíz NUNCA
perms.setHomeDir('C:\\Users\\test')
check('home resuelto: write allow auto', perms.evaluatePermission('write_file', 'C:\\test\\proj', { relativePath: 'src/main.ts' }).auto === true)
check('home resuelto: exec safe auto', perms.evaluatePermission('execute_command', 'C:\\test\\proj', { command: 'git status' }).auto === true)
// El HOME con permisos guardados DE ANTES: 'ask' igualmente
const home = 'C:\\Users\\test'
globalThis.localStorage = { getItem: function() { return JSON.stringify({ workspaces: { 'c:/users/test': { write: 'allow', execute: 'safe' } } }) }, setItem: function() {} }
check('HOME con allow guardado de antes: write ask', !perms.evaluatePermission('write_file', home, { relativePath: 'src/main.ts' }).auto)
check('HOME con safe guardado de antes: exec ask', !perms.evaluatePermission('execute_command', home, { command: 'git status' }).auto)
// setPermissions rechaza conceder sobre el HOME (storage limpio de partida)
const mockStore2 = {}
globalThis.localStorage = {
  getItem: function(k) { return mockStore2[k] ?? null },
  setItem: function(k, v) { mockStore2[k] = v },
}
perms.setPermissions(home, { write: 'allow', execute: 'safe' })
check('setPermissions sobre HOME ignora allow', perms.getPermissions(home).write === 'ask')
check('setPermissions sobre HOME ignora safe', perms.getPermissions(home).execute === 'ask')
// Workspace normal sí se puede conceder
perms.setPermissions('C:\\test\\proj', { write: 'allow', execute: 'safe' })
check('workspace normal: setPermissions funciona', perms.getPermissions('C:\\test\\proj').write === 'allow')
// Raíz de unidad: normalizeWorkspaceKey null → nada se guarda ni auto-aprueba
perms.setPermissions('C:\\', { write: 'allow' })
check('raíz de unidad: sin permisos', perms.getPermissions('C:\\').write === 'ask')
delete globalThis.localStorage
perms.setHomeDir(null)
if (failures > 0) { console.error('Fallos: ' + failures); process.exit(1) }
console.log('Tests de permisos: todos los checks pasaron')
