---
name: secrets-and-input
description: Gestión de secretos y validación de entrada: patrones FAIL/PASS para detectar exposición de credenciales e inputs sin validar
applies_to: [security, audit]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/skills/security-review/SKILL.md -->

## Gestión de secretos

**FALLA (buscar):**
```typescript
const apiKey = "sk-proj-xxxxx"   // secreto hardcodeado
const dbPassword = "password123" // en código fuente
console.log("login:", { email, password }) // secreto en logs
```

**CORRECTO (patrón esperado):**
```typescript
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
```

Checklist:
- [ ] Sin API keys, tokens ni passwords en el código fuente
- [ ] Secretos en variables de entorno / keychain del SO
- [ ] Sin secretos en logs ni en mensajes de error
- [ ] `.env` en .gitignore; sin secretos en el historial de git
- [ ] Mensajes de error genéricos para el usuario (sin stack ni detalles internos)

## Validación de entrada

Checklist:
- [ ] Todo input externo (HTTP, IPC, archivos, CLI) validado antes de usarse
- [ ] Validación por allowlist (no blacklist)
- [ ] Uploads de archivos: límite de tamaño + tipo + extensión
- [ ] Sin input directo del usuario en queries ni rutas de archivos
- [ ] Rutas de archivos canonizadas y verificadas dentro del workspace

## Ejemplo de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"high","file":"src/lib/commands/fs.ts","line":19,"title":"Path sin validar","detail":"write_file recibe la ruta directamente del input sin canonizar ni verificar que esté dentro del workspace: permite escribir fuera del proyecto. Aplicar canonicalize + verificación de prefijo."}]}
```
