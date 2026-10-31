# Aether IDE — Brand Assets

## Estructura

```
assets/brand/
├── source/                              # SVGs ORIGINALES (con metadatos C2PA)
│   ├── aether-ide-icon.svg             # Icono cuadrado 256×256
│   └── aether-ide-logo.svg             # Logo rectangular 660×200 con texto
├── aether-ide-icon.svg                 # DERIVADO: icono sin C2PA
├── aether-ide-logo.svg                 # DERIVADO: logo sin C2PA
└── README.md                           # Este archivo
```

- **Fuente de verdad**: `source/` — los archivos originales con sus metadatos.
- **Derivados**: los de la raíz de `assets/brand/` — mismos SVGs sin el bloque
  `<metadata><c2pa:manifest>…</c2pa:manifest></metadata>` ni el atributo
  `xmlns:c2pa`. Se generan con `scripts/generate-brand-assets.mjs`.

## Qué genera el script

```bash
node scripts/generate-brand-assets.mjs
```

1. Copia los SVG fuente (si están en la raíz del proyecto)
2. Genera derivados sin C2PA en `assets/brand/`
3. Actualiza `public/favicon.svg` (versión simplificada del icono)
4. Genera BMPs de instalador: `nsis-header.bmp` (150×57), `nsis-sidebar.bmp`
   (164×314), `wix-banner.bmp` (493×58), `wix-dialog.bmp` (493×312) en
   `src-tauri/icons/`
5. Genera PNGs de vista previa en `.brand-previews/` (gitignored)

## Iconos de Tauri

Los iconos de la app (`icon.ico`, `icon.icns`, `32x32.png`, etc.) se generan con:

```bash
npx tauri icon assets/brand/aether-ide-icon.svg -o src-tauri/icons
```

Después de generar, **eliminar** los que no usa Tauri: `ios/`, `android/`,
`Square*Logo.png`, `StoreLogo.png`.
