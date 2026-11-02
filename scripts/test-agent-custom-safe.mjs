// Test de cableado (Lote F 0.3a): ninguna tool del agente puede modificar la
// URL o la key del proveedor personalizado, ni ninguna key en general
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log('  OK  ' + name)
  else {
    failures++
    console.error('  FAIL  ' + name + (detail ? ' - ' + detail : ''))
  }
}

// 1. Los comandos invoke de tools.ts están en una allowlist de solo-lectura
//    + escritura controlada de archivos/terminal
const toolsSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'agent', 'tools.ts'), 'utf8')
const invoked = [...toolsSrc.matchAll(/invoke(?:WithRetry)?[<(][^'"]*['"]([a-z_]+)['"]/gi)].map(
  (m) => m[1],
)
const ALLOWED_AGENT_COMMANDS = new Set([
  'read_file',
  'read_file_range',
  'search_files',
  'read_dir',
  'file_exists',
  'write_file',
  'execute_command',
])
check('tools.ts invoca comandos', invoked.length >= 6, JSON.stringify(invoked))
for (const cmd of invoked) {
  check(`comando permitido: ${cmd}`, ALLOWED_AGENT_COMMANDS.has(cmd))
}

// 2. NADA del código del agente puede tocar keychain o la URL del custom
const FORBIDDEN = [
  'set_api_key',
  'delete_api_key',
  'set_custom_base_url',
  'get_custom_base_url',
  'saveApiKey',
  'deleteApiKey',
  'saveCustomBaseUrl',
  'getCustomBaseUrl',
  'set_custom_base',
]
const agentDir = path.join(root, 'src', 'lib', 'agent')
const agentFiles = fs.readdirSync(agentDir).filter((f) => f.endsWith('.ts'))
for (const f of agentFiles) {
  const src = fs.readFileSync(path.join(agentDir, f), 'utf8')
  for (const bad of FORBIDDEN) {
    check(`${f} no referencia ${bad}`, !src.includes(bad))
  }
}

// 3. AGENT_TOOLS es una lista cerrada con las 6 tools conocidas
//    (se extraen por regex del source: el archivo usa alias "@/..." que node
//    no resuelve, así que no se importa directamente)
const toolNames = [...toolsSrc.matchAll(/^\s+name: '([a-z_]+)',$/gm)].map((m) => m[1]).sort()
check(
  'AGENT_TOOLS = 6 tools de solo FS/comandos',
  JSON.stringify(toolNames) ===
    JSON.stringify([
      'design_search',
      'execute_command',
      'list_directory',
      'read_file',
      'search_files',
      'write_file',
    ]),
  JSON.stringify(toolNames),
)

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
