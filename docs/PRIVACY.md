# Política de Privacidad — Aether IDE

*Última actualización: v0.2.0*

## Resumen

Aether IDE es una aplicación de escritorio que procesa tu código y tus conversaciones **localmente**. No operamos servidores: no hay telemetría, no hay recopilación de datos y no hay cuentas de usuario.

## Qué datos se procesan y dónde

| Dato | Dónde se procesa / almacena |
|---|---|
| Tu código y archivos | 100% local (tu disco). Solo sale de tu equipo si tú lo envías explícitamente a un proveedor de IA |
| Conversaciones con IA | 100% local (archivos JSON en tu carpeta de datos) |
| API keys de proveedores | **Keychain del sistema operativo** (Credential Manager en Windows, Keychain en macOS). Nunca en archivos planos ni expuestas a la interfaz |
| Configuración y sesión | 100% local (JSON en tu carpeta de datos) |
| Solicitudes a proveedores de IA | Van **directamente** del cliente al proveedor que tú elijas (OpenAI, Anthropic, etc.). Aether IDE no actúa como intermediario ni registra esas llamadas |
| Iconos del marketplace (Open VSX) | Descarga única y opcional desde `open-vsx.org` (solo si instalas Material Icon Theme) |
| Búsqueda de extensiones | Consultas a la API pública de Open VSX solo cuando usas el buscador del marketplace |

## Qué NO hacemos

- ❌ No recopilamos telemetría ni métricas de uso
- ❌ No operamos servidores ni backend propio
- ❌ No vendemos ni compartimos datos con terceros
- ❌ No almacenamos tus API keys fuera del keychain del SO
- ❌ No enviamos tu código a ningún servidor de Aether IDE (no existe)

## Responsabilidad con los proveedores de IA

Cuando envías un prompt (con o sin contexto de archivos adjuntos por `@`), la solicitud viaja **directamente** al proveedor de IA que hayas seleccionado y configurado con tu propia API key. El tratamiento de esos datos se rige por la política de privacidad del proveedor correspondiente.

## Cambios

Los cambios a esta política se publicarán en este documento con el número de versión correspondiente en el repositorio del proyecto.

## Contacto

Pixel Alquimia Studios — [repositorio del proyecto](https://github.com/Pixel-Alquimia-Studios/Aether-IDE)

---

# Privacy Policy — Aether IDE (English)

**Summary**: Aether IDE is a desktop application that processes your code and conversations **locally**. We run no servers: no telemetry, no data collection, no user accounts. Your code only leaves your machine when you explicitly send a prompt to an AI provider of your choice. API keys are stored in the OS keychain. Extension icon packs are optionally downloaded from `open-vsx.org`. AI requests go directly from the client to the selected provider — Aether IDE never acts as a proxy and never logs those calls.
