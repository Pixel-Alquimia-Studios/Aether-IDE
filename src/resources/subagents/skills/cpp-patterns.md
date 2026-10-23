---
name: cpp-patterns
description: Patrones y anti-patrones C++ moderno — memoria (RAII, Rule of Five), seguridad, concurrencia, rendimiento y const-correctness
applies_to: [qa, audit]
languages: [cpp]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/cpp-reviewer.md
     El original corre clang-tidy/cppcheck: aquí eso se convierte en "qué buscar
     leyendo el código" (los subagentes de Aether solo disponen de read_file,
     search_files y list_directory). -->

## Prioridades de revisión

### CRITICAL — Seguridad de memoria
- **Raw new/delete**: usar `std::unique_ptr` / `std::shared_ptr` — buscar `new ` y
  `delete ` emparejados a mano.
- **Buffer overflows**: arrays C-style, `strcpy`, `sprintf`, `gets`, `strcat` sin
  límites — reemplazar por `std::string`, `std::array`, `snprintf` con tamaño.
- **Use-after-free**: punteros colgantes, iteradores invalidados tras
  `push_back`/`erase` (realeslocation invalida punteros/iteradores previos).
- **Variables sin inicializar**: lectura antes de asignación (miembros primitivos
  sin inicializador en el constructor).
- **Memory leaks**: gestión manual de recursos sin RAII (recursos no atados al
  lifetime de un objeto).
- **Null dereference**: desreferencia sin check de null.

### CRITICAL — Seguridad
- **Inyección de comandos**: input sin validar en `system()` o `popen()`.
- **Format string attacks**: input del usuario como format string de `printf` —
  debe ser literal (`printf("%s", input)`), nunca `printf(input)`.
- **Integer overflow**: aritmética sin chequear sobre input no confiable (casts
  int→size_t negativos, multiplicaciones en tamaños de alloc).
- **Secretos hardcodeados** en el código fuente.
- **Casts inseguros**: `reinterpret_cast` sin justificación documentada.

### HIGH — Concurrencia
- **Data races**: estado mutable compartido sin sincronización (sin mutex/atomic).
- **Deadlocks**: múltiples mutex tomados en orden inconsistente entre funciones.
- **Lock guards ausentes**: `lock()`/`unlock()` manuales en vez de `std::lock_guard`
  / `std::unique_lock`.
- **Threads desatendidos**: `std::thread` sin `join()` ni `detach()` al salir del
  scope → `std::terminate`.

### HIGH — Calidad de código
- **RAII ausente**: gestión manual de recursos (open/close, lock/unlock, new/delete
  emparejados a mano en el mismo scope en vez de wrappers).
- **Rule of Five incompleta**: clase con destructor/copy/move sin definir los cinco
  (o sin `= delete` explícito).
- Funciones > 50 líneas; anidamiento > 4 niveles.
- **Estilo C residual**: `malloc/free`, arrays C crudos, `typedef` en vez de `using`,
  casts estilo C `(int)x` en vez de `static_cast`.

### MEDIUM — Rendimiento
- **Copias innecesarias**: objetos grandes pasados por valor en vez de `const&`.
- **Move semantics ausente**: `std::move` faltante en sink parameters y returns.
- **Concatenación de strings en loops**: usar `std::ostringstream` o `reserve()`.
- **`reserve()` ausente**: vector de tamaño conocido sin pre-asignación.

### MEDIUM — Buenas prácticas
- **const-correctness**: `const` ausente en métodos/parámetros/referencias que no mutan.
- **`auto` en exceso o por defecto**: equilibrar legibilidad y deducción.
- **Higiene de includes**: guards faltantes, includes innecesarios, dependencias
  circulares entre headers.
- **Pollución de namespace**: `using namespace std;` en headers.

## Qué comprobar "a lo clang-tidy/cppcheck" (leyendo, sin ejecutar)

- **a lo clang-tidy**: miembros sin inicializar en constructores, `std::move` sobre
  const, pasos por valor de tipos costosos, `dynamic_cast` en cascada que delatan
  jerarquías a replantear.
- **a lo cppcheck**: indexado fuera de rango potencial (`buf[i]` con `i` sin bound),
  `memset` sobre tipos no-POD, divisiones sin check de divisor.
- **Lifetimes**: para cada `new`/`malloc` buscado con search_files, verificar su
  `delete`/`free` en el MISMO scope o la propiedad transferida a un smart pointer.

## Falsos positivos a NO reportar
- Smart pointers con `get()` expuesto SOLO lectura (no implica ownership dudoso).
- `reinterpret_cast` en código de serialización/buffers con comentario de alineación.
- `std::thread::detach()` en workers de larga vida deliberados con lifetimes
  documentados (daemon-style).
- Arrays C-style de tamaño fijo constexpr con límites verificados en el mismo scope.

## Ejemplos de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"critical","file":"src/parser/lexer.cpp","line":120,"title":"Buffer overflow con strcpy","detail":"strcpy(buffer, userInput) copia sin límite sobre un array de 256 bytes. Reemplazar por std::string o snprintf con sizeof(buffer)."},{"severity":"high","file":"src/net/connection.cpp","line":64,"title":"new/delete emparejados a mano","detail":"auto conn = new Connection(...) con delete en 3 ramas distintas: cualquier early return filtra. Usar std::unique_ptr<Connection>."},{"severity":"medium","file":"src/util/format.cpp","line":30,"title":"printf con format string del usuario","detail":"printf(message) permite format string attack (%n escribe memoria). Debe ser printf(\"%s\", message)."}]}
```
