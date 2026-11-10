---
name: rust-patterns
description: Patrones de error típicos en Rust: seguridad de memoria, manejo de errores, ownership, concurrencia y performance
applies_to: [qa, audit]
languages: [rust]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/rust-reviewer.md -->

## Patrones CRITICAL (seguridad)

- **`unwrap()`/`expect()` sin control** en rutas de producción: usar `?` o manejar
  explícito.
- **`unsafe` sin justificación**: falta comentario `// SAFETY:` con los invariantes.
- **Inyección SQL**: interpolación de strings en queries — usar queries parametrizadas.
- **Inyección de comandos**: input sin validar en `std::process::Command`.
- **Path traversal**: rutas controladas por el usuario sin canonización
  (`canonicalize`) + verificación de prefijo.
- **Secretos hardcodeados** en el código fuente.
- **Deserialización insegura**: deserializar datos no confiables sin límites de
  tamaño ni profundidad.
- **Use-after-free con punteros crudos**: manipulación de punteros unsafe sin
  garantías de lifetime.

## Patrones CRITICAL (manejo de errores)

- **Errores silenciados**: `let _ = result;` sobre tipos `#[must_use]`.
- **Pánico en errores recuperables**: `panic!()`, `todo!()`, `unreachable!()` en rutas
  de producción.
- **Error sin contexto**: `return Err(e)` sin `.map_err()` ni contexto del origen.
- **`Box<dyn Error>` en librerías**: usar `thiserror` para errores tipados; `anyhow`
  solo en binarios.

## Patrones HIGH (ownership y lifetimes)

- **`.clone()` innecesario**: clonar para apaciguar al borrow checker sin entender
  la causa raíz.
- **`String` donde `&str` basta**: parámetros que deberían ser `&str` o
  `impl AsRef<str>`.
- **`Vec<T>` donde `&[T]` basta**.
- **`Cow` ausente**: alojar cuando `Cow<'_, str>` evitaría la asignación.
- **Lifetimes sobre-anotados**: lifetimes explícitos donde las reglas de elisión
  aplican.

## Patrones HIGH (concurrencia)

- **Bloqueo en contexto async**: `std::fs`, `std::thread::sleep` o cualquier I/O
  bloqueante dentro de tareas async — usar los equivalentes de tokio
  (`tokio::fs`, `tokio::time::sleep`).
- **Canales sin acotar**: `mpsc::unbounded_channel()` sin justificación —
  preferir canales acotados (con backpressure explícito).
- **Poisoning de `Mutex` ignorado**: `.lock()` con `unwrap()` o sin manejar el
  `PoisonError` (si otro hilo pánicó, el estado puede estar corrupto — decidir
  conscientemente: recuperar, propagar o abortar).
- **`Send`/`Sync` ausentes**: tipos compartidos entre hilos sin los bounds
  correctos.
- **Deadlock**: adquisición anidada de locks sin orden consistente entre hilos.

## Patrones HIGH (calidad)

- **`match` con `_ =>`** que oculta variantes nuevas de enums de negocio.
- **Matching no exhaustivo** donde se requiere manejo explícito.
- Código muerto (funciones, imports o variables sin uso).
- Funciones gigantes (>50 líneas) y nesting profundo (>4 niveles).

## Patrones MEDIUM (performance)

- **Alocaciones innecesarias**: `to_string()`/`to_owned()` en hot paths.
- **Alocaciones repetidas en loops**: crear `String` o `Vec` dentro de loops.
- **`Vec::new()` sin `with_capacity`**: cuando el tamaño es conocido por adelantado.
- **`.cloned()`/`.clone()` en iteradores** cuando basta prestar (borrow).
- **N+1 queries**: consultas a base de datos dentro de loops.

## Patrones MEDIUM (buenas prácticas)

- **Warnings sin tratar**: suprimidos con `#[allow]` sin justificar (los que
  señalaría clippy).
- **`#[must_use]` ausente** en tipos de retorno cuyo ignore probablemente sea un
  bug.
- **Orden de derives** inconsistente (convención: Debug, Clone, PartialEq, Eq,
  Hash, Serialize, Deserialize).
- **API pública sin docs**: ítems `pub` sin `///`.
- **`format!` para concatenar dos cadenas**: usar `push_str`, `concat!` o `+`.

## Ejemplo de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"high","file":"src-tauri/src/commands.rs","line":89,"title":"panic en ruta de producción","detail":"expect() sobre lectura de config: si el archivo falta la app crashea. Devolver Result con contexto en su lugar."}]}
```
