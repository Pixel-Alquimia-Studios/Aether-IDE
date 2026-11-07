// Verificación de píxeles de los BMPs de instalador (Lote H)
const fs = require("fs")
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log("  OK  " + name)
  else {
    failures++
    console.error("  FAIL  " + name + (detail ? " - " + detail : ""))
  }
}
// BMP 24bpp bottom-up: pitch = (w*3+3)&~3, origen abajo-izquierda
function pixel(buf, w, x, y) {
  const h = buf.readInt32LE(22)
  const pitch = (w * 3 + 3) & ~3
  const row = Math.abs(h) - 1 - y // bottom-up
  const off = 54 + row * pitch + x * 3
  return [buf[off + 2], buf[off + 1], buf[off]] // RGB
}
function isWhite(px) { return px[0] === 255 && px[1] === 255 && px[2] === 255 }
function isDark(px) { return px[0] < 40 && px[1] < 40 && px[2] < 60 }

// wix-dialog: columna izquierda oscura (0..163), blanco (164..)
const d = fs.readFileSync("src-tauri/icons/wix-dialog.bmp")
check("dialog: (10,156) oscuro (columna marca)", isDark(pixel(d, 493, 10, 156)), JSON.stringify(pixel(d, 493, 10, 156)))
check("dialog: (82,156) zona símbolo NO blanca", !isWhite(pixel(d, 493, 82, 156)))
check("dialog: (300,156) BLANCO (zona texto)", isWhite(pixel(d, 493, 300, 156)))
check("dialog: (480,10) BLANCO", isWhite(pixel(d, 493, 480, 10)))
check("dialog: (480,300) BLANCO", isWhite(pixel(d, 493, 480, 300)))
check("dialog: (163,10) oscuro (borde columna)", isDark(pixel(d, 493, 163, 10)))
check("dialog: (164,10) BLANCO (empieza zona texto)", isWhite(pixel(d, 493, 164, 10)))

// wix-banner: blanco con símbolo a la derecha
const b = fs.readFileSync("src-tauri/icons/wix-banner.bmp")
check("banner: (100,29) BLANCO (zona título)", isWhite(pixel(b, 493, 100, 29)))
check("banner: (470,29) NO blanco (símbolo)", !isWhite(pixel(b, 493, 470, 29)))
check("banner: (20,5) BLANCO", isWhite(pixel(b, 493, 20, 5)))
check("banner: (200,50) BLANCO", isWhite(pixel(b, 493, 200, 50)))

// nsis-header: blanco con símbolo pequeño a la izquierda
const h = fs.readFileSync("src-tauri/icons/nsis-header.bmp")
check("header: (28,28) NO blanco (símbolo)", !isWhite(pixel(h, 150, 28, 28)))
check("header: (120,28) BLANCO (lado del texto)", isWhite(pixel(h, 150, 120, 28)))
check("header: (6,3) BLANCO (margen)", isWhite(pixel(h, 150, 6, 3)))

// nsis-sidebar: fondo oscuro completo, símbolo centrado
const s = fs.readFileSync("src-tauri/icons/nsis-sidebar.bmp")
check("sidebar: (82,10) oscuro (fondo marca)", isDark(pixel(s, 164, 82, 10)))
check("sidebar: (82,157) NO blanco (símbolo centrado)", !isWhite(pixel(s, 164, 82, 157)))
check("sidebar: (10,300) oscuro", isDark(pixel(s, 164, 10, 300)))

console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLOS`)
process.exit(failures === 0 ? 0 : 1)
