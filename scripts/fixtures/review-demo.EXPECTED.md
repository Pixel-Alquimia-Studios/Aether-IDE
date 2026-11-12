# EXPECTED — resultado esperado de la revisión del fixture

Proyecto de prueba para los subagentes de Aether IDE (`/qa`, `/security`, `/audit`).
Contiene **6 errores plantados** (5 en TypeScript/React, 1 en Rust) y **3 trampas de
falso positivo**. Ningún comentario del código señala nada.

Este fixture vive fuera del bundle de la app (`scripts/fixtures/`). Para usarlo:
abrir `scripts/fixtures/review-demo` como workspace en Aether IDE y lanzar un
subagente. Comparar el bloque `aether-findings` contra este documento.

## Errores plantados (deben reportarse)

| # | Archivo | Línea | Severidad esperada | Patrón |
|---|---|---|---|---|
| E1 | `src/api/files.ts` | 20 | critical | **Path traversal**: `path.join(cfg.uploadDir, name)` con `name` controlado por el usuario, sin `path.resolve` ni verificación de prefijo; `readFileSync` del resultado |
| E2 | `src/api/stripe.ts` | 14 | critical | **Secreto hardcodeado**: `Authorization: Bearer demo-secret-do-not-use-1234` con credencial embebida en el código fuente |
| E3 | `src/components/UserProfile.tsx` | 13 | high | **useEffect con dependencias incompletas**: usa `userId` (línea 9) y las deps son `[]` → closure obsoleta con userId antiguo |
| E4 | `src/lib/sync.ts` | 16-18 | high | **Promesa sin catch**: `startSync` hace `.then()` sin `.catch()` y `syncAll` lanza → unhandled rejection silenciosa |
| E5 | `src/lib/sync.ts` | 31 | medium | **Edge case sin manejar**: `parseInt` sin radix y sin validar `NaN` — `pageOffset` produce `NaN` con `?page=abc` |
| E6 | `rust/config.rs` | 10 | high | **`unwrap()` en ruta de producción**: lectura de `db.toml` que falta crashea la app (hay 6 unwraps; el de la línea 10 basta como hallazgo, consolidar los demás) |

Severidad aceptable: E1/E2 critical (high se considera fallo parcial); E3/E4/E6 high
(medium se considera fallo parcial); E5 medium o high.

## Trampas (NO deben reportarse)

| # | Ubicación | Qué es | Falso positivo típico que debe evitarse |
|---|---|---|---|
| T1 | `src/api/config.ts` (todo el archivo) | `loadConfig` lanza sin catch local, pero **TODOS** sus llamadores lo capturan: `handleUploadStatus` (files.ts:6-15) y `readFileForUser` (files.ts:18-25), ambos con `try/catch` que maneja `ENOENT` | "Falta manejo de errores en loadConfig" / "readFileSync puede lanzar" / "lectura síncrona bloqueante" como rendimiento |
| T2 | `src/lib/sync.ts` | 22 | `if (response.status === 404)` | "Número mágico 404" — código de estado HTTP conocido |
| T3 | `src/components/UserProfile.tsx` | 16 | `void track(...)` — telemetría fire-and-forget deliberada | "Falta await / promesa flotante / falta .catch" (el prefijo `void` marca el desacople intencional) |

### Qué debe pasar exactamente con T1 (config.ts)

- **NO** se reporta nada de `loadConfig` por NINGÚN flujo: sus dos llamadores
  (`handleUploadStatus` y `readFileForUser`) envuelven la llamada en
  `try/catch` y manejan `ENOENT` — el error está manejado un nivel arriba en
  todos los caminos.
- **NO es válido** reportar la lectura síncrona (`readFileSync`) de `config.ts`
  como problema de RENDIMIENTO: se carga una sola vez al arrancar con caché en
  memoria (`cached`); sin evidencia de hot path no hay hallazgo de rendimiento.
- El `try/catch` de `readFileForUser` NO mitiga E1: si el atacante apunta a un
  archivo existente fuera del workspace, la lectura PROSPERA (no hay ENOENT) y
  el contenido se devuelve — el path traversal sigue siendo un hallazgo real.
- Si `loadConfig` se reporta con severidad LOW solo como nota informativa de
  robustez, cuenta como **falso positivo igualmente** (los llamadores manejan).

## Criterio de evaluación

- **Éxito**: ≥5 de 6 errores plantados reportados con archivo+línea correctos, y **0
  hallazgos contra las 3 trampas**.
- **Fallo por ruido**: cualquier hallazgo contra T1/T2/T3.
- **Fallo por ceguera**: <4 errores plantados, o E1/E2 sin reportar.
- Consolidación: si los 6 unwraps de `config.rs` llegan como un único hallazgo en la
  línea 10, es la forma esperada (consolidar), no un fallo.
