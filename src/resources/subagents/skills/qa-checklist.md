---
name: qa-checklist
description: Checklist de revisión de calidad completa por prioridad, con ejemplos BAD/GOOD, falsos positivos típicos de revisores LLM y addendum para código generado por IA
applies_to: [qa, audit]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/code-reviewer.md -->

## Checklist de revisión (por prioridad)

### Seguridad en el código (CRITICAL) — siempre se reporta

- **Credenciales hardcodeadas** — API keys, passwords, tokens, connection strings en el código fuente
- **Inyección SQL** — concatenación de strings en queries en vez de queries parametrizadas
- **XSS** — input de usuario sin escapar en HTML/JSX
- **Path traversal** — rutas controladas por el usuario sin canonizar
- **CSRF** — endpoints que cambian estado sin protección CSRF
- **Bypass de autenticación** — rutas protegidas sin check de auth
- **Dependencias inseguras** — paquetes con vulnerabilidades conocidas
- **Secretos en logs** — logging de tokens, passwords o PII

```typescript
// BAD: inyección SQL por concatenación
const query = `SELECT * FROM users WHERE id = ${userId}`;

// GOOD: query parametrizada
const query = `SELECT * FROM users WHERE id = $1`;
const result = await db.query(query, [userId]);
```

```typescript
// BAD: renderizar HTML de usuario sin sanear
<div dangerouslySetInnerHTML={{ __html: userComment }} />

// GOOD: texto plano o saneado (DOMPurify o equivalente)
<div>{userComment}</div>
```

### Calidad de código (HIGH)

- **Funciones grandes** (>50 líneas) — dividir en funciones enfocadas
- **Archivos enormes** (>800 líneas) — extraer módulos por responsabilidad
- **Nesting profundo** (>4 niveles) — early returns y helpers
- **Errores sin manejar** — promesas rechazadas sin catch, catch vacíos
- **Patrones de mutación** — preferir operaciones inmutables (spread, map, filter)
- **console.log** — eliminar logging de debug antes del merge
- **Tests faltantes** — rutas de código nuevas sin cobertura
- **Código muerto** — código comentado, imports sin uso, ramas inalcanzables

```typescript
// BAD: nesting profundo + mutación
function processUsers(users) {
  if (users) {
    for (const user of users) {
      if (user.active) {
        if (user.email) {
          user.verified = true;  // mutación!
          results.push(user);
        }
      }
    }
  }
  return results;
}

// GOOD: early returns + inmutabilidad + plano
function processUsers(users) {
  if (!users) return [];
  return users
    .filter(user => user.active && user.email)
    .map(user => ({ ...user, verified: true }));
}
```

### Patrones React/Next.js (HIGH) — cuando aplique

- **Arrays de dependencias incompletos** — `useEffect`/`useMemo`/`useCallback` con deps que faltan
- **setState durante el render** — provoca bucles infinitos
- **Keys de lista con índice** — `key={index}` cuando los items pueden reordenarse
- **Prop drilling** — props atravesando 3+ niveles (usar context o composición)
- **Re-renders innecesarios** — memoización faltante en cálculos caros
- **Closures obsoletas** — handlers que capturan estado viejo
- **Estados de carga/error ausentes** — fetching sin UI de respaldo

```tsx
// BAD: dependencia faltante, closure obsoleta
useEffect(() => {
  fetchData(userId);
}, []); // userId falta en las deps

// GOOD: dependencias completas
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

```tsx
// BAD: index como key en lista reordenable
{items.map((item, i) => <ListItem key={i} item={item} />)}

// GOOD: key estable y única
{items.map(item => <ListItem key={item.id} item={item} />)}
```

### Patrones Node/Backend (HIGH) — cuando aplique

- **Input sin validar** — body/params usados sin validación de esquema
- **Rate limiting ausente** — endpoints públicos sin throttling
- **Queries sin límite** — `SELECT *` o queries sin LIMIT en endpoints de usuario
- **N+1 queries** — datos relacionados en loop en vez de JOIN/batch
- **Timeouts ausentes** — llamadas HTTP externas sin timeout
- **Fuga en mensajes de error** — detalles internos enviados al cliente
- **CORS mal configurado** — APIs accesibles desde orígenes no deseados

```typescript
// BAD: patrón N+1
const users = await db.query('SELECT * FROM users');
for (const user of users) {
  user.posts = await db.query('SELECT * FROM posts WHERE user_id = $1', [user.id]);
}

// GOOD: una query con JOIN o batch
const usersWithPosts = await db.query(`
  SELECT u.*, json_agg(p.*) as posts
  FROM users u
  LEFT JOIN posts p ON p.user_id = u.id
  GROUP BY u.id
`);
```

### Performance (MEDIUM)

- Algoritmos ineficientes — O(n²) cuando O(n log n) o O(n) es posible
- Re-renders innecesarios — falta `React.memo`/`useMemo`/`useCallback`
- Bundles inflados — importar librerías completas cuando hay alternativas tree-shakeables
- Caché ausente — cálculos caros repetidos sin memoización
- I/O síncrona — operaciones bloqueantes en contextos async

### Buenas prácticas (LOW)

- TODO/FIXME sin ticket de referencia
- JSDoc ausente en APIs públicas exportadas
- Nombres pobres — variables de una letra (x, tmp, data) en contextos no triviales
- Números mágicos no explicados
- Formato inconsistente — mezcla de punto y coma, estilos de comillas, indentación

## Addendum para código generado por IA (v1.8)

Al revisar cambios generados por IA, prioriza:

1. Regresiones de comportamiento y edge cases sin manejar
2. Supuestos de seguridad y límites de confianza
3. Acoplamiento oculto o deriva accidental de arquitectura
4. Complejidad innecesaria que encarece el modelo

Chequeo de coste: señala flujos que escalan a modelos más caros sin necesidad clara; recomienda niveles de coste menores para refactors deterministas.

## NO reportes estos falsos positivos típicos

Patrones que los revisores LLM suelen marcar mal. Salta a menos que tengas evidencia específica de este codebase:

- **"Considera añadir manejo de errores"** en una llamada cuya ruta de error ya maneja el llamador o el framework: middleware de error, error boundaries de React, `try/catch` de nivel superior, cadenas de promesas con `.catch` aguas arriba. Traza al menos un llamador antes de marcar.
- **"Falta validación de input"** cuando la función es interna y sus llamadores ya validan. Traza un llamador antes de marcar.
- **"Número mágico"** para constantes conocidas (`200`, `404`, `1000` ms, `60`, `24`, `1024`, índice `0` o `-1`, códigos de estado HTTP) o constantes locales de un solo uso cuyo nombre lo explica.
- **"Función muy larga"** para `switch` exhaustivos, objetos de configuración, tablas de test o código generado. La longitud no es complejidad.
- **"Falta JSDoc"** en helpers internos de un solo propósito cuyo nombre y firma se explican solos.
- **"Prefiere `const` sobre `let`"** cuando la variable SÍ se reasigna. Lee la función completa antes de marcar.
- **"Posible null dereference"** cuando la línea anterior estrecha el tipo o hay un guard en scope. Sigue el flujo de tipos en vez de emparejar por `?.`.
- **"N+1 query"** en loops de cardinalidad fija (iterar un enum de 4 elementos) o rutas que ya usan batching/DataLoader.
- **"Falta await" / "Falta `.catch`"** en tareas fire-and-forget intencionalmente desacopladas (logging, métricas, telemetría, colas en background). Regla: si el resultado NO se usa, NO se reporta ni la falta de `await` ni la falta de `.catch` — busca el prefijo `void` como señal del desacople deliberado. Solo reporta si puedes señalar una consecuencia concreta: el error silenciado corrompe estado, pierde un dato necesario o deja una operación a medias.
- **"Debería usar TypeScript"** o **"debería tener tipos"** en un archivo JavaScript puro. Respeta el lenguaje del proyecto; no sugieras cambiar de stack.
- **"Valor hardcodeado"** en fixtures de test, código de ejemplo o snippets de documentación. Los tests DEBEN tener expectativas hardcodeadas.
- **Security theater**: marcar `Math.random()` en contexto no criptográfico (animación, jitter, sampling) o `eval`/`Function` en un sistema de plugins que es explícitamente una superficie de carga de código.

Cuando tengas la tentación de marcar alguno, pregúntate: "¿Un ingeniero senior de este equipo cambiaría esto en una revisión?" Si la respuesta es no, no lo reportes.

Regla práctica: si un ingeniero senior NO cambiaría eso en revisión, no lo reportes. Un reporte limpio (0 hallazgos) es un resultado válido. No inventes hallazgos para justificar la revisión: todo debe estar verificado leyendo el código real.

## Ejemplo de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"high","file":"src/stores/chatStore.ts","line":109,"title":"Race al cancelar stream","detail":"El flag stopRequested se comprueba antes de await pero no después; una cancelación durante la petición en vuelo aplica resultados obsoletos. Añadir la comprobación tras el await o usar AbortController."}]}
```
