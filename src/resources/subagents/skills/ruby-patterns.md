---
name: ruby-patterns
description: Patrones y anti-patrones Ruby y Rails — seguridad (SQLi, mass assignment, XSS), Active Record, calidad de código y migrations
applies_to: [qa, audit]
languages: [ruby]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/ruby-reviewer.md
     El original corre RuboCop/Brakeman/bundler-audit/rspec: aquí eso se convierte
     en "qué buscar leyendo el código" (los subagentes de Aether solo disponen de
     read_file, search_files y list_directory). -->

## Prioridades de revisión

### CRITICAL — Seguridad
- **Inyección SQL**: interpolación en `where`, `order`, `find_by_sql`, `pluck` o
  `Arel.sql` — usar hash conditions (`where(email: x)`) o bind parameters (`?`/named).
- **Mass Assignment**: `params.permit!`, `permit` con keys elegidas por el usuario, o
  pasar `params` crudo a `create`/`update` — usar strong parameters explícitos.
- **Reflexión insegura**: `send`, `public_send`, `constantize`, `safe_constantize` u
  `Object.const_get` sobre input de usuario — usar allowlist.
- **Inyección de comandos**: backticks, `%x{}`, `system`, `exec`, `Open3`,
  `Kernel#open` con input interpolado — pasar arrays de argumentos y NUNCA
  `Kernel#open` sobre rutas de usuario.
- **Deserialización insegura**: `Marshal.load`, `YAML.load`/`YAML.unsafe_load`,
  `Oj.load` en object mode sobre datos no confiables — usar `YAML.safe_load` o JSON.
- **XSS**: `html_safe`, `raw` o `<%==` sobre contenido de usuario — confiar en el
  escape de ERB o `sanitize` con allowlist.
- **Open Redirect**: `redirect_to params[:url]` — validar el host o usar
  `allow_other_host: false`.
- **Protecciones deshabilitadas**: `skip_forgery_protection`,
  `protect_from_forgery with: :null_session` en rutas de navegador, o
  `skip_before_action :authenticate_user!` sin justificación.
- **Secretos hardcodeados**: keys/tokens en código, `config/*.yml` o seeds — usar
  Rails credentials o variables de entorno.

### CRITICAL — Manejo de errores
- **Excepciones tragadas**: `rescue => e` sin log ni re-raise, o `rescue Exception`
  (captura también Interrupt/SignalException) — rescatar errores específicos.
- **Inline rescue modifier**: `value rescue nil` oculta fallos reales.
- **Autorización ausente**: acciones de controller que cargan registros sin scoping
  al usuario actual o check de Pundit/CanCanCan.
- **Fallo de persistencia silencioso**: valor de retorno de `save`/`update` ignorado
  donde importa — chequear el resultado o usar `save!`/`update!`.

### HIGH — Active Record / Rails
- **N+1 queries**: asociaciones accedidas en loops o views sin
  `includes`/`preload`/`eager_load`.
- **`Model.all.each` sobre tablas grandes** — usar `find_each`/`in_batches`.
- **Callbacks con side effects externos** (emails, HTTP, jobs) — mover a servicios
  explícitos o `after_commit`.
- **Constraints de DB ausentes** detrás de validaciones (índice de unicidad,
  `null: false`, foreign keys).
- **Migrations inseguras**: columnas con default o índices sobre tablas grandes sin
  `algorithm: :concurrently`; cambios de datos mezclados con cambios de esquema.
- **Fat controllers**: la lógica pertenece a models, service objects o form objects.
- **`update_all`, `delete_all`, `update_column(s)`, `insert_all`/`upsert_all`** sobre
  scopes alcanzables por el usuario — saltan validaciones y callbacks; confirmar que
  el scope está autorizado y que saltarse las reglas del modelo es intencional.
- **Jobs no idempotentes** o que reciben registros completos en vez de IDs.

### HIGH — Calidad de código
- Métodos > 25 líneas o > 4 parámetros (usar keyword arguments o un value object).
- Anidamiento > 3 niveles — guard clauses y early returns.
- **Monkey patches** de core classes fuera de un refinement/initializer con nombre claro.
- **`method_missing` sin `respond_to_missing?`** correspondiente.
- Lógica duplicada entre models/controllers — extraer concern o service.

### MEDIUM — Buenas prácticas
- **`# frozen_string_literal: true`** ausente donde el proyecto lo usa (verificar
  otro archivo del proyecto antes de reportar).
- Ruby no idiomático: `for` loops; simplificaciones de truthiness que CAMBIAN la
  semántica nil/false (preservar `!x.nil?` cuando `false` es valor no-nil legítimo);
  acumuladores manuales en vez de `map`/`each_with_object`/`sum`.
- `puts`, `p`, `pp`, `binding.pry`, `debugger`, `byebug` en código commiteado.
- Constantes mutables sin `.freeze`.
- Métodos predicado sin `?` final, o bang methods sin contraparte no-bang.
- Tests que golpean la red, dependen de orden o usan `sleep` — stubs con WebMock/VCR
  y time helpers.
- Factories que construyen grafos enormes por defecto — mantenerlas mínimas con traits.

## Qué comprobar "a lo RuboCop/Brakeman" (leyendo, sin ejecutar)

- **a lo Brakeman** (leyendo controllers/views): interpolações en `where`, `redirect_to`
  con params crudos, `render` con paths dinámicos, `eval`, `send` con input.
- **a lo RuboCop**: métodos largos, `attr_accessor` sobre estado mutable de clase,
  `Time.now` donde `Time.zone.now` corresponde (apps Rails con timezone), constantes
  de magic strings repetidas.
- **Gems vulnerables**: leer `Gemfile`/`Gemfile.lock` y señalar versiones conocidamente
  viejas de gems de seguridad crítica (rails, devise, nokogiri).

## Falsos positivos a NO reportar
- `rescue` específico con log + re-raise o manejo legítimo de negocio.
- `permit` explícito con keys fijas (correcto) — solo `permit!` o keys dinámicas son bug.
- `save` sin `!` cuando el valor de retorno se chequea inmediatamente (`if user.save`).
- `Time.now` en scripts sin zona horaria relevante (no Rails).

## Ejemplos de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"critical","file":"app/controllers/search_controller.rb","line":18,"title":"Inyección SQL por interpolación","detail":"User.where(\"name LIKE '%#{params[:q]}%'\") interpola input directo. Usar hash conditions: User.where(\"name LIKE :q\", q: \"%#{User.sanitize_sql_like(params[:q])}%\")."},{"severity":"high","file":"app/controllers/users_controller.rb","line":31,"title":"Mass assignment con permit!","detail":"params.permit! acepta CUALQUIER campo del request, incluidos role/admin. Usar strong parameters explícitos: params.require(:user).permit(:name, :email)."},{"severity":"medium","file":"app/models/import_job.rb","line":55,"title":"Inline rescue oculta fallos de import","detail":"value rescue nil convierte errores de parseo en nil silencioso. Rescatar la excepción específica, loguear y manejar."}]}
```
