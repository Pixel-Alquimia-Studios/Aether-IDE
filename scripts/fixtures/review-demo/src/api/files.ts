import { readFileSync } from "node:fs"
import path from "node:path"
import { loadConfig } from "./config"

export function handleUploadStatus(name: string): { exists: boolean; size: number } | null {
  try {
    const cfg = loadConfig()
    const target = path.join(cfg.uploadDir, name, "status.json")
    const stat = readFileSync(target)
    return { exists: true, size: stat.byteLength }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

export function readFileForUser(name: string): string | null {
  try {
    const cfg = loadConfig()
    const target = path.join(cfg.uploadDir, name)
    return readFileSync(target, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}
