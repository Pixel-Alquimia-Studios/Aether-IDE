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

- **Cortos**: cada skill se cobra en tokens en cada ejecución del subagente.
- Los subagentes son de **solo lectura**: los skills no pueden pedir escribir
  archivos ni ejecutar comandos, y solo pueden referir a `read_file`,
  `search_files` y `list_directory`.
- Todo ejemplo de salida debe usar el formato exacto del bloque `aether-findings`.
- Si el contenido deriva de [affaan-m/ECC](https://github.com/affaan-m/ECC) (MIT),
  incluir el comentario de atribución. Ver `THIRD_PARTY_NOTICES.md` en la raíz.
