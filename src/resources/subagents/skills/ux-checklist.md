---
name: ux-checklist
description: Checklist de revisión UI/UX para UxBot — contraste, foco, motion, responsive, iconos, targets y estados, con referencia a design_search
applies_to: [ux]
---

<!-- Derivado del patrón de skills de Aether; criterios WCAG 2.2 AA y
referencias de ui-ux-pro-max (MIT — https://github.com/nextlevelbldr/ui-ux-pro-max-skill).
Fundamenta cada hallazgo con design_search cuando aplique (queries en INGLÉS,
CORTAS: 2-4 palabras de un solo tema). -->

## Qué dominio de design_search consultar para qué

| Dominio | Cuándo usarlo | Query de ejemplo |
|---|---|---|
| `ui-reasoning` | Recomendaciones de design system por **TIPO DE PRODUCTO** (patrón de layout, estilo, mood de color) | `"developer tool IDE"` |
| `style` | Identificar/comparar estilos UI (glassmorphism, minimalism…) con CSS keywords y checklist de implementación | `"glassmorphism cards"` |
| `color` | Paletas semánticas completas (primary/on-primary/muted/ring…) por tipo de producto | `"fintech palette"` |
| `typography` | Parejas tipográficas con Google Fonts import y Tailwind config | `"developer tool font pairing"` |
| `ux` | Guías Do/Don't con ejemplos de código y severidad (touch, foco, navegación) | `"touch target mobile"` |
| `charts` | Qué gráfica usar según el dato + accesibilidad y librería | `"time series trend"` |
| `icons` | Icono recomendado por concepto con import code concreto | `"settings gear"` |

Regla práctica: revisando un COMPONENTE usa `ux`/`icons`; eligiendo el look de
una VISTA o app nueva empieza por `ui-reasoning` y baja a `style`/`color`/`typography`.

## Checklist de revisión UI/UX (por prioridad)

### 1. Accesibilidad de color y contraste (CRITICAL/HIGH)
- [ ] Texto vs fondo ≥ 4.5:1 (≥ 3:1 para texto ≥ 24px bold). Busca grises
  claros sobre blancos (`text-gray-400` sobre blanco = 2.8:1 — HIGH) y texto
  translúcido con opacidad < 0.7.
- [ ] Placeholders y texto deshabilitado legibles (≥ 3:1); no es excusa bajarlos.
- [ ] Estados de error/success no comunicados SOLO con color (añade icono o texto).
- [ ] Paletas: usa design_search({"query":"semantic tokens dark mode","domain":"color"})
  para comparar contra paletas semánticas correctas (on-primary, muted, ring…).

### 2. Foco y teclado (HIGH)
- [ ] Todo control interactivo tiene focus visible (`:focus-visible` ring; no
  `outline: none` sin reemplazo).
- [ ] Orden de tabulación lógico (sin `tabindex` positivos).
- [ ] Modales con focus trap + Escape para cerrar.
- [ ] Atajos documentados no capturan teclas del navegador.

### 3. Motion (HIGH)
- [ ] Animaciones > propiedades no-esenciales respetan `prefers-reduced-motion`
  (`motion-reduce:transition-none`, `motion-safe:animate-*` en Tailwind).
- [ ] Transiciones en rango 150–250ms; loops infinitos solo con justificación.

### 4. Texto y layout (HIGH/MEDIUM)
- [ ] Nada de texto truncado sin escape: `truncate`/`line-clamp` con `title` o
  expandible. Cadenas largas (emails, rutas) rompen con `break-all`/`break-words`.
- [ ] Áreas táctiles ≥ 24×24px (WCAG 2.5.8; ideal 44×44). Botones de icono
  pequeños con padding invisible.
- [ ] Layout no depende de anchos fijos: breakpoints 375 / 768 / 1024 / 1440.
  Busca `w-[NNNpx]` fijos en contenedores y tablas sin scroll horizontal.

### 5. Iconografía (MEDIUM)
- [ ] Nada de emojis como iconos de UI (llegan distinto por plataforma, sin
  contraste garantizado): reemplazar por SVG de librería (Lucide/Phosphor/Heroicons).
  Consulta design_search({"query":"settings gear icon","domain":"icons"}) para el
  import concreto.
- [ ] Iconos con `aria-hidden` cuando el texto adyacente ya comunica.

### 6. Interacción y estados (MEDIUM)
- [ ] Elementos clicables con `cursor-pointer` (en Tailwind 4 NO es default).
- [ ] Botones con estado disabled visible Y `disabled` real (no solo estético).
- [ ] Estados vacíos, de carga (spinner/skeleton) y de error presentes en
  listas, tablas y paneles; nada de "pantallas en blanco".
- [ ] Placeholders que no duplican la label.

### 7. Consistencia visual (MEDIUM/LOW)
- [ ] Una sola escala de espaciado/typography (tokens, no px mágicos dispares).
- [ ] Jerarquía tipográfica coherente (títulos/body/caption en 3 tamaños máx
  por vista).
- [ ] Modo oscuro: sin hex crudos sobre tokens semánticos (usa
  design_search({"query":"dark dashboard accent","domain":"ui-reasoning"}) para
  reglas por tipo de producto).

## Falsos positivos a NO reportar
- Contraste < 4.5:1 en texto DECORATIVO o logotipos (WCAG lo exime).
- `cursor-pointer` ausente en elementos no interactivos (labels de inputs sí son
  clickables por native behavior).
- Animaciones CSS < 150ms puramente decorativas sin contenido parpadeante.
- Targets > 24px aunque no lleguen a 44px (24px es el mínimo WCAG 2.5.8 AA).
- Contenido que ya ofrece alternativa accesible documentada (aria-label, sr-only).

## Ejemplos de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"high","file":"src/components/Sidebar.tsx","line":42,"title":"Texto de nav con contraste 2.8:1","detail":"text-gray-400 sobre bg-white da ~2.8:1, por debajo de WCAG AA (4.5:1). Subir a text-gray-600 o darker. design_search(ux): 'color contrast' indica 4.5:1 como mínimo para texto normal."},{"severity":"medium","file":"src/components/layout/MenuBar.tsx","line":88,"title":"Emoji 💬 como icono de UI","detail":"El botón del chat usa un emoji que renderiza distinto por plataforma y sin contraste garantizado. Reemplazar por SVG (Lucide MessageCircle) con aria-hidden. design_search(icons) trae el import concreto."},{"severity":"high","file":"src/index.css","line":85,"title":"Animación sin prefers-reduced-motion","detail":"La animación message-in corre siempre; usuarios con vestibular disorders necesitan motion reducido. Añadir @media (prefers-reduced-motion: reduce) { .message-enter { animation: none } }."}]}
```
