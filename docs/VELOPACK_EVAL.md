# Evaluación de Velopack para Aether IDE (v0.3.0, fase C)

> Experimento controlado solicitado para la v0.3.0: probar [Velopack](https://velopack.com)
> como alternativa al updater actual (`tauri-plugin-updater` + GitHub Actions, operativo
> desde la v0.2.2). **Conclusión abajo — no se reemplazó nada todavía.**

## Qué se probó (2026-10-18)

| Paso | Resultado |
|---|---|
| Instalar .NET SDK 8 (`winget install Microsoft.DotNet.SDK.8`) | 8.0.426 ✓ |
| Instalar vpk CLI (`dotnet tool install --global vpk`) | v1.2.161 ✓ |
| `vpk pack` v0.3.0 desde el exe release | **1.7 s** ✓ |
| `vpk pack` v0.3.1 con cambios simulados | 1.2 s ✓ |
| Generación de delta automática | ✓ |

## Resultados medidos

| Artefacto | Tamaño | Nota |
|---|---|---|
| `AetherIDE-win-Setup.exe` (0.3.0) | **15,48 MB** | vs NSIS actual: 5,61 MB (2,8×) |
| `AetherIDE-0.3.0-full.nupkg` (update full) | 8,30 MB | payload de update |
| `AetherIDE-0.3.1-delta.nupkg` | **0,02 MB** | **99,8 % menos** que el full |
| `AetherIDE-win-Portable.zip` | 8,28 MB | portable gratis, incluido |
| `releases.win.json` | manifiesto | SHA256 por paquete |

Cambio simulado: `CHANGELOG.txt` nuevo + ~50 bytes extra en el exe → delta de 20 KB.
Cambios reales (binario Rust recompilado) producen deltas mayores pero siguen siendo
fracción del full.

## Ventajas observadas

1. **Updates delta reales**: el updater actual descarga el setup completo (5,6 MB) en
   cada versión; Velopack baja solo las diferencias (KB). Con releases frecuentes es
   una diferencia enorme para el usuario.
2. **Empaquetado trivial**: 1 comando, 1-2 segundos, sin config.
3. **Portable gratis**: genera el zip portable además del setup.
4. **Hosting simple**: solo hay que subir `releases.win.json` + nupkgs (GitHub Releases
   sirve; tiene `vpk upload github`).
5. Instalación con splash de progreso, shortcuts automáticos (Desktop + Start Menu).

## Desventajas / riesgos

1. **Setup 2,8× más grande** que el NSIS actual (15,5 vs 5,6 MB) — primera descarga.
2. **Requiere .NET SDK 8** en la máquina de build (CI: un paso más en el workflow) y el
   crate `velopack` de Rust en runtime (UpdateManager en `src-tauri`).
3. **UX de instalación distinta**: sin wizard NSIS (sin selector de idioma ES/EN ni
   branding actual); instala directo con splash.
4. **Firma**: sin certificado Authenticode, SmartScreen avisa (igual que hoy, pero el
   flujo es más nuevo y menos probado por la comunidad).
5. **Migración**: implica reescribir el updater (crate Rust), el workflow de release y
   abandonar `latest.json` minisign que ya funciona.

## Cómo probarlo a mano (instalación local)

```powershell
# Paquetes generados en: %TEMP%\velopack-exp\releases
& "$env:TEMP\velopack-exp\releases\AetherIDE-win-Setup.exe"
# Instala en %LocalAppData%\AetherIDE con shortcuts; desinstalar desde Configuración.
```

## Conclusión y recomendación

**Para la v0.3.0: NO migrar.** El updater actual (tauri-plugin-updater + GitHub
Actions + minisign) está operativo end-to-end desde la 0.2.2; Velopack exigiría
reescribirlo sin beneficio inmediato para el usuario.

**Velopack es el candidato serio para una v0.4.x** si el proyecto empieza a publicar
versiones con frecuencia: los deltas de 20 KB vs 5,6 MB completos son un argumento
fuerte. Plan de migración (si se decide):
1. Agregar crate `velopack` + `UpdateManager` en `main.rs` (feature-flag).
2. Paso `vpk pack` en el workflow (reemplaza tauri-action para Windows).
3. Probar delta real entre dos builds consecutivos y el flujo de restart.
