// Segunda pasada: elimina los duplicados que quedan en ES después de terms.accept
const fs = require('fs')
let raw = fs.readFileSync('src/lib/i18n.ts', 'utf8')

const marker = "'terms.accept': 'Aceptar y continuar',"
const subagentsMarker = '  // Subagentes'
const esAcceptIdx = raw.indexOf(marker)
if (esAcceptIdx === -1) {
  console.log('ES terms.accept no encontrado')
  process.exit(0)
}
const afterAccept = raw.slice(esAcceptIdx + marker.length)
const subIdx = afterAccept.indexOf(subagentsMarker)
if (subIdx === -1) {
  console.log('Subagentes marker no encontrado')
  process.exit(0)
}
const dupBlock = afterAccept.slice(0, subIdx)
if (!dupBlock.includes('settings.')) {
  console.log('Sin duplicados en ES')
  process.exit(0)
}
console.log('ES: eliminando bloque duplicado de', dupBlock.split('\n').length, 'líneas')
const cleaned = raw.slice(0, esAcceptIdx + marker.length) + '\n' + afterAccept.slice(subIdx)
fs.writeFileSync('src/lib/i18n.ts', cleaned)
console.log('OK')
