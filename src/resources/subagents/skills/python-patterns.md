---
name: python-patterns
description: Patrones y anti-patrones Python: seguridad, manejo de errores, type hints, Pythonic idioms, concurrencia y checks de framework (Django/FastAPI/Flask)
applies_to: [qa, audit]
languages: [python]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/python-reviewer.md
     Las herramientas externas del original (mypy, ruff, pylint, black, bandit, pytest)
     se convirtieron en "qué buscar leyendo el código": los subagentes de Aether
     solo disponen de read_file, search_files y list_directory. -->

## Prioridades de revisión

### CRITICAL — Seguridad
- **Inyección SQL**: f-strings o concatenación en queries — buscar `execute(f"...{...}")`,
  `cursor.execute("SELECT ... " + var)`. Correcto: queries parametrizadas (`?` o `%(name)s`).
- **Inyección de comandos**: input sin validar en `os.system()`, `subprocess` con
  `shell=True` o string único — correcto: `subprocess.run([...])` con lista de args.
- **Path traversal**: rutas controladas por el usuario sin `os.path.normpath` ni
  rechazo de `..` — buscar `open(user_input)`, `Path(user_input)` sin validar.
- **`eval()`/`exec()`** sobre datos de usuario; **deserialización insegura**
  (`pickle.loads`, `yaml.load` sin `SafeLoader`); **secretos hardcodeados**
  (API keys, passwords en el código).
- **Cripto débil**: MD5/SHA1 para seguridad (hashlib.md5 en passwords/tokens).
- **YAML inseguro**: `yaml.load(f)` sin `Loader=yaml.SafeLoader`.

### CRITICAL — Manejo de errores
- **Bare except**: `except: pass` — capturar excepciones específicas.
- **Excepciones tragadas**: fallos silenciosos sin log ni re-raise.
- **Sin context managers**: gestión manual de archivos/recursos en vez de `with`.

### HIGH — Type hints
- Funciones públicas sin anotaciones de tipo.
- `Any` donde cabe un tipo específico; `Optional` ausente en parámetros nullables.

### HIGH — Patrones Pythonic
- **Argumentos default mutables**: `def f(x=[])` — usar `def f(x=None)` (bug clásico
  que persiste estado entre llamadas).
- Comprensiones de lista en vez de loops estilo C; `isinstance()` no `type() ==`;
  `Enum` no números mágicos; `"".join()` no concatenación en loops.

### HIGH — Calidad de código
- Funciones > 50 líneas o > 5 parámetros (usar dataclass); anidamiento > 4 niveles;
  código duplicado; números mágicos sin constantes con nombre.

### HIGH — Concurrencia
- Estado compartido sin locks (`threading.Lock`); mezcla incorrecta sync/async;
  N+1 queries en loops (agrupar la query).

### MEDIUM — Buenas prácticas
- PEP 8: orden de imports, naming, espaciado.
- Docstrings ausentes en funciones públicas; `print()` en vez de `logging`;
  `from module import *` (contamina el namespace); `value == None` (usar `is None`);
  shadowing de builtins (`list`, `dict`, `str` como nombres de variable).

## Checks de framework (qué buscar leyendo el código)

- **Django**: N+1 sin `select_related`/`prefetch_related`; multi-paso sin
  `transaction.atomic()`; modelos modificados sin migración correspondiente.
- **FastAPI**: CORS abierto (`allow_origins=["*"]`); endpoints sin validación Pydantic;
  llamadas bloqueantes dentro de rutas `async def`.
- **Flask**: errores sin handlers; CSRF sin proteger en formularios.

## Qué comprobar "a lo mypy/ruff/bandit" (leyendo, sin ejecutar)

- **a lo mypy**: funciones públicas sin type hints; union types implícitos mal
  manejados (`Optional` sin guard).
- **a lo bandit**: `eval`, `exec`, `pickle`, `yaml.load`, `subprocess` con `shell=True`,
  MD5/SHA1, secretos en literales — buscar con search_files esos tokens.
- **a lo ruff**: imports sin usar, variables sin usar, comparaciones `== None`,
  f-strings sin variables.

## Falsos positivos a NO reportar
- `except Exception` con log y re-raise correcto.
- Type hints ausentes en código de test o scripts de un solo uso.
- `subprocess.run([...])` con lista de args fijos sin input de usuario.
- `yaml.safe_load` (es seguro aunque se llame `load` a nivel de wrapper propio).

## Ejemplos de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"critical","file":"app/db.py","line":42,"title":"Inyección SQL vía f-string","detail":"La query se construye con f-string e input del usuario: execute(f\"SELECT * FROM users WHERE name = '{name}'\"). Usar parámetros: cursor.execute('SELECT * FROM users WHERE name = %s', (name,))."},{"severity":"high","file":"app/utils.py","line":"18","title":"Argumento default mutable","detail":"def collect(item, bucket=[]) comparte la misma lista entre llamadas: los resultados se acumulan entre invocaciones. Usar def collect(item, bucket=None) + bucket = bucket or []."},{"severity":"medium","file":"app/report.py","line":77,"title":"Bare except silencia fallos","detail":"except: pass en el parseo del reporte convierte errores de datos en resultados vacíos sin rastro. Capturar Exception específico y loguear con traceback."}]}
```
