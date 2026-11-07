// Comprobaciones del análisis CSP (Lote H): estilos runtime de xterm y lado del header NSIS
const fs = require("fs")

// 1. xterm: cuántos estilos runtime crea
const xterm = fs.readFileSync("node_modules/@xterm/xterm/lib/xterm.js", "utf8")
const styleCreate = (xterm.match(/createElement\(['"]style['"]\)/g) || []).length
const insertRule = (xterm.match(/insertRule/g) || []).length
console.log("xterm createElement(style):", styleCreate)
console.log("xterm insertRule:", insertRule)

// 2. lado del header NSIS en el installer.nsi generado
const nsi = fs.readFileSync("src-tauri/target/release/nsis/x64/installer.nsi", "utf8")
const lines = nsi.split("\n")
lines.forEach((l, i) => {
  if (/MUI_HEADERIMAGE|MUI_WELCOMEFINISHPAGE/.test(l)) {
    console.log(`nsi:${i + 1}: ${l.trim().slice(0, 100)}`)
  }
})
