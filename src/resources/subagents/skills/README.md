# Skills de los subagentes de Aether IDE

Conocimiento especializado (checklists, patrones de error, ejemplos) que se
inyecta al system prompt de cada subagente al invocar su comando.

## Formato de un skill

```markdown
---
name: security-injection
description: Checklist de inyección (SQL, comandos, XSS) para SecBot
applies_to: [security]
languages: [python]        <- opcional (v0.4.0)
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/... -->

(cuerpo: checklist, patrones típicos, falsos positivos y ejemplos del bloque aether-findings)
```

- **`name`**: identificador; la carga es alfabética por nombre (orden determinista
  para que el prompt sea estable y cacheable).
- **`applies_to`**: lista de subagentes (`qa`, `security`, `audit`, `ux`) que
  reciben el skill.
- **`languages`** (opcional, v0.4.0): lista de lenguajes del proyecto que activan
  el skill. Regla de carga:
  - Skill **sin** `languages`: se carga SIEMPRE (compatible con todo).
  - Skill **con** `languages`: se carga solo si hay intersección con los
    lenguajes detectados del proyecto (`src/lib/agent/languageDetect.ts`:
    extensiones del fileTree + pestañas abiertas + marcadores de raíz como
    `pyproject.toml`, `go.mod`, `pom.xml`, `CMakeLists.txt`, `Gemfile`,
    `Cargo.toml`, `package.json`).
  - Si la detección no produjo lenguajes, los skills condicionales NO cargan
    (default seguro). Ejemplo: `python-patterns` solo inyecta en proyectos con
    `.py`, `requirements.txt` o `pyproject.toml`.
- El loader (`src/lib/agent/skills.ts`) descubre los archivos automáticamente con
  `import.meta.glob` — un skill nuevo "aparece solo".

## Reglas

- **Sin límite de tamaño; incluye todo lo valioso** (v0.4.0): no recortar ni
  resumir para ahorrar bytes. Lo único que se quita es lo que los subagentes no
  pueden hacer (comandos Bash, herramientas externas tipo mypy/go vet/mvn,
  "Prompt Defense Baseline", "Approval Criteria" y menciones a git diff).
- Los subagentes son de **solo lectura**: los skills no pueden pedir escribir
  archivos ni ejecutar comandos, y solo pueden referir a `read_file`,
  `search_files`, `list_directory` y `design_search`.
- Todo ejemplo de salida debe usar el formato exacto del bloque `aether-findings`.
- Si el contenido deriva de [affaan-m/ECC](https://github.com/affaan-m/ECC) (MIT),
  incluir el comentario de atribución. Ver `THIRD_PARTY_NOTICES.md` en la raíz.
