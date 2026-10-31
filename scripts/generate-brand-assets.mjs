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

async function generateInstallerImage(svgFile, width, height, outputPath, label) {
  // Rasteriza el SVG al tamaño exacto con fondo oscuro
  const pngBuffer = await sharp(svgFile, { density: 300 })
    .resize(width, height, { fit: 'contain', background: '#0C0D1C' })
    .flatten({ background: '#0C0D1C' })
    .png()
    .toBuffer()

  await pngToBmp24(pngBuffer, width, height, outputPath)
  const size = fs.statSync(outputPath).size
  console.log(`✓ ${label}: ${path.basename(outputPath)} (${width}x${height}, ${(size / 1024).toFixed(1)} KB)`)
}

// NSIS
await generateInstallerImage(
  path.join(BRAND, 'aether-ide-icon.svg'), 150, 57,
  path.join(ICONS, 'nsis-header.bmp'), 'NSIS header',
)
await generateInstallerImage(
  path.join(BRAND, 'aether-ide-icon.svg'), 164, 314,
  path.join(ICONS, 'nsis-sidebar.bmp'), 'NSIS sidebar',
)

// WiX (MSI)
ensureDir(ICONS)
await generateInstallerImage(
  path.join(BRAND, 'aether-ide-icon.svg'), 493, 58,
  path.join(ICONS, 'wix-banner.bmp'), 'WiX banner',
)
await generateInstallerImage(
  path.join(BRAND, 'aether-ide-icon.svg'), 493, 312,
  path.join(ICONS, 'wix-dialog.bmp'), 'WiX dialog',
)

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

// ---- 7. Preview de BMPs de instalador (desde el SVG, no desde el BMP) ----
const installerPreviews = [
  ['nsis-header', 150, 57], ['nsis-sidebar', 164, 314],
  ['wix-banner', 493, 58], ['wix-dialog', 493, 312],
]
for (const [name, w, h] of installerPreviews) {
  await sharp(path.join(BRAND, 'aether-ide-icon.svg'), { density: 300 })
    .resize(w, h, { fit: 'contain', background: '#0C0D1C' })
    .flatten({ background: '#0C0D1C' })
    .png()
    .toFile(path.join(PREVIEWS, `${name}-preview.png`))
}
console.log('✓ Previews de instalador')

console.log('\nTodos los brand assets generados. Previews en .brand-previews/')
