---
name: kotlin-patterns
description: Patrones y anti-patrones Kotlin (Android/KMP/Compose) — arquitectura limpia, corutinas y Flows, recomposición, idiomas y seguridad
applies_to: [qa, audit]
languages: [kotlin]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/kotlin-reviewer.md
     El original corre git diff y revisa build.gradle.kts: aquí eso se convierte en
     "qué buscar leyendo el código" (los subagentes de Aether solo disponen de
     read_file, search_files y list_directory). -->

## Prioridades de revisión

### Arquitectura (CRITICAL)
- **El dominio importa framework**: el módulo `domain` no debe importar Android,
  Ktor, Room ni ningún framework — buscar imports de framework en archivos del
  módulo de dominio.
- **Data layer llegando a la UI**: entidades/DTOs expuestos a la presentación sin
  mapear a modelos de dominio.
- **Lógica de negocio en ViewModel**: la lógica compleja pertenece a UseCases.
- **Dependencias circulares**: módulo A depende de B y B de A.

### Corutinas y Flows (HIGH)
- **GlobalScope**: debe usarse scopes estructurados (`viewModelScope`,
  `coroutineScope`) — buscar `GlobalScope.launch`.
- **Tragar CancellationException**: `catch (e: Exception)` sin re-lanzar rompe la
  cancelación — debe re-lanzarla o no capturarla:

  ```kotlin
  // MAL — traga la cancelación
  try { fetchData() } catch (e: Exception) { log(e) }
  // BIEN — preserva la cancelación
  try { fetchData() } catch (e: CancellationException) { throw e } catch (e: Exception) { log(e) }
  ```
- **`withContext` ausente para IO**: llamadas de DB/red en `Dispatchers.Main`.
- **Estado mutable dentro de StateFlow**: colecciones mutables compartidas (copiar
  antes de emitir).
- **Flow recolectado en `init {}`**: usar `stateIn()` o lanzar en un scope.
- **`SharingStarted.Eagerly`** donde correspondería `WhileSubscribed`.

### Compose (HIGH)
- **Parámetros inestables**: composables que reciben tipos mutables → recomposición
  innecesaria.
- **Side effects fuera de LaunchedEffect**: llamadas de red/DB directamente en el
  cuerpo del composable.
- **NavController pasado profundo**: pasar lambdas, no referencias al NavController.
- **`key()` ausente en LazyColumn**: items sin keys estables → rendimiento pobre.
- **`remember` sin keys**: cálculo no recalculado cuando cambian sus dependencias.
- **Asignaciones inline en parámetros**: lambdas/objetos creados en cada recomposición:

  ```kotlin
  // MAL — lambda nueva en cada recomposición
  Button(onClick = { viewModel.doThing(item.id) })
  // BIEN — referencia estable
  val onClick = remember(item.id) { { viewModel.doThing(item.id) } }
  Button(onClick = onClick)
  ```

### Kotlin idioms (MEDIUM)
- **`!!`**: aserción non-null — preferir `?.`, `?:`, `requireNotNull`, `checkNotNull`.
- **`var` donde `val` basta**; patrones estilo Java (clases utilitarias estáticas →
  funciones top-level; getters/setters → propiedades).
- **Concatenación de strings**: usar templates `"Hello $name"`.
- **`when` no exhaustivo** sobre sealed classes/interfaces.
- **Colecciones mutables expuestas**: devolver `List`, no `MutableList`, en APIs públicas.

### Android específico (MEDIUM)
- **Context leaks**: referencias a `Activity`/`Fragment` en singletons/ViewModels.
- **Reglas de ProGuard ausentes**: clases serializadas sin `@Keep`.
- **Componentes exportados** en el manifest, deep links e intent filters sin validar;
  crypto/WebView/network config insegura; manejo de keystore/tokens.
- **Seguridad Kotlin/Android previa a todo**: exported components, deep links,
  keystore y credentials — si hay CRITICAL de seguridad, reportarlo como máximo
  severidad y no continuar el análisis normal sin mencionarlo.

### Flows adicionales (HIGH)
- StateFlow con colecciones mutables (List/MutableList) — emitir copias inmutables.
- `collect` en composables sin `collectAsStateWithLifecycle` (sigue activo en background).

## Qué comprobar "a lo detekt/ktlint" (leyendo, sin ejecutar)

- **a lo detekt**: funciones largas, clases con demasiadas responsabilidades, complexidad
  ciclomática por anidamiento de `let`/`run` encadenados.
- **a lo ktlint**: imports sin usar (buscar `import` sin uso en el archivo), formato de
  chains, wildcard imports (`import x.y.*`).

## Falsos positivos a NO reportar
- `!!` en tests con expectativa clara de no-null.
- `Dispatchers.Main` en previews o test doubles.
- Lambdas sin `remember` en composables que NO recomponen con frecuencia (hoisting
  es optimización, no bug funcional).
- `MutableStateFlow` interno privado con exposición inmutable pública (patrón correcto).

## Ejemplos de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"high","file":"app/src/main/java/com/app/ui/MainViewModel.kt","line":66,"title":"CancellationException tragada","detail":"catch (e: Exception) captura la CancellationException y la loguea: la corutina cancelada sigue ejecutando. Re-lanzar CancellationException antes del catch genérico."},{"severity":"high","file":"app/src/main/java/com/app/data/UserRepository.kt","line":41,"title":"IO en Dispatchers.Main","detail":"La llamada a la API corre sin withContext(Dispatchers.IO): bloquea el main thread. Envolver con withContext(Dispatchers.IO) o inyectar el dispatcher."},{"severity":"medium","file":"app/src/main/java/com/app/ui/list/UserListScreen.kt","line":92,"title":"LazyColumn sin keys estables","detail":"items(list) sin key = { it.id } recompone todo en reordenamientos. Añadir key = { it.id }."}]}
```
