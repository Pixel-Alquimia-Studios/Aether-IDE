import { unzipSync } from 'fflate'
import { create } from 'zustand'

// Integración de Open VSX (Fase 0.1.3): descarga el Material Icon Theme
// (PKief/material-icon-theme — única extensión autorizada por la whitelist),
// extrae sus SVG y el mapeo de file/folder names desde el VSIX, y los cachea
// en localStorage. Fallback silencioso: sin iconos → glyphs del Explorer.

const EXTENSION_ID = 'PKief/material-icon-theme'
const WHITELIST = new Set([EXTENSION_ID])
const VSX_API = 'https://open-vsx.org/api'
// v2: el parser antiguo guardaba mappings vacíos (rutas sin normalizar)
// v3: incluye folderNamesExpanded (carpetas abiertas)
const LS_KEY = 'aether-ide-material-icons-v3'

export interface MaterialIconsData {
  version: string
  /** Nombre de icono del theme → contenido SVG */
  icons: Record<string, string>
  /** Extensión de archivo (sin punto, lowercase) → nombre de icono */
  fileExtensions: Record<string, string>
  /** Nombre de archivo exacto (lowercase) → nombre de icono */
  fileNames: Record<string, string>
  /** Nombre de carpeta (lowercase) → nombre de icono */
  folderNames: Record<string, string>
  /** Nombre de carpeta → icono cuando está EXPANDIDA */
  folderNamesExpanded: Record<string, string>
}

interface VsxState {
  data: MaterialIconsData | null
  loading: boolean
  error: string | null

  load: () => Promise<void>
  /** Elimina el theme instalado: el Explorer vuelve a los iconos por defecto */
  uninstall: () => void
}

function readCache(): MaterialIconsData | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as MaterialIconsData
    // Cache inválido si no tiene iconos reales (parser antiguo)
    if (Object.keys(data.icons ?? {}).length === 0) return null
    return data
  } catch {
    return null
  }
}

/** Resuelve rutas relativas del VSIX (normaliza ../ y ./) */
function resolveVsixPath(baseDir: string, relativePath: string): string {
  const segments: string[] = []
  for (const segment of `${baseDir}${relativePath.replace(/^\.\//, '')}`.split('/')) {
    if (segment === '..') {
      segments.pop()
    } else if (segment !== '' && segment !== '.') {
      segments.push(segment)
    }
  }
  return segments.join('/')
}

function persistCache(data: MaterialIconsData): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch {
    // Cuota excedida: los iconos simplemente no se cachean
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export const useVsxStore = create<VsxState>()((set, get) => ({
  data: readCache(),
  loading: false,
  error: null,

  // Desinstala el theme: limpia el cache y el Explorer vuelve a los glyphs
  uninstall: () => {
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      // localStorage no disponible
    }
    set({ data: null, loading: false, error: null })
  },

  load: async () => {
    if (get().loading || get().data) return

    set({ loading: true, error: null })
    try {
      // 1. Whitelist: solo extensiones autorizadas
      if (!WHITELIST.has(EXTENSION_ID)) {
        throw new Error(`Extensión no autorizada: ${EXTENSION_ID}`)
      }

      // 2. Metadatos de Open VSX → URL de descarga del VSIX
      const meta = (await fetch(`${VSX_API}/${EXTENSION_ID}`).then((r) => {
        if (!r.ok) throw new Error(`Open VSX respondió HTTP ${r.status}`)
        return r.json()
      })) as { version?: string; files?: { download?: string } }
      const downloadUrl = meta?.files?.download
      if (!downloadUrl) throw new Error('VSIX no disponible en Open VSX')

      // 3. Descargar y descomprimir el VSIX (zip)
      const vsix = await fetch(downloadUrl).then((r) => {
        if (!r.ok) throw new Error(`Descarga del VSIX falló (HTTP ${r.status})`)
        return r.arrayBuffer()
      })
      const files = unzipSync(new Uint8Array(vsix))

      // 4. Localizar el JSON del icon theme vía package.json (contributes)
      let themePath: string | null = null
      for (const [path, content] of Object.entries(files)) {
        if (!path.toLowerCase().endsWith('package.json')) continue
        try {
          const pkg = JSON.parse(decode(content)) as {
            contributes?: { iconThemes?: Array<{ path?: string }> }
          }
          const iconThemePath = pkg?.contributes?.iconThemes?.[0]?.path
          if (iconThemePath) {
            const dir = path.replace(/package\.json$/i, '')
            themePath = `${dir}${iconThemePath.replace(/^\.\//, '')}`
            break
          }
        } catch {
          continue
        }
      }
      if (!themePath || !files[themePath]) {
        throw new Error('Tema de iconos no encontrado en el VSIX')
      }
      const theme = JSON.parse(decode(files[themePath])) as {
        iconDefinitions?: Record<string, { iconPath?: string }>
        // Material Icon Theme v5+: mappings en top-level del JSON
        fileExtensions?: Record<string, string>
        fileNames?: Record<string, string>
        folderNames?: Record<string, string>
        folderNamesExpanded?: Record<string, string>
        // Compat con schema clásico de VS Code (otros themes)
        file?: { fileExtensions?: Record<string, string>; fileNames?: Record<string, string> }
        folder?: { folderNames?: Record<string, string> }
      }

      // 5. Mappings: top-level (material-icon-theme v5) con fallback al schema clásico
      const iconDefs = theme.iconDefinitions ?? {}
      const fileExtensions = theme.fileExtensions ?? theme.file?.fileExtensions ?? {}
      const fileNames = theme.fileNames ?? theme.file?.fileNames ?? {}
      const folderNames = theme.folderNames ?? theme.folder?.folderNames ?? {}
      const folderNamesExpanded = theme.folderNamesExpanded ?? {}

      // 6. Cargar los SVG referenciados, normalizando ../ y ./ de los iconPath
      const icons: Record<string, string> = {}
      const svgCache: Record<string, string> = {}
      for (const [name, definition] of Object.entries(iconDefs)) {
        const iconPath = definition?.iconPath
        if (!iconPath) continue
        const fullPath = resolveVsixPath(
          themePath.replace(/[^/]+$/, ''),
          iconPath,
        )
        if (svgCache[fullPath] === undefined) {
          const raw = files[fullPath]
          svgCache[fullPath] = raw ? decode(raw) : ''
        }
        if (svgCache[fullPath]) icons[name] = svgCache[fullPath]
      }
      if (Object.keys(icons).length === 0) {
        throw new Error('El theme no contiene iconos SVG utilizables')
      }

      const data: MaterialIconsData = {
        version: meta.version ?? 'unknown',
        icons,
        fileExtensions,
        fileNames,
        folderNames,
        folderNamesExpanded,
      }
      persistCache(data)
      set({ data, loading: false, error: null })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
}))

const dataUrlCache = new Map<string, string>()

/** Convierte un SVG del theme en data URL para <img /> */
export function svgToDataUrl(svg: string): string {
  let url = dataUrlCache.get(svg)
  if (!url) {
    url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    dataUrlCache.set(svg, url)
  }
  return url
}

/** Icono Material para un archivo (por nombre exacto o extensión) o null */
export function getMaterialFileIcon(
  fileName: string,
  data: MaterialIconsData | null,
): string | null {
  if (!data) return null
  const lower = fileName.toLowerCase()

  const byName = data.fileNames[lower]
  if (byName && data.icons[byName]) return data.icons[byName]

  const ext = lower.includes('.') ? lower.split('.').pop() : undefined
  if (ext) {
    const byExt = data.fileExtensions[ext]
    if (byExt && data.icons[byExt]) return data.icons[byExt]
  }
  return null
}

/** Icono Material para una carpeta (por nombre, con variante expandida) o null */
export function getMaterialFolderIcon(
  folderName: string,
  expanded: boolean,
  data: MaterialIconsData | null,
): string | null {
  if (!data) return null
  const lower = folderName.toLowerCase()

  // Variante de carpeta EXPANDIDA (material: folderNamesExpanded)
  if (expanded) {
    const byExpanded = data.folderNamesExpanded?.[lower]
    if (byExpanded && data.icons[byExpanded]) return data.icons[byExpanded]
  }

  const byName = data.folderNames?.[lower]
  if (byName && data.icons[byName]) return data.icons[byName]

  // Iconos base del theme (expandido → variante open si existe)
  if (expanded) {
    const openBase = data.icons['_folder_open'] ?? data.icons['folder-open']
    if (openBase) return openBase
  }
  return data.icons['_folder'] ?? data.icons['folder'] ?? null
}

// --- Marketplace (búsqueda y detalle vía API pública de Open VSX) ---

export interface VsxSearchResult {
  name: string
  namespace: string
  displayName?: string
  description?: string
  version?: string
  downloadCount?: number
  iconUrl?: string
}

export interface VsxExtensionDetail extends VsxSearchResult {
  publisher?: string
  readme?: string
  downloadUrl?: string
}

/** Whitelist: extensiones autorizadas para instalarse en Aether IDE */
export function isWhitelisted(namespace: string, name: string): boolean {
  return WHITELIST.has(`${namespace}/${name}`)
}

interface VsxSearchApiItem {
  name?: string
  namespace?: string
  displayName?: string
  description?: string
  version?: string
  downloadCount?: number
  files?: { icon?: string }
}

/** Búsqueda pública en Open VSX ordenada por descargas */
export async function searchVsx(query: string): Promise<VsxSearchResult[]> {
  const url = `${VSX_API}/-/search?query=${encodeURIComponent(query)}&size=20&sort=downloads`
  const json = (await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Open VSX respondió HTTP ${r.status}`)
    return r.json()
  })) as { extensions?: VsxSearchApiItem[] }

  return (json.extensions ?? []).map((ext) => ({
    name: ext.name ?? '',
    namespace: ext.namespace ?? '',
    displayName: ext.displayName,
    description: ext.description,
    version: ext.version,
    downloadCount: ext.downloadCount,
    iconUrl: ext.files?.icon,
  }))
}

/** Detalle de una extensión: README, versión, autor e icono oficial */
export async function fetchVsxDetail(
  namespace: string,
  name: string,
): Promise<VsxExtensionDetail> {
  const json = (await fetch(`${VSX_API}/${namespace}/${name}`).then((r) => {
    if (!r.ok) throw new Error(`Open VSX respondió HTTP ${r.status}`)
    return r.json()
  })) as {
    name?: string
    namespace?: string
    displayName?: string
    description?: string
    version?: string
    downloadCount?: number
    publisher?: { name?: string; displayName?: string }
    files?: { icon?: string; readme?: string; download?: string }
  }

  let readme: string | undefined
  const readmeUrl = json?.files?.readme
  if (readmeUrl) {
    try {
      readme = await fetch(readmeUrl).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
    } catch {
      readme = undefined
    }
  }

  return {
    name: json.name ?? name,
    namespace: json.namespace ?? namespace,
    displayName: json.displayName,
    description: json.description,
    version: json.version,
    downloadCount: json.downloadCount,
    iconUrl: json.files?.icon,
    publisher: json.publisher?.displayName ?? json.publisher?.name,
    readme,
    downloadUrl: json.files?.download,
  }
}
