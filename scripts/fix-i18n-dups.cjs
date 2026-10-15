// Limpia duplicados en i18n.ts (fix de sesiones de edición concurrentes)
const fs = require('fs')
const raw = fs.readFileSync('src/lib/i18n.ts', 'utf8')

// 1. Eliminar duplicados del EN (después de terms.accept hasta StatusBar)
const enTermsAccept = "'terms.accept': 'Accept and continue',"
const enStatusBar = "  // StatusBar"
const enStart = raw.indexOf(enTermsAccept)
const enStatusIdx = raw.indexOf(enStatusBar, enStart)
if (enStart !== -1 && enStatusIdx !== -1) {
  const dupEn = raw.slice(enStart + enTermsAccept.length, enStatusIdx)
  if (dupEn.includes('settings.noProvider')) {
    const before = raw.slice(0, enStart + enTermsAccept.length)
    const after = raw.slice(enStatusIdx)
    console.log('EN: eliminados', (dupEn.match(/\n/g) || []).length, 'líneas duplicadas')
    var cleaned = before + '\n' + after
  } else {
    var cleaned = raw
  }
} else {
  var cleaned = raw
}

// 2. Eliminar duplicados del ES (después de terms.accept: 'Aceptar y continuar' hasta // Subagentes)
const esTermsAccept = "'terms.accept': 'Aceptar y continuar',"
const esSubagents = "  // Subagentes"
const esStart = cleaned.indexOf(esTermsAccept)
const esSubIdx = cleaned.indexOf(esSubagents, esStart)
if (esStart !== -1 && esSubIdx !== -1) {
  const dupEs = cleaned.slice(esStart + esTermsAccept.length, esSubIdx)
  if (dupEs.includes('settings.noProvider') || dupEs.includes('settings.activeModel')) {
    const before2 = cleaned.slice(0, esStart + esTermsAccept.length)
    const after2 = cleaned.slice(esSubIdx)
    console.log('ES: eliminados', (dupEs.match(/\n/g) || []).length, 'líneas duplicadas')
    cleaned = before2 + '\n' + after2
  } else {
    console.log('ES: sin duplicados')
  }
}

fs.writeFileSync('src/lib/i18n.ts', cleaned)
console.log('i18n.ts limpiado')
