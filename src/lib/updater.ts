import { check, type Update } from '@tauri-apps/plugin-updater'

// Sistema de actualizaciones (Fase G): comprueba en Open VSX/GitHub al abrir,
// muestra botón si hay update, y overlay con progreso al instalar.

export interface UpdateInfo {
  version: string
  notes?: string
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  if (!('__TAURI_INTERNALS__' in window)) return null
  try {
    const update = await check()
    if (update) {
      return { version: update.version, notes: update.body ?? undefined }
    }
  } catch {
    // Sin conexión o updater no configurado: silencioso
  }
  return null
}

export type { Update }
