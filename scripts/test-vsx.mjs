// Verificación del parser ARREGLADO (mappings top-level + normalización de rutas)
import { unzipSync } from 'fflate'

const meta = await fetch('https://open-vsx.org/api/PKief/material-icon-theme').then((r) => r.json())
const vsix = await fetch(meta.files.download).then((r) => r.arrayBuffer())
const files = unzipSync(new Uint8Array(vsix))

let themePath = null
for (const [path, content] of Object.entries(files)) {
  if (!path.toLowerCase().endsWith('package.json')) continue
  try {
    const pkg = JSON.parse(new TextDecoder().decode(content))
    const itp = pkg?.contributes?.iconThemes?.[0]?.path
    if (itp) {
      themePath = path.replace(/package\.json$/i, '') + itp.replace(/^\.\//, '')
      break
    }
  } catch {}
}

const theme = JSON.parse(new TextDecoder().decode(files[themePath]))
const iconDefs = theme.iconDefinitions ?? {}
const fileExtensions = theme.fileExtensions ?? {}
const fileNames = theme.fileNames ?? {}
const folderNames = theme.folderNames ?? {}

function resolveVsixPath(baseDir, relativePath) {
  const segments = []
  for (const segment of `${baseDir}${relativePath.replace(/^\.\//, '')}`.split('/')) {
    if (segment === '..') segments.pop()
    else if (segment !== '' && segment !== '.') segments.push(segment)
  }
  return segments.join('/')
}

function fileIcon(name) {
  const lower = name.toLowerCase()
  const byName = fileNames[lower]
  if (byName && iconDefs[byName]) return iconDefs[byName]
  const ext = lower.includes('.') ? lower.split('.').pop() : undefined
  const byExt = ext ? fileExtensions[ext] : undefined
  if (byExt && iconDefs[byExt]) return iconDefs[byExt]
  return null
}

function folderIcon(name) {
  const lower = name.toLowerCase()
  const byName = folderNames[lower]
  if (byName && iconDefs[byName]) return iconDefs[byName]
  return iconDefs['_folder'] ?? iconDefs['folder'] ?? null
}

// Pruebas: los casos exactos del usuario
const tests = ['index.html', 'package.json', 'Cargo.toml', '.env', 'main.ts', 'App.tsx', 'README.md']
console.log('--- Archivos ---')
for (const name of tests) {
  const def = fileIcon(name)
  if (!def) {
    console.log(`${name}: SIN ICONO (fallback glyph)`)
    continue
  }
  const full = resolveVsixPath(themePath.replace(/[^/]+$/, ''), def.iconPath)
  const svg = files[full]
  console.log(`${name}: ${def.iconPath} → ${full} | svg: ${svg ? 'OK (' + svg.length + ' bytes)' : 'FALTA'}`)
}

console.log('--- Carpetas ---')
for (const name of ['src', 'src-tauri', '.git', 'node_modules']) {
  const def = folderIcon(name)
  if (!def) {
    console.log(`${name}: SIN ICONO`)
    continue
  }
  const full = resolveVsixPath(themePath.replace(/[^/]+$/, ''), def.iconPath)
  const svg = files[full]
  console.log(`${name}: ${full} | svg: ${svg ? 'OK' : 'FALTA'}`)
}

console.log('--- Resumen ---')
console.log('iconDefs con SVG resoluble:',
  Object.entries(iconDefs).filter(([, d]) => {
    const full = resolveVsixPath(themePath.replace(/[^/]+$/, ''), d?.iconPath ?? '')
    return !!files[full]
  }).length,
  '/', Object.keys(iconDefs).length,
)
