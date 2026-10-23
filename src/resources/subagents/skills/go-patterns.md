---
name: go-patterns
description: Patrones y anti-patrones Go: seguridad, manejo de errores (err/_/wrap), concurrencia (goroutines, channels, context) e idiomatic Go
applies_to: [qa, audit]
languages: [go]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/go-reviewer.md
     Los comandos del original (go vet, staticcheck, golangci-lint, go build -race,
     govulncheck) se convirtieron en "qué buscar leyendo el código": los subagentes
     de Aether solo disponen de read_file, search_files y list_directory. -->

## Prioridades de revisión

### CRITICAL — Seguridad
- **Inyección SQL**: concatenación de strings en queries de `database/sql` — usar
  parámetros (`?` o `$1`) o el builder del driver.
- **Inyección de comandos**: input sin validar en `os/exec` — validar y usar listas
  de argumentos (`exec.Command("cmd", arg1, arg2)`), nunca `sh -c` con input.
- **Path traversal**: rutas de usuario sin `filepath.Clean` + verificación de prefijo.
- **Race conditions**: estado compartido sin sincronización — buscar `go func()` que
  tocan variables externas sin mutex/channel.
- **Paquete unsafe** sin justificación documentada.
- **Secretos hardcodeados**: API keys, passwords en el código.
- **TLS inseguro**: `InsecureSkipVerify: true` en configs de `tls.Config`.

### CRITICAL — Manejo de errores
- **Errores ignorados**: `_ =` descartando errores de `#[must_use]`-style APIs
  (`file.Close()`, `db.Query`, unmarshal…) — buscar `_ =` y `, _ :=`.
- **Errores sin contexto**: `return err` plano — envolver con
  `fmt.Errorf("contexto: %w", err)`.
- **Pánico en errores recuperables**: `panic()` donde cabe un error.
- **Comparación por ==**: `err == target` — usar `errors.Is(err, target)` /
  `errors.As(err, &typed)`.

### HIGH — Concurrencia
- **Goroutine leaks**: `go func()` sin mecanismo de cancelación — debe recibir
  `context.Context` y respetar `ctx.Done()`.
- **Deadlock en canal unbuffered**: send sin receptor garantizado.
- **WaitGroup ausente**: goroutines sin `wg.Add/Done/Wait` cuando se espera el resultado.
- **Mutex sin defer**: `mu.Lock()` sin `defer mu.Unlock()` — un return temprano
  deja el lock tomado.

### HIGH — Calidad de código
- Funciones > 50 líneas; anidamiento > 4 niveles.
- **No idiomático**: `if/else` largos en vez de early return.
- **Variables a nivel de paquete mutables**: estado global compartido.
- **Pollución de interfaces**: abstracciones definidas sin implementador/uso.

### MEDIUM — Rendimiento
- **Concatenación de strings en loops**: usar `strings.Builder`.
- **Slices sin pre-asignación**: `make([]T, 0, cap)` cuando el tamaño es conocido.
- N+1 queries en loops; asignaciones innecesarias en hot paths.

### MEDIUM — Buenas prácticas
- **Context primero**: `ctx context.Context` como primer parámetro de las APIs que
  hacen IO.
- Tests sin patrón table-driven; mensajes de error con mayúscula/puntuación (van en
  minúscula, sin punto); nombres de paquete con underscores o mayúsculas.
- `defer` dentro de loops (acumula recursos hasta el fin de la función).

## Qué comprobar "a lo go vet/staticcheck" (leyendo, sin ejecutar)

- **a lo go vet**: `Printf` con argumentos que no casan con los verbos (`%s` sin arg,
  `%d` con string); `copy` de locks (`sync.Mutex` pasado por valor); rangos que
  mutan el slice subyacente.
- **a lo staticcheck**: comparaciones con nil en interfaces mal llenadas, shadowing
  de `err` que oculta errores previos, `defer` en loop.
- **a lo -race** (leyendo): campos de structs accedidos desde 2+ goroutines sin
  mutex/atomic/channel — buscar cada `go func()` y trazar sus variables libres.
- **a lo govulncheck**: llamadas a APIs deprecadas/inseguras conocidas (crypto/md5,
  math/rand para tokens, `http.DefaultClient` sin timeout).

## Falsos positivos a NO reportar
- `_ =` sobre APIs cuyo error es genuinamente irrelevante (ej. `fmt.Fprintf` a un
  logger que ya falló) — SOLO si hay comentario que lo justifique.
- Goroutines cortas al final de `main` sin contexto (scripts CLI de una línea).
- `panic()` en `init` de config a arranque (fail-fast legítimo si es intención clara).
- Canal buffered usado como semáforo con tamaño correcto (no es deadlock).

## Ejemplos de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"high","file":"internal/store/users.go","line":58,"title":"Goroutine leak sin context","detail":"go func() { ... }() arranca sin ctx ni canal de salida: si el caller retorna, la goroutine queda viva para siempre. Recibir ctx context.Context y hacer select con <-ctx.Done()."},{"severity":"high","file":"internal/api/handler.go","line":31,"title":"Error ignorado en Close","detail":"_ = rows.Close() dentro de un loop acumula conexiones abiertas si Close falla. Hacer defer con error explícito o cerrar en el mismo scope con check."},{"severity":"medium","file":"internal/report/builder.go","line":77,"title":"Concatenación de strings en loop","detail":"out += fmt.Sprintf(...) en cada iteración es O(n²). Usar strings.Builder con b.WriteString."}]}
```
