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
check('ls -la', perms.isCommandSafe('ls -la'))
check('cat README.md', perms.isCommandSafe('cat README.md'))
check('echo hello', perms.isCommandSafe('echo hello'))
check('rm -rf NO', !perms.isCommandSafe('rm -rf /'))
check('npm install NO', !perms.isCommandSafe('npm install'))
check('git push NO', !perms.isCommandSafe('git push origin main'))
check('redirect NO', !perms.isCommandSafe('echo hello > file.txt'))
check('subshell NO', !perms.isCommandSafe('echo $(rm -rf /)'))
check('EncodedCommand NO', !perms.isCommandSafe('powershell -EncodedCommand SGVs'))
check('chain dangerous NO', !perms.isCommandSafe('git status; rm -rf /'))
check('git status && git diff safe', perms.isCommandSafe('git status && git diff'))
console.log('== evaluatePermission ==')
delete globalThis.localStorage
check('write ask auto=false', perms.evaluatePermission('write_file', 'C:\\test\\proj').auto === false)
globalThis.localStorage = { getItem: function() { return JSON.stringify({ workspaces: { 'c:/test/proj': { write: 'allow', execute: 'safe' } } }) }, setItem: function() {} }
check('write allow + normal auto', perms.evaluatePermission('write_file', 'C:\\test\\proj', { relativePath: 'src/main.ts' }).auto === true)
check('write allow + protegida ask', !perms.evaluatePermission('write_file', 'C:\\test\\proj', { relativePath: '.git/config' }).auto)
check('exec safe git status auto', perms.evaluatePermission('execute_command', 'C:\\test\\proj', { command: 'git status' }).auto === true)
check('exec safe rm ask', !perms.evaluatePermission('execute_command', 'C:\\test\\proj', { command: 'rm -rf /' }).auto)
check('exec ask auto false', !perms.evaluatePermission('execute_command', 'C:\\test\\proj2', { command: 'git status' }).auto)
delete globalThis.localStorage
if (failures > 0) { console.error('Fallos: ' + failures); process.exit(1) }
console.log('Tests de permisos: todos los checks pasaron')
