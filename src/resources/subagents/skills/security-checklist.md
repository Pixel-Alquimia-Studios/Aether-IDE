---
name: security-checklist
description: Checklist OWASP Top 10 completa de auditoría de seguridad con tabla de patrones y severidades, principios clave y falsos positivos
applies_to: [security, audit]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/security-reviewer.md -->

## Checklist OWASP Top 10 (a verificar leyendo el código real)

1. **Inyección**: queries parametrizadas? input de usuario sanitizado? ORM usado seguro?
2. **Auth rota**: passwords hasheadas (bcrypt/argon2)? JWT validado? sesiones seguras?
3. **Datos sensibles**: HTTPS forzado? secretos en env/keychain? logs sanitizados?
4. **XXE**: parsers XML configurados de forma segura? entidades externas deshabilitadas?
5. **Access control**: auth en cada ruta protegida? CORS bien configurado?
6. **Misconfig**: credenciales por defecto? debug activo en producción? security headers?
7. **XSS**: output escapado? CSP definida? auto-escape del framework activo?
8. **Deserialización insegura**: input de usuario deserializado con límites de tamaño y profundidad?
9. **Dependencias**: manifest (package.json/Cargo.toml) con versiones parchadas?
10. **Logging insuficiente**: los eventos de seguridad (auth fallida, cambios de permisos) quedan registrados? hay alertas?

## Patrones a marcar inmediatamente

| Patrón | Severidad | Corrección |
|---|---|---|
| Secretos hardcodeados | critical | env vars / keychain del SO |
| Comando shell con input de usuario | critical | APIs seguras / allowlist |
| SQL concatenado | critical | queries parametrizadas |
| `innerHTML = inputUsuario` | high | `textContent` o DOMPurify |
| `fetch(urlDelUsuario)` sin allowlist | high | whitelist de dominios |
| Comparación de password en texto plano | critical | bcrypt.compare() |
| Ruta sin check de auth | critical | middleware de autenticación |
| Check de saldo sin lock | critical | `FOR UPDATE` dentro de transacción |
| Endpoint público sin rate limiting | high | throttling |
| Log de passwords/secrets | medium | sanitizar salida de logs |

## Falsos positivos comunes (verificar contexto antes de marcar)

- Variables de entorno en `.env.example` (no son secretos reales).
- Credenciales de test en archivos de test claramente marcados.
- API keys públicas (si realmente están pensadas para ser públicas).
- SHA256/MD5 para checksums (no para passwords).
- `Math.random()` en contexto no criptográfico (animaciones, sampling).
- Validación aparente ausente cuando el framework del proyecto ya sanea por defecto (auto-escape, ORM parametrizado): verifica la configuración real antes de marcar.

## Ejemplo de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"critical","file":"src-tauri/src/secrets.rs","line":42,"title":"API key hardcodeada","detail":"Se encontró una clave de API embebida en el código. Mover a variables de entorno o keychain y rotar la credencial expuesta."}]}
```
