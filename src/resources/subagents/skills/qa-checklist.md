---
name: qa-checklist
description: Checklist de revisión de calidad: qué priorizar y qué NO reportar (falsos positivos típicos de revisores LLM)
applies_to: [qa, audit]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/code-reviewer.md -->

## Checklist de revisión (por prioridad)

1. **Seguridad en el código (CRITICAL)**: credenciales hardcodeadas, inyección SQL por
   concatenación, XSS (input sin escapar en HTML), path traversal (rutas de usuario sin
   canonizar), secretos en logs.
2. **Bugs y lógica (HIGH)**: condiciones invertidas, off-by-one, null/undefined sin
   manejar, promesas sin await ni catch, estados compartidos mutables, errores tragados
   (catch vacío), recursos sin liberar.
3. **Edge cases (MEDIUM)**: entradas vacías/vacíos de arrays, valores límite, carreras
   (race conditions), cancelación a mitad de operación, recargas/reintentos.
4. **Calidad (LOW)**: código muerto, duplicación evidente, nombres engañosos.

## NO reportes estos falsos positivos típicos

- "Falta manejo de errores" cuando el llamador o el framework ya lo maneja (error
  boundaries, try/catch upstream, middleware). Trazá al menos un llamador antes.
- "Falta validación de input" en funciones internas cuyos llamadores ya validan.
- "Número mágico" para constantes conocidas (200, 404, 1024…) o obvias por su nombre.
- "Función muy larga" para switch exhaustivos, tablas de configuración o tests.
- "Posible null dereference" cuando la línea anterior ya estrecha el tipo o hay guard.
- "Falta await" en tareas intencionalmente desacopladas (logging, métricas, void).
- "Debería usar X" (otro lenguaje/stack): respetá el lenguaje del proyecto.

Regla práctica: si un ingeniero senior NO cambiaría eso en revisión, no lo reportes.
Un reporte limpio (0 hallazgos) es un resultado válido. No inventes hallazgos para
justificar la revisión: todo debe estar verificado leyendo el código real.

## Ejemplo de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"high","file":"src/stores/chatStore.ts","line":109,"title":"Race al cancelar stream","detail":"El flag stopRequested se comprueba antes de await pero no después; una cancelación durante la petición en vuelo aplica resultados obsoletos. Añadir la comprobación tras el await o usar AbortController."}]}
```
