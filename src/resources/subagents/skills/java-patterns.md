---
name: java-patterns
description: Patrones y anti-patrones Java para Spring Boot y Quarkus — seguridad, JPA/Panache, arquitectura en capas, concurrencia, MongoDB y testing
applies_to: [qa, audit]
languages: [java]
---

<!-- Adaptado de affaan-m/ECC (MIT) — https://github.com/affaan-m/ECC/blob/main/agents/java-reviewer.md
     El original detecta framework leyendo el build file y corría mvn/gradle/spotbugs/
     checkstyle: aquí eso se convierte en "qué buscar leyendo el código" (los
     subagentes de Aether solo disponen de read_file, search_files y list_directory).
     Lee el build file (pom.xml / build.gradle) con read_file para saber si aplica
     [SPRING] (contiene spring-boot) o [QUARKUS] (contiene quarkus) antes de revisar. -->

## Detección de framework (primero)

Leer `pom.xml` o `build.gradle(.kts)` de la raíz con read_file:
- Contiene `spring-boot` → aplicar reglas **[SPRING]**
- Contiene `quarkus` → aplicar reglas **[QUARKUS]**
- Ambos → reportar como hallazgo y aplicar ambos
- Ninguno → reglas generales de Java, mencionando la ambigüedad

## Prioridades de revisión

### CRITICAL — Seguridad
- **Inyección SQL**: concatenación en queries — usar bind parameters (`:param` o `?`)
  - **[SPRING]**: vigilar `@Query`, `JdbcTemplate`, `NamedParameterJdbcTemplate`
  - **[QUARKUS]**: vigilar `@Query`, queries custom de Panache, `EntityManager.createNativeQuery()`
- **Inyección de comandos**: input de usuario en `ProcessBuilder` o `Runtime.exec()`
- **Inyección de código**: input de usuario en `ScriptEngine.eval(...)` — evitar
  ejecutar scripts no confiables
- **Path traversal**: input de usuario en `new File(userInput)`, `Paths.get(userInput)`,
  `FileInputStream(userInput)` sin validación con `getCanonicalPath()`
- **Secretos hardcodeados**: keys/passwords/tokens en el código
  - **[SPRING]**: deben venir de entorno, `application.yml` o secrets manager (Vault)
  - **[QUARKUS]**: de `application.properties`, entorno o `quarkus-vault`
- **Logueo de PII/tokens**: llamadas de log cerca de código de auth que expongan
  passwords o tokens
- **Validación de entrada ausente**: cuerpos de request aceptados sin Bean Validation
  - **[SPRING]**: `@RequestBody` crudo sin `@Valid`
  - **[QUARKUS]**: `@RestForm`/`@BeanParam` sin `@Valid`
- **CSRF deshabilitado sin justificación**: APIs stateless JWT pueden omitirlo pero
  deben documentar por qué

### CRITICAL — Manejo de errores
- **Excepciones tragadas**: `catch (Exception e) {}` vacío o sin acción
- **`.get()` sobre Optional** sin `.isPresent()` — usar `.orElseThrow()`
  - **[SPRING]**: `repository.findById(id).get()`
  - **[QUARKUS]**: `repository.findByIdOptional(id).get()`
- **Manejo de excepciones sin centralizar**:
  - **[SPRING]**: falta `@RestControllerAdvice`
  - **[QUARKUS]**: falta `ExceptionMapper<T>` o `@ServerExceptionMapper`
- **HTTP status erróneo**: `200 OK` con body null en vez de `404`; `201` ausente en creación

### HIGH — Arquitectura
- **Estilo de inyección**:
  - **[SPRING]**: `@Autowired` en campos es code smell — requerir inyección por constructor
  - **[QUARKUS]**: referencias de campo desnudas esperando CDI — usar `@Inject` o constructor
- **[QUARKUS] `@Singleton` vs `@ApplicationScoped`**: `@Singleton` no se proxied y rompe
  lazy init e interceptores — preferir `@ApplicationScoped` salvo necesidad explícita
- **Lógica de negocio en controllers/resources**: debe delegar al service layer de inmediato
- **`@Transactional` en capa equivocada**: pertenece al service, no al controller ni al
  repository
  - **[SPRING]**: falta `@Transactional(readOnly = true)` en métodos de lectura
  - **[QUARKUS]**: mutaciones Panache (`persist()`, `delete()`, `update()`) fuera de
    contexto transaccional fallan
- **Entidad expuesta en respuesta**: entidad JPA/Panache devuelta directamente — usar
  DTO o proyección a record
- **[QUARKUS] Blocking en hilo reactivo**: I/O bloqueante (JDBC, file, `Thread.sleep()`)
  desde endpoint `@NonBlocking` o pipeline `Uni`/`Multi` — usar `@Blocking` o
  `.runSubscriptionOn(executor)`

### HIGH — JPA / Base de datos relacional
- **N+1 queries**: `FetchType.EAGER` en colecciones — usar `JOIN FETCH` o `@EntityGraph`
- **Endpoints de listado sin paginar**:
  - **[SPRING]**: devolver `List<T>` sin `Pageable`/`Page<T>`
  - **[QUARKUS]**: devolver `List<T>` sin `PanacheQuery.page(Page.of(...))`
- **`@Modifying` ausente**: toda `@Query` que mute datos requiere `@Modifying` + `@Transactional`
- **Cascade peligroso**: `CascadeType.ALL` con `orphanRemoval = true` — confirmar intención
- **[QUARKUS] Active record inconsistente**: mezclar `PanacheEntity` y `PanacheRepository`
  en el mismo bounded context — elegir uno

### HIGH — Panache MongoDB [QUARKUS]
- **Codec/serialización ausente**: tipos custom en documentos sin `Codec` registrado o
  anotación BSON — fallos de serialización silenciosos
- **`listAll()`/`findAll()` sin paginar** — usar `.find(query).page(Page.of(index, size))`
- **Sin índice en campos consultados** — definir índices vía `@MongoEntity` o `createIndex()`
- **ObjectId vs ID custom**: campos `String` sin `@BsonId` explícito — mapeo `_id` roto
- **MongoClient bloqueante en pipeline reactivo** — usar `ReactiveMongoClient` con `Uni`/`Multi`
- **Transacciones**: MongoDB multi-documento requiere `ClientSession` explícito — Panache
  MongoDB NO auto-gestiona transacciones como Hibernate; documentar garantías

### MEDIUM — NoSQL general
- **Evolución de esquema sin plan de migración** (campo `schemaVersion` o script) —
  fallos de deserialización en documentos viejos
- **Blobs grandes en documentos** en vez de GridFS/almacenamiento externo — presión de
  memoria y límite de 16 MB BSON
- **Documentos sobre-anidados** que deberían ser colecciones con referencias
- **Sin TTL** para datos efímeros (sesiones, tokens, cachés) — crecimiento sin límite
- **Read preference/write concern por defecto** en producción sin evaluar consistencia

### MEDIUM — Concurrencia y estado
- **Campos mutables en singletons**: campos de instancia no-final en beans singleton —
  race condition ([SPRING]: `@Service`; [QUARKUS]: `@ApplicationScoped`/`@Singleton`)
- **Ejecución async sin acotar**:
  - **[SPRING]**: `CompletableFuture`/`@Async` sin `Executor` custom — hilos sin límite
  - **[QUARKUS]**: `ExecutorService.submit()` sin `ManagedExecutor` gestionado
- **`@Scheduled` bloqueante**: métodos largos que bloquean el hilo del scheduler
  ([QUARKUS]: `concurrentExecution = SKIP` o worker thread)
- **[QUARKUS] Misuse de streams reactivos**: pipelines `Uni`/`Multi` suscritos más de
  una vez o con estado mutable compartido entre suscriptores

### MEDIUM — Idiomas Java y rendimiento
- **Concatenación de strings en loops**: usar `StringBuilder` o `String.join`
- **Tipos crudos**: genéricos sin parametrizar (`List` en vez de `List<T>`)
- **Pattern matching perdido**: `instanceof` + cast explícito — usar pattern matching (Java 16+)
- **Null desde service layer**: preferir `Optional<T>`
- **[QUARKUS]**: reflexión en runtime sustituible por build-time init o `@RegisterForReflection`

### MEDIUM — Testing
- **Anotaciones sobre-scoped**:
  - **[SPRING]**: `@SpringBootTest` para unit tests — usar `@WebMvcTest` (controllers),
    `@DataJpaTest` (repositories)
  - **[QUARKUS]**: `@QuarkusTest` solo para integración; JUnit 5 + Mockito para unidades
- **Mocks mal configurados**: service tests con `@ExtendWith(MockitoExtension.class)`;
  [QUARKUS]: `@InjectMock` reservado para tests CDI
- **`Thread.sleep()` en tests**: usar Awaitility para aserciones async
- **Nombres de test débiles**: `testFindUser` — usar `should_return_404_when_user_not_found`

### MEDIUM — Workflow / state machine (pagos y event-driven)
- **Idempotency key verificada DESPUÉS de procesar**: debe chequearse antes de cualquier
  mutación de estado
- **Transiciones ilegales**: sin guard en `CANCELLED → PROCESSING`
- **Compensación no atómica**: rollback que puede aplicar parcialmente
- **Retry sin jitter**: backoff exponencial sin jitter → thundering herd
  ([SPRING]: Spring Retry; [QUARKUS]: `@Retry` de MicroProfile Fault Tolerance)
- **Sin dead-letter**: eventos async fallidos sin fallback ni alerta
  ([SPRING]: error handlers de Spring Kafka/AMQP; [QUARKUS]: `@Incoming` con nack/dead-letter)

## Qué comprobar "a lo spotbugs/checkstyle" (leyendo, sin ejecutar)

- **a lo spotbugs**: `equals` sin `hashCode`, comparación de Strings con `==`,
  streams/cursors sin cerrar (try-with-resources ausente), autos boxing en loops.
- **a lo checkstyle**: imports no usados o wildcard, líneas gigantes, nombres de
  constantes no-UPPER_SNAKE, orden de miembros de clase.
- **a lo dependency-check**: versiones de dependencias con CVEs conocidos leyendo
  `pom.xml`/`build.gradle` (spring-*.jar viejos, log4j < 2.17, etc.).

## Falsos positivos a NO reportar
- `@Transactional` en tests de integración (correcto para rollback automático).
- DTOs manuales cuando MapStruct/mapper ya está en el proyecto y se usa consistentemente.
- `Optional.orElse(null)` con guard claro inmediato después.
- CSRF omitido documentado en APIs stateless JWT (debe existir comentario/README).
- `@Singleton` sin estado mutable compartido (no necesita proxy).

## Ejemplos de hallazgo bien formado

```aether-findings
{"findings":[{"severity":"critical","file":"src/main/java/com/app/repo/UserRepo.java","line":44,"title":"Inyección SQL en @Query [SPRING]","detail":"@Query construye el filtro concatenando el parámetro de búsqueda. Usar bind parameter: WHERE u.name = :name con @Param(\"name\")."},{"severity":"high","file":"src/main/java/com/app/service/OrderService.java","line":87,"title":"Optional.get() sin guard","detail":"repository.findById(id).get() lanza NoSuchElementException si no existe. Usar .orElseThrow(() -> new NotFoundException(id))."},{"severity":"high","file":"src/main/java/com/app/web/UserController.java","line":23,"title":"Entidad JPA expuesta en la respuesta","detail":"El endpoint devuelve la entidad directamente: filtra columnas sensibles y acopla la API al esquema. Proyectar a DTO/record."}]}
```
