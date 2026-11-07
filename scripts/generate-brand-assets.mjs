// Generador de brand assets (Lote E, v0.4.0)
// Ejecución: node scripts/generate-brand-assets.mjs
//
// 1. Copia los SVG fuente a assets/brand/source/ (intactos, con C2PA)
// 2. Genera copias derivadas SIN C2PA en assets/brand/
// 3. Genera favicon.svg
// 4. Genera BMPs de instalador (NSIS + WiX) con sharp
// 5. Genera PNGs de vista previa en .brand-previews/ (gitignored)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(ROOT, 'assets', 'brand', 'source')
const BRAND = path.join(ROOT, 'assets', 'brand')
const ICONS = path.join(ROOT, 'src-tauri', 'icons')
const PREVIEWS = path.join(ROOT, '.brand-previews')

// ---- Utilidades ----

function stripC2pa(svg) {
  return svg
    .replace(/ xmlns:c2pa="[^"]*"/g, '')
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
    .replace(/\r\n/g, '\n')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

// ---- 1. Copiar fuentes ----

ensureDir(SOURCE)
for (const name of ['aether-ide-icon.svg', 'aether-ide-logo.svg']) {
  const src = path.join(ROOT, name)
  const dst = path.join(SOURCE, name)
  if (fs.existsSync(src)) fs.copyFileSync(src, dst)
}
console.log('✓ Fuentes copiadas a assets/brand/source/')

// ---- 2. Derivados sin C2PA ----

ensureDir(BRAND)
for (const name of ['aether-ide-icon.svg', 'aether-ide-logo.svg']) {
  const raw = fs.readFileSync(path.join(SOURCE, name), 'utf8')
  const clean = stripC2pa(raw)
  fs.writeFileSync(path.join(BRAND, name), clean, 'utf8')
  if (clean.includes('c2pa') || clean.includes('\uFEFF')) {
    console.error(`  WARN: ${name} aún tiene metadatos`)
  }
}
console.log('✓ Derivados sin C2PA generados en assets/brand/')

// ---- 3. Favicon ----

const iconSvg = fs.readFileSync(path.join(BRAND, 'aether-ide-icon.svg'), 'utf8')
// Favicon: versión simplificada del icono (solo la estrella + gradiente, sin bg rect)
const favicon = iconSvg
  .replace(/<rect[^>]*fill="url\(#bg\)"\/>\s*/g, '') // sin fondo
  .replace(/<circle[^>]*r="96"[^>]*\/>\s*/g, '')      // sin anillo
  .replace('width="256" height="256"', 'width="48" height="48"')
  .replace('viewBox="0 0 256 256"', 'viewBox="52 52 152 152"') // zoom a la estrella
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), favicon, 'utf8')
console.log('✓ favicon.svg actualizado')

// ---- 4. PNG temporal para rasterizar a BMP ----

ensureDir(PREVIEWS)

// Rasteriza el icono a PNGs de vista previa
const iconPng = path.join(PREVIEWS, 'icon.png')
await sharp(path.join(BRAND, 'aether-ide-icon.svg'), { density: 300 })
  .resize(256, 256)
  .png()
  .toFile(iconPng)

for (const size of [16, 32, 256]) {
  await sharp(iconPng).resize(size, size).png().toFile(path.join(PREVIEWS, `icon-${size}.png`))
}
console.log('✓ PNGs de vista previa del icono')

// ---- 5. BMPs de instalador ----

// Función para convertir PNG → BMP 24bpp sin alfa
async function pngToBmp24(pngBuffer, width, height, outputPath) {
  const { data } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // BMP 24bpp: filas alineadas a 4 bytes, orden BGR, bottom-up
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const headerSize = 54
  const fileSize = headerSize + pixelDataSize

  const bmp = Buffer.alloc(fileSize, 0)

  // BITMAPFILEHEADER (14 bytes)
  bmp.write('BM', 0)
  bmp.writeUInt32LE(fileSize, 2)
  bmp.writeUInt32LE(0, 6) // reserved
  bmp.writeUInt32LE(headerSize, 10)

  // BITMAPINFOHEADER (40 bytes)
  bmp.writeUInt32LE(40, 14)
  bmp.writeInt32LE(width, 18)
  bmp.writeInt32LE(height, 22) // positivo = bottom-up
  bmp.writeUInt16LE(1, 26) // planes
  bmp.writeUInt16LE(24, 28) // bits per pixel
  bmp.writeUInt32LE(0, 30) // compression = BI_RGB
  bmp.writeUInt32LE(pixelDataSize, 34)
  bmp.writeInt32LE(2835, 38) // horizontal ppm
  bmp.writeInt32LE(2835, 42) // vertical ppm
  bmp.writeUInt32LE(0, 46)
  bmp.writeUInt32LE(0, 50)

  // Pixeles (bottom-up, BGR)
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y // bottom-up
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * 4 // RGBA
      const dstIdx = headerSize + y * rowSize + x * 3
      bmp[dstIdx] = data[srcIdx + 2] // B
      bmp[dstIdx + 1] = data[srcIdx + 1] // G
      bmp[dstIdx + 2] = data[srcIdx] // R
    }
  }

  fs.writeFileSync(outputPath, bmp)
}

// ---- 5. BMPs de instalador (composición por zonas, sin estirar el símbolo) ----
// WiX pinta el texto del asistente en NEGRO: el dialog reserva su columna
// izquierda (164 px) para el arte de marca y el banner coloca el símbolo a la
// derecha (el título va a la izquierda). NSIS MUI2 dibuja el header a la
// izquierda (sin MUI_HEADERIMAGE_RIGHT) y el título a la derecha del bitmap.

// Símbolo Aether (estrella + anillo + punto) SIN el rect de fondo del icono:
// así se puede centrar sobre cualquier fondo conservando la proporción.
function symbolMarkup(x, y, size) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 256 256">
    <defs>
      <linearGradient id="symg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#A78BFA"/>
        <stop offset="0.55" stop-color="#7C6CF5"/>
        <stop offset="1" stop-color="#3B82F6"/>
      </linearGradient>
    </defs>
    <circle cx="128" cy="128" r="96" fill="none" stroke="url(#symg)" stroke-width="3" opacity="0.35"/>
    <path d="M128 48 Q128 128 208 128 Q128 128 128 208 Q128 128 48 128 Q128 128 128 48 Z" fill="url(#symg)"/>
    <circle cx="196" cy="60" r="7" fill="#A78BFA"/>
  </svg>`
}

const BRAND_DARK = '#0C0D1C'

// Cada composición es un SVG completo (fondo + zonas de marca + símbolo
// anidado con viewBox, que escala el contenido SIN deformarlo)
const INSTALLER_COMPOSITIONS = [
  {
    // WiX dialog: arte SOLO en la columna izquierda de 164 px; el resto blanco
    // para el texto negro del asistente (493x312 requerido por WiX)
    name: 'wix-dialog',
    width: 493,
    height: 312,
    out: path.join(ICONS, 'wix-dialog.bmp'),
    label: 'WiX dialog',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="493" height="312">
      <rect width="493" height="312" fill="#FFFFFF"/>
      <rect x="0" y="0" width="164" height="312" fill="${BRAND_DARK}"/>
      ${symbolMarkup(16, 90, 132)}
    </svg>`,
  },
  {
    // WiX banner: fondo blanco, símbolo de 44 px pegado al borde derecho
    // (el título del diálogo se pinta en negro a la izquierda)
    name: 'wix-banner',
    width: 493,
    height: 58,
    out: path.join(ICONS, 'wix-banner.bmp'),
    label: 'WiX banner',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="493" height="58">
      <rect width="493" height="58" fill="#FFFFFF"/>
      ${symbolMarkup(449, 7, 44)}
    </svg>`,
  },
  {
    // NSIS header: fondo blanco con el símbolo pequeño a la IZQUIERDA
    // (MUI2 sin MUI_HEADERIMAGE_RIGHT: título del asistente a la derecha)
    name: 'nsis-header',
    width: 150,
    height: 57,
    out: path.join(ICONS, 'nsis-header.bmp'),
    label: 'NSIS header',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57">
      <rect width="150" height="57" fill="#FFFFFF"/>
      ${symbolMarkup(6, 6.5, 44)}
    </svg>`,
  },
  {
    // NSIS sidebar: sin cambios (fondo de marca completo, sin texto encima)
    // - símbolo centrado con proporción intacta
    name: 'nsis-sidebar',
    width: 164,
    height: 314,
    out: path.join(ICONS, 'nsis-sidebar.bmp'),
    label: 'NSIS sidebar',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314">
      <rect width="164" height="314" fill="${BRAND_DARK}"/>
      ${symbolMarkup(16, 90, 132)}
    </svg>`,
  },
]

for (const comp of INSTALLER_COMPOSITIONS) {
  const pngBuffer = await sharp(Buffer.from(comp.svg)).png().toBuffer()
  await pngToBmp24(pngBuffer, comp.width, comp.height, comp.out)
  const size = fs.statSync(comp.out).size
  console.log(`✓ ${comp.label}: ${path.basename(comp.out)} (${comp.width}x${comp.height}, ${(size / 1024).toFixed(1)} KB)`)
}

// ---- 6. Preview de pantalla de carga ----
// (la pantalla de carga es HTML — generamos un PNG de referencia con sharp)
const loadScreenSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
  <rect width="1280" height="800" fill="#16161d"/>
  <g transform="translate(600, 340)">
    <circle cx="40" cy="40" r="36" fill="none" stroke="#A78BFA" stroke-width="1.5" opacity="0.35"/>
    <path d="M40 8 Q40 40 72 40 Q40 40 40 72 Q40 40 8 40 Q40 40 40 8 Z" fill="#A78BFA"/>
    <circle cx="56" cy="16" r="3" fill="#A78BFA"/>
  </g>
  <text x="640" y="440" text-anchor="middle" fill="#e0e0e8" font-family="system-ui, sans-serif" font-size="17" font-weight="600">Aether IDE</text>
  <rect x="586" y="460" width="108" height="3" rx="2" fill="#262731"/>
  <rect x="586" y="460" width="43" height="3" rx="2" fill="#a78bfa"/>
  <text x="640" y="490" text-anchor="middle" fill="#7c7e92" font-family="system-ui, sans-serif" font-size="11">preparando el editor…</text>
</svg>`
await sharp(Buffer.from(loadScreenSvg)).png().toFile(path.join(PREVIEWS, 'loading-screen.png'))
console.log('✓ Preview de pantalla de carga')

// ---- 7. Maquetas del instalador (bitmap compuesto + texto negro del asistente) ----
// Cada maqueta simula la ventana del instalador REAL: el bitmap en su sitio y
// el texto negro que WiX/NSIS pinta encima, para validar la legibilidad.

// Textos simulados del asistente (los que dibujan WiX/NSIS)
function mockFont(size, weight = 400, color = '#000000') {
  return `font-family="Segoe UI, system-ui, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}"`
}

// WiX dialog (Welcome): arte a la izquierda, título y párrafo NEGRO a la derecha
const wixDialogMock = `<svg xmlns="http://www.w3.org/2000/svg" width="493" height="312">
  ${INSTALLER_COMPOSITIONS[0].svg.replace('<svg xmlns="http://www.w3.org/2000/svg" width="493" height="312">', '').replace('</svg>', '')}
  <text x="180" y="60" ${mockFont(16, 600)}>Welcome to the Aether IDE</text>
  <text x="180" y="84" ${mockFont(16, 600)}>Setup Wizard</text>
  <text x="180" y="130" ${mockFont(11, 400, '#333333')}>The installer will guide you through the steps</text>
  <text x="180" y="148" ${mockFont(11, 400, '#333333')}>required to install Aether IDE 0.4.0 on your computer.</text>
  <text x="180" y="176" ${mockFont(11, 400, '#333333')}>WARNING: This program is protected by copyright law.</text>
</svg>`

// WiX banner: título negro a la izquierda, símbolo a la derecha (sin solape)
const wixBannerMock = `<svg xmlns="http://www.w3.org/2000/svg" width="493" height="58">
  ${INSTALLER_COMPOSITIONS[1].svg.replace('<svg xmlns="http://www.w3.org/2000/svg" width="493" height="58">', '').replace('</svg>', '')}
  <text x="12" y="26" ${mockFont(12, 600)}>Aether IDE Setup</text>
  <text x="12" y="44" ${mockFont(9, 400, '#555555')}>Installing Aether IDE. This may take several minutes.</text>
</svg>`

// NSIS header: ventana simulada - bitmap a la izquierda, título negro a la derecha
const nsisHeaderMock = `<svg xmlns="http://www.w3.org/2000/svg" width="502" height="337">
  <rect width="502" height="337" fill="#FFFFFF"/>
  ${INSTALLER_COMPOSITIONS[2].svg.replace('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57">', '').replace('</svg>', '')}
  <text x="166" y="24" ${mockFont(11, 600)}>Aether IDE Setup</text>
  <text x="166" y="42" ${mockFont(9, 400, '#555555')}>Choose components</text>
  <rect x="0" y="57" width="502" height="1" fill="#D4D4D8"/>
  <text x="24" y="110" ${mockFont(11, 400)}>Choose the components you want to install.</text>
  <rect x="330" y="290" width="75" height="26" fill="#F4F4F5" stroke="#D4D4D8"/>
  <text x="348" y="307" ${mockFont(10, 400)}>Cancel</text>
  <rect x="413" y="290" width="75" height="26" fill="#F4F4F5" stroke="#D4D4D8"/>
  <text x="432" y="307" ${mockFont(10, 400)}>Next</text>
</svg>`

// NSIS sidebar (Welcome): bitmap a la izquierda SIN texto encima, texto a la derecha
const nsisSidebarMock = `<svg xmlns="http://www.w3.org/2000/svg" width="502" height="355">
  <rect width="502" height="355" fill="#FFFFFF"/>
  ${INSTALLER_COMPOSITIONS[3].svg.replace('<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314">', '').replace('</svg>', '')}
  <text x="188" y="50" ${mockFont(13, 600)}>Welcome to the Aether IDE</text>
  <text x="188" y="72" ${mockFont(13, 600)}>Setup Wizard</text>
  <text x="188" y="110" ${mockFont(10, 400, '#333333')}>This wizard will guide you through the installation</text>
  <text x="188" y="128" ${mockFont(10, 400, '#333333')}>of Aether IDE 0.4.0.</text>
  <text x="188" y="156" ${mockFont(10, 400, '#333333')}>It is recommended that you close all other applications</text>
  <text x="188" y="174" ${mockFont(10, 400, '#333333')}>before starting Setup.</text>
  <rect x="188" y="300" width="90" height="30" fill="#F4F4F5" stroke="#D4D4D8"/>
  <text x="212" y="319" ${mockFont(10, 400)}>Cancel</text>
  <rect x="290" y="300" width="90" height="30" fill="#F4F4F5" stroke="#D4D4D8"/>
  <text x="322" y="319" ${mockFont(10, 400)}>Next</text>
</svg>`

// Las maquetas sustituyen a las previews planas (que no reflejaban el texto)
for (const old of ['nsis-header-preview.png', 'nsis-sidebar-preview.png', 'wix-banner-preview.png', 'wix-dialog-preview.png']) {
  const oldPath = path.join(PREVIEWS, old)
  if (fs.existsSync(oldPath)) fs.rmSync(oldPath)
}
await sharp(Buffer.from(wixDialogMock)).png().toFile(path.join(PREVIEWS, 'wix-dialog-mock.png'))
await sharp(Buffer.from(wixBannerMock)).png().toFile(path.join(PREVIEWS, 'wix-banner-mock.png'))
await sharp(Buffer.from(nsisHeaderMock)).png().toFile(path.join(PREVIEWS, 'nsis-header-mock.png'))
await sharp(Buffer.from(nsisSidebarMock)).png().toFile(path.join(PREVIEWS, 'nsis-sidebar-mock.png'))
console.log('✓ Maquetas del instalador con texto del asistente (4)')

console.log('\nTodos los brand assets generados. Previews en .brand-previews/')
