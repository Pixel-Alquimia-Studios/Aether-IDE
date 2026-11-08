---
name: typescript-patterns
description: Patrones de error típicos en TypeScript/React/Node: type safety, async correcto, manejo de errores, patrones idiomáticos y React/hooks
applies_to: [qa, audit]
languages: [typescript]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/typescript-reviewer.md -->

## Patrones CRITICAL (seguridad)

- **Inyección vía `eval`/`new Function`**: input de usuario a ejecución dinámica — nunca ejecutar strings no confiables.
- **XSS**: input sin sanear en `innerHTML`, `dangerouslySetInnerHTML`, `document.write`.
- **Inyección SQL/NoSQL**: concatenación de strings en queries — usar queries parametrizadas u ORM.
- **Path traversal**: input de usuario en `fs.readFile`/`path.join` sin `path.resolve` + validación de prefijo.
- **Secretos hardcodeados**: API keys/tokens/passwords en el código fuente.
- **Prototype pollution**: merge de objetos no confiables sin `Object.create(null)` ni validación de esquema.
- **`child_process` con input de usuario** sin validación ni allowlist antes de `exec`/`spawn`.

## Patrones HIGH (type safety)

- **`any` sin justificación**: desactiva el type checking — usar `unknown` y estrechar, o un tipo preciso.
- **Non-null assertion abusiva**: `value!` sin guard previo — añadir check de runtime.
- **`as` que silencia errores**: castear a tipos sin relación para callar el compilador — arreglar el tipo.
- **tsconfig debilitado**: si se toca la config y se afloja la strictness, señalarlo explícitamente.

## Patrones HIGH (correctitud async)

- **Promesas sin `await`/`.catch()`** (floating promises): funciones async llamadas sin manejo de rechazo.
- **`await` secuenciales de trabajo independiente**: awaits dentro de loops que podrían correr en paralelo — usar `Promise.all`.
- **Floating promises en handlers**: fire-and-forget sin manejo de errores en event handlers o constructores.
- **`array.forEach(async fn)` NO espera** — usar `for...of` o `Promise.all`.

## Patrones HIGH (manejo de errores)

- **Errores tragados**: `catch` vacíos o `catch (e) {}` sin acción.
- **`JSON.parse` sin try/catch**: lanza con input inválido — siempre envolver.
- **`throw "string"`**: siempre `throw new Error("...")`.
- **Error boundaries ausentes**: árboles React sin `<ErrorBoundary>` alrededor de subtrees async/de datos.

## Patrones HIGH (idiomáticos)

- **Estado mutable compartido**: variables mutables a nivel de módulo — preferir datos inmutables y funciones puras.
- **`var`**: usar `const` por defecto, `let` solo si hay reasignación.
- **Return types implícitos**: funciones públicas con tipo de retorno explícito.
- **Async por callbacks**: mezclar callbacks con async/await — estandarizar en promesas.
- **`==` en vez de `===`**: igualdad estricta en todo el código.

## Patrones HIGH (Node.js)

- **fs síncrono en request handlers**: `fs.readFileSync` bloquea el event loop — usar variantes async.
- **Validación en boundaries ausente**: datos externos sin validación de esquema (zod, joi, yup).
- **`process.env` sin validar**: acceso sin fallback ni validación al arrancar.
- **`require()` en contexto ESM**: mezclar sistemas de módulos sin intención clara.

## Patrones MEDIUM (React/Next.js)

- **Dependencias incompletas**: `useEffect`/`useCallback`/`useMemo` con deps parciales — regla exhaustive-deps.
- **Mutación de estado**: mutar state directamente en vez de devolver objetos nuevos.
- **`key={index}`** en listas dinámicas — usar IDs estables.
- **`useEffect` para estado derivado**: calcular los valores derivados durante el render, no en efectos.
- **Fuga de límites server/client**: importar módulos server-only en componentes cliente (Next.js).

## Patrones MEDIUM (performance)

- **Objetos/arrays creados en render**: objetos inline como props causan re-renders — elevar o memoizar.
- **N+1 queries**: llamadas a DB/API dentro de loops — agrupar o `Promise.all`.
- **Memoización ausente**: `React.memo`/`useMemo` en cálculos o componentes caros.
- **Imports de bundle grande**: `import _ from 'lodash'` — imports concretos o alternativas tree-shakeables.

## Patrones MEDIUM (buenas prácticas)

- **`console.log` en código de producción**: usar un logger estructurado.
- **Números/strings mágicos**: constantes nombradas o enums.
- **Optional chaining profundo sin fallback**: `a?.b?.c?.d` sin default — añadir `?? fallback`.
- **Nombres inconsistentes**: camelCase para variables/funciones, PascalCase para tipos/clases/componentes.

## Ejemplo de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"medium","file":"src/lib/ai/api.ts","line":112,"title":"forEach async no espera","detail":"list.forEach(async (p) => await fetch(p)) no espera las promesas; el código continúa antes de completar. Usar for...of o Promise.all(list.map(...))."}]}
```
