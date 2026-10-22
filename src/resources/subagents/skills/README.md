# Skills de los subagentes de Aether IDE

Conocimiento especializado (checklists, patrones de error, ejemplos) que se
inyecta al system prompt de cada subagente al invocar su comando.

## Formato de un skill

```markdown
---
name: security-injection
description: Checklist de inyección (SQL, comandos, XSS) para SecBot
applies_to: [security]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/... -->

(cuerpo: checklist corto, patrones típicos y 1 ejemplo del bloque aether-findings)
```

- **`name`**: identificador; la carga es alfabética por nombre (orden determinista
  para que el prompt sea estable y cacheable).
- **`applies_to`**: lista de subagentes (`qa`, `security`, `audit`) que reciben el skill.
- El loader (`src/lib/agent/skills.ts`) descubre los archivos automáticamente con
  `import.meta.glob` — un skill nuevo "aparece solo".

## Reglas

- **Presupuesto total, no límite por skill (v0.4.0)**: prioriza NO perder
  información valiosa sobre ahorrar bytes. Quita SOLO lo que no aplica a
  Aether (comandos Bash, herramientas externas, "Prompt Defense Baseline",
  "Approval Criteria", menciones a git diff). Guía: hasta ~6-8 KB por skill;
  si lo superas, pártela en dos con `applies_to` distintos en vez de
  recortarla. El loader (`src/lib/agent/skills.ts`) estima los tokens
  inyectados (chars/4) y avisa en consola si el total por ejecución supera
  ~12K tokens.
- Los subagentes son de **solo lectura**: los skills no pueden pedir escribir
  archivos ni ejecutar comandos, y solo pueden referir a `read_file`,
  `search_files`, `list_directory` y `design_search`.
- Todo ejemplo de salida debe usar el formato exacto del bloque `aether-findings`.
- Si el contenido deriva de [affaan-m/ECC](https://github.com/affaan-m/ECC) (MIT),
  incluir el comentario de atribución. Ver `THIRD_PARTY_NOTICES.md` en la raíz.
