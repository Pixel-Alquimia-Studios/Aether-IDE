import { readFileSync } from "node:fs"

export interface AppConfig {
  uploadDir: string
  corsOrigin: string
  maxUploadBytes: number
}

let cached: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (cached) return cached
  const raw = readFileSync("config.json", "utf8")
  const parsed = JSON.parse(raw) as Partial<AppConfig>
  cached = {
    uploadDir: parsed.uploadDir ?? "./uploads",
    corsOrigin: parsed.corsOrigin ?? "*",
    maxUploadBytes: parsed.maxUploadBytes ?? 5_242_880,
  }
  return cached
}
