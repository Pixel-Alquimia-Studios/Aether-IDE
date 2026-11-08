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
| E1 | `src/api/files.ts` | 19 | critical | **Path traversal**: `path.join(cfg.uploadDir, name)` con `name` controlado por el usuario, sin `path.resolve` ni verificación de prefijo; `readFileSync` del resultado |
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
| T1 | `src/api/config.ts` (todo el archivo) | `loadConfig` lanza sin catch local, pero su llamador `handleUploadStatus` (files.ts:7-17) lo envuelve en `try/catch` | "Falta manejo de errores en loadConfig" / "readFileSync puede lanzar" |
| T2 | `src/lib/sync.ts` | 22 | `if (response.status === 404)` | "Número mágico 404" — código de estado HTTP conocido |
| T3 | `src/components/UserProfile.tsx` | 16 | `void track(...)` — telemetría fire-and-forget deliberada | "Falta await / promesa flotante" (el prefijo `void` marca el desacople intencional) |

Nota T1: `readFileForUser` (files.ts:19-21) NO envuelve a `loadConfig`; si se reporta
ese punto concreto como edge case real, es válido — la trampa es reportar **config.ts**
por el flujo de `handleUploadStatus`.

## Criterio de evaluación

- **Éxito**: ≥5 de 6 errores plantados reportados con archivo+línea correctos, y **0
  hallazgos contra las 3 trampas**.
- **Fallo por ruido**: cualquier hallazgo contra T1/T2/T3.
- **Fallo por ceguera**: <4 errores plantados, o E1/E2 sin reportar.
- Consolidación: si los 6 unwraps de `config.rs` llegan como un único hallazgo en la
  línea 10, es la forma esperada (consolidar), no un fallo.
