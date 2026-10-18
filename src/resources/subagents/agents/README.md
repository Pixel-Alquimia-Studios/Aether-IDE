# Prompts base de los subagentes de Aether IDE

Archivos Markdown con el prompt base de cada subagente de análisis de solo lectura:

| Archivo | Subagente | Comando |
|---|---|---|
| `bugbot.md` | 🐛 BugBot (QA) | `/qa` |
| `secbot.md` | 🛡 SecBot (Seguridad) | `/security` |
| `auditbot.md` | 📋 AuditBot (QA + Seguridad) | `/audit` |

## Formato

Texto plano del system prompt. El loader (`src/lib/agent/skills.ts`) lo importa como
texto en build time (`?raw`) y lo concatena con las skills que aplican al subagente,
en orden determinista (alfabético), para que el prompt sea **estable y cacheable**.

## Reglas

- El prompt describe identidad, misión, severidades y formato de salida.
- Los bloques compartidos (reglas de solo lectura, formato `aether-findings`)
  viven como texto común; no duplicar herramientas que los subagentes no tienen:
  ellos solo disponen de `read_file`, `search_files` y `list_directory`.
- Nada de estos prompts puede pedir escribir archivos ni ejecutar comandos.
