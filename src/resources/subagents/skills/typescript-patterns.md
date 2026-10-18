---
name: typescript-patterns
description: Patrones de error típicos en TypeScript/React: type safety, async correcto, hooks y manejo de errores
applies_to: [qa, audit]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/typescript-reviewer.md -->

## Patrones CRITICAL (seguridad)

- **Inyección vía `eval`/`new Function`**: input de usuario a ejecución dinámica.
- **XSS**: input sin sanear en `innerHTML`, `dangerouslySetInnerHTML`, `document.write`.
- **Path traversal**: input de usuario en `fs.readFile`/`path.join` sin `path.resolve` +
  validación de prefijo.
- **Secretos hardcodeados**: API keys/tokens/passwords en el código fuente.
- **`child_process` con input de usuario** sin validación ni allowlist.

## Patrones HIGH (correctitud)

- **Type safety**: `any` sin justificación (usar `unknown` y estrechar), `value!` sin
  guard previo, `as` que silencia errores reales, config de tsconfig debilitada.
- **Async**: promesas sin `await`/`.catch()` (floating promises), `await` secuenciales
  de trabajo independiente (usar `Promise.all`), `array.forEach(async fn)` NO espera —
  usar `for...of` o `Promise.all`.
- **Errores**: `catch` vacío, `JSON.parse` sin try/catch, `throw "string"` en vez de
  `throw new Error`.
- **React**: `useEffect`/`useCallback` con dependencias incompletas (closures viejas),
  mutación directa de estado, `key={index}` en listas dinámicas, setState tras unmount.

## Ejemplo de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"medium","file":"src/lib/ai/api.ts","line":112,"title":"forEach async no espera","detail":"list.forEach(async (p) => await fetch(p)) no espera las promesas; el código continúa antes de completar. Usar for...of o Promise.all(list.map(...))."}]}
```
