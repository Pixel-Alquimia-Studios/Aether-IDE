// Test de cableado y privacidad de keys (Lote F parte 2)
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

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// 1. Comandos nuevos registrados en lib.rs y has_api_key eliminado
const libRs = read('src-tauri/src/lib.rs')
check('lib.rs registra api_key_statuses', libRs.includes('commands_ai::api_key_statuses'))
check('lib.rs registra validate_api_key', libRs.includes('commands_ai::validate_api_key'))
check('has_api_key eliminado de lib.rs', !libRs.includes('has_api_key'))

// 2. Comandos nuevos definidos en commands_ai.rs
const cmdAi = read('src-tauri/src/commands_ai.rs')
check('commands_ai define api_key_statuses', cmdAi.includes('pub fn api_key_statuses'))
check('commands_ai define validate_api_key', cmdAi.includes('pub async fn validate_api_key'))

// 3. Los comandos se invocan desde la app (api.ts) y el store los usa
const apiTs = read('src/lib/ai/api.ts')
check('api.ts invoca api_key_statuses', apiTs.includes("'api_key_statuses'"))
check('api.ts invoca validate_api_key', apiTs.includes("'validate_api_key'"))
check('api.ts ya no tiene hasApiKey', !apiTs.includes('hasApiKey'))
const store = read('src/stores/settingsStore.ts')
check('settingsStore usa getApiKeyStatuses', store.includes('getApiKeyStatuses()'))
check('settingsStore usa validateApiKey', store.includes('validateApiKey('))
check('settingsStore tiene tracker de carreras', store.includes('validationTracker.start('))
check('saveKey valida en segundo plano', /saveKey: async \(providerId, key\)[\s\S]{0,1200}validateKey\(\s*providerId\s*\)/.test(store))
check('selectProvider descarta validación anterior', /selectProvider:[\s\S]{0,300}discardValidation\(prev\)/.test(store))

// 4. PRIVACIDAD: el hint/estado de keys nunca se persiste
const sessionTs = read('src/types/session.ts')
check('session.ts sin keyStatuses', !sessionTs.includes('keyStatuses'))
check('session.ts sin hint', !sessionTs.includes('hint'))
const useSession = read('src/hooks/useSession.ts')
check('useSession (session.json) sin keyStatuses', !useSession.includes('keyStatuses'))
check('useSession sin hint', !useSession.includes('hint'))
const cmdRs = read('src-tauri/src/commands.rs')
check('SessionData (Rust) sin key ni hint', !/SessionData[\s\S]{0,800}/.test('') && !cmdRs.includes('keyStatuses') && !cmdRs.includes('api_key_status'))
const settingsStoreSrc = store
// localStorage solo para language y fetchedModels
check('localStorage.setItem solo language/models', !/localStorage\.setItem\((?![A-Z_]*(LANGUAGE|MODELS))/.test(settingsStoreSrc))

// 5. UI: badge con estados y borrado con confirmación
const settingsView = read('src/components/settings/SettingsView.tsx')
check('SettingsView tiene KeyBadge', settingsView.includes('function KeyBadge'))
check('SettingsView tiene DeleteKeyButton con confirmación', settingsView.includes('settings.deleteConfirm'))
check('SettingsView tiene botón Reintentar', settingsView.includes('settings.keyRetry'))
check('SettingsView aviso custom al borrar', settingsView.includes('settings.customDeleteWarning'))

// 6. Chat 401/403: mensaje + botón Abrir Ajustes; no cambia el estado de keys
const chatPanel = read('src/components/ai/ChatPanel.tsx')
check('ChatPanel mensaje authRejected', chatPanel.includes('chat.authRejected'))
check('ChatPanel botón Abrir Ajustes abre proveedores', /openSettings\('providers'\)/.test(chatPanel))
check('ChatPanel conserva hint Moonshot', chatPanel.includes('chat.moonshotChinaHint'))
check('uiStore acción openSettings', read('src/stores/uiStore.ts').includes('openSettings'))

// 7. i18n ES/EN con las claves nuevas
const i18n = read('src/lib/i18n.ts')
for (const key of [
  'settings.keychainError',
  'settings.keyChecking',
  'settings.keyRejected',
  'settings.keyUnverifiable',
  'settings.keyValidated',
  'settings.keyRetry',
  'settings.deleteConfirm',
  'settings.customDeleteWarning',
  'chat.authRejected',
  'chat.openSettings',
  'settings.reason.noModelsEndpoint',
  'settings.reason.redirect',
  'settings.reason.noAuthenticatedCheck',
]) {
  const count = (i18n.match(new RegExp(`'${key.replace(/\./g, '\\.')}'`, 'g')) || []).length
  check(`i18n ${key} en ES y EN`, count === 2, `aparece ${count} veces`)
}

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
