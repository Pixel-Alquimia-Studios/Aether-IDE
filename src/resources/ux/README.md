# Datos UX empaquetados (buscador design_search)

Catálogos curados de UI/UX portados de [ui-ux-pro-max](https://github.com/nextlevelbldr/ui-ux-pro-max-skill)
(MIT — Copyright (c) 2024 Next Level Builder, ver `THIRD_PARTY_NOTICES.md` en la raíz).

| Archivo | Dominio | Contenido |
|---|---|---|
| `styles.csv` | `style` | 88 estilos UI con CSS keywords, checklists y variables |
| `colors.csv` | `color` | 192 paletas semánticas por tipo de producto |
| `typography.csv` | `typography` | 74 pairings tipográficos con import de Google Fonts |
| `ux-guidelines.csv` | `ux` | 119 Do/Don't con ejemplos de código y severidad |
| `charts.csv` | `charts` | 25 tipos de gráfica con accesibilidad y librerías |
| `icons.csv` | `icons` | 105 recomendaciones de iconos con import code |
| `ui-reasoning.csv` | `ui-reasoning` | 192 reglas de razonamiento de design system (dominio propio de Aether) |

## Cómo se cargan

- **Bajo demanda**: `import.meta.glob` NO eager en `src/lib/agent/uxData.ts` —
  cada CSV es un chunk separado (~414 KB total) que solo descarga la primera
  vez que se usa la herramienta `design_search`.
- El motor BM25 está en `src/lib/agent/designSearch.ts` (puro, testeable con
  Node: `node scripts/test-design-search.mjs`).
- Los dominios se recortaron a 7: sin google-fonts (730 KB), stacks/ (500 KB),
  gsap/motion, react-performance, landing ni products.
