# Términos de Uso y Servicio — Aether IDE

*Última actualización: v0.2.0*

## 1. Licencia

Aether IDE se distribuye bajo la licencia **Apache 2.0**. Puedes usar, modificar y redistribuir la aplicación conforme a los términos de dicha licencia (ver archivo `LICENSE` del repositorio).

## 2. Descripción del servicio

Aether IDE es un editor de código de escritorio con integración de APIs de inteligencia artificial de terceros. La aplicación se ejecuta íntegramente en tu equipo: el procesamiento de archivos, la persistencia de sesiones y la gestión de credenciales ocurren localmente.

## 3. Uso de proveedores de IA de terceros

- Para utilizar las funciones de IA necesitas **tu propia API key** de un proveedor compatible, que se almacena únicamente en el keychain de tu sistema operativo.
- Las solicitudes a proveedores de IA (OpenAI, Anthropic, Google, etc.) se realizan **directamente** desde tu equipo al proveedor seleccionado. Aether IDE no intermedia ni almacena dichas solicitudes.
- El uso de las APIs de dichos proveedores está sujeto a sus propios términos de servicio, límites de tarifa y costes. Aether IDE no se hace responsable de los cargos que tu proveedor te facture por el consumo de tokens.

## 4. Herramientas del agente

El modo Agente puede **leer, crear, modificar y ejecutar** operaciones sobre los archivos de la carpeta de trabajo que abras, siempre con **confirmación previa del usuario** para acciones de escritura y ejecución de comandos. Los subagentes de análisis (`/qa`, `/security`, `/audit`) son de solo lectura.

Es tu responsabilidad revisar las acciones propuestas antes de aprobarlas. Los mecanismos de checkpoints y rollback se ofrecen como ayuda, sin garantía de restauración perfecta en todos los escenarios.

## 5. Limitación de responsabilidad

Aether IDE se proporciona "**tal cual**", sin garantías de ningún tipo. En la máxima medida permitida por la ley, el autor no será responsable de ningún daño directo, indirecto, incidental o consecuente derivado del uso de la aplicación, incluyendo (pero no limitado a) pérdida de datos, pérdida de beneficios o interrupción del negocio.

**Recomendación**: usa control de versiones (Git) en tus proyectos. Aether IDE lo integra precisamente para que siempre puedas volver a un estado anterior.

## 6. Cambios en los términos

Estos términos pueden actualizarse con cada versión de la aplicación. La versión vigente estará siempre disponible en este documento dentro del repositorio.

## Contacto

Pixel Alquimia Studios — [repositorio del proyecto](https://github.com/Pixel-Alquimia-Studios/Aether-IDE)

---

# Terms of Service — Aether IDE (English)

**1. License**: Aether IDE is distributed under the Apache 2.0 license.

**2. Service**: A desktop code editor with third-party AI API integration. Everything runs locally on your machine.

**3. Third-party AI providers**: You need your own API key (stored only in the OS keychain). Requests go directly from your machine to the selected provider; their use is subject to that provider's terms and costs. Aether IDE is not responsible for token usage charges.

**4. Agent tools**: The Agent mode can read, create, modify and run operations on files in your opened workspace, always with **user confirmation** for write/execute actions. Analysis subagents (`/qa`, `/security`, `/audit`) are read-only.

**5. Limitation of liability**: Aether IDE is provided "**as is**", without warranty of any kind. Use version control (Git) in your projects — always be able to return to a previous state.
