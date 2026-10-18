---
name: rust-patterns
description: Patrones de error típicos en Rust: seguridad de memoria, manejo de errores, ownership y concurrencia
applies_to: [qa, audit]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/rust-reviewer.md -->

## Patrones CRITICAL

- **`unwrap()`/`expect()` sin control** en rutas de producción: usar `?` o manejar
  explícito.
- **`unsafe` sin justificación**: falta comentario `// SAFETY:` con los invariantes.
- **Inyección de comandos**: input sin validar en `std::process::Command`.
- **Path traversal**: rutas controladas por el usuario sin canonización
  (`canonicalize`) + verificación de prefijo.
- **Secretos hardcodeados** en el código fuente.

## Patrones CRITICAL (manejo de errores)

- **Errores silenciados**: `let _ = result;` sobre tipos `#[must_use]`.
- **Pánico en errores recuperables**: `panic!()`, `todo!()`, `unreachable!()` en rutas
  de producción.
- **Error sin contexto**: `return Err(e)` sin `.map_err()`/contexto.

## Patrones HIGH

- **Ownership**: `.clone()` para apaciguar al borrow checker sin entender la causa raíz;
  `String` donde `&str` basta; `Vec<T>` donde `&[T]` basta.
- **Concurrencia**: bloqueo en contexto async (`std::fs`, `std::thread::sleep` en vez de
  equivalentes tokio), canales sin acotar sin justificación, deadlock por adquisición
  anidada de locks sin orden consistente.
- **Calidad**: `match` con `_ =>` que oculta variantes nuevas de enums de negocio,
  código muerto, funciones gigantes (>50 líneas).

## Ejemplo de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"high","file":"src-tauri/src/commands.rs","line":89,"title":"panic en ruta de producción","detail":"expect() sobre lectura de config: si el archivo falta la app crashea. Devolver Result con contexto en su lugar."}]}
```
