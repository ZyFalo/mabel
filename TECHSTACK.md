# Tech Stack Definitivo — Mabel IA (MVP)

> Definido mediante discusión técnica multi-agente entre los 15 agentes del equipo de desarrollo (14 activos + 1 diferido). Cada decisión está justificada desde la expertís de cada agente y trazada a requisitos concretos de la tesis, historias de usuario y documentos del proyecto.
> Fecha de definición: 2026-02-18
> Última revisión: 2026-02-24 (Revisión 4 — ver Registro de Revisiones)

## Resumen Ejecutivo

Mabel IA es un asistente virtual de psicoeducación para salud mental estudiantil en la Universidad Manuela Beltrán (Bogotá, Colombia). El stack del MVP prioriza **simplicidad, privacidad por diseño y operación 100% local**, soportando chat conversacional con la API de Gemini de Google, interacción por voz (ASR/TTS), guardrails de seguridad con protocolo de crisis (SOS), y un esquema de 13 tablas en PostgreSQL. El stack está diseñado para ser mantenido por 3 estudiantes de Ingeniería de Software, cumplir con la normativa colombiana de protección de datos (Ley 1581/2012), y permitir una migración futura a Railway (nube) y a un LLM local (~3B con LoRA/QLoRA) sin reestructurar la aplicación, gracias a una capa de abstracción con adapter pattern. El reconocimiento emocional por voz (SER) queda preparado con una interfaz para integración Post-MVP, mientras que el reconocimiento emocional en el MVP se realiza mediante el check-in textual y el análisis de texto de los guardrails.

---

## Stack por Capa

### Backend

| Tecnología | Versión | Justificación |
|---|---|---|
| Python | 3.12.x | Runtime principal del backend. Necesario para integrar el ecosistema de ML/NLP (Whisper, Piper) con el servidor web en un solo lenguaje, evitando duplicar runtimes. La tesis define ASR/TTS locales, ambos implementados en Python. |
| FastAPI | ≥0.115 | Framework web async con documentación Swagger/OpenAPI auto-generada, requerida por el Agente 02 (Arquitecto) para los contratos de API entre frontend y backend. Soporta `StreamingResponse` para streaming de respuestas del LLM, contribuyendo a la latencia percibida ≤ 20s definida en los criterios de éxito del marco metodológico. |
| Pydantic | v2 (incluido con FastAPI) | Validación de datos tipada para todos los request/response models. Garantiza que los payloads de check-in (`mood`, `sleep`, `focus`, `note`) y `safety_flags` (`risk_detected`, `keywords`, `severity`) se validen antes de persistir, según el esquema de la tesis. |
| SQLAlchemy | ≥2.0 | ORM con soporte async nativo (a partir de 2.0). Implementa el Repository pattern definido por el Arquitecto. Se usa exclusivamente con PostgreSQL 16 (único motor del proyecto). Amplia documentación en Context7. |
| Alembic | ≥1.14 | Sistema de migraciones diseñado específicamente para SQLAlchemy. Permite evolución incremental del esquema de 13 tablas sin recrear la BD, según el principio de "cambio mínimo viable" del Agente 03 (Database Engineer). |
| Uvicorn | ≥0.34 | Servidor ASGI de alto rendimiento para FastAPI. Necesario para manejar requests async (chat, voz) con baja latencia. Soporte nativo para hot-reload en desarrollo. |
| PyJWT | ≥2.9 (`pyjwt[crypto]`) | Generación y validación de tokens JWT para autenticación. Reemplaza a python-jose (discontinuado desde 2022, con issues de seguridad sin resolver). PyJWT es activamente mantenida, más ligera, y recomendada en tutoriales modernos de FastAPI. HU-01 y HU-02 requieren registro e inicio de sesión seguro; JWT permite sesiones stateless compatibles con Railway futuro. |
| passlib[bcrypt] | ≥1.7 | Hashing seguro de contraseñas con bcrypt. La Ley 1581/2012 (citada en las bases legales de la tesis) exige "medidas de seguridad" para datos sensibles; bcrypt con salt automático cumple este requisito. |
| google-generativeai | ≥0.8 | SDK oficial de Python para la API de Gemini de Google. El MVP usa Gemini como motor de lenguaje (documento de agentes: "el sistema utilizará la API de Gemini de Google como motor de lenguaje"). El SDK maneja autenticación, rate limits y streaming de respuestas. |
| python-dotenv | ≥1.0 | Carga de variables de entorno desde archivos `.env`. Toda configuración (GEMINI_API_KEY, DATABASE_URL, CORS_ORIGINS) debe gestionarse vía env vars para inyección directa en Railway, según el Agente 11 (DevOps). |
| httpx | ≥0.27 | Cliente HTTP async para comunicación con servicios externos y testing. Usado por pytest como cliente de test para FastAPI (alternativa más moderna a `requests` con soporte async nativo). |
| structlog | ≥24.0 | Logging estructurado en formato JSON a stdout/stderr. Los logs estructurados son requisito del Agente 11 para compatibilidad con el sistema de observabilidad de Railway y para el registro de métricas técnicas (latencia, tokens, activaciones de guardrails) que el Agente 13 (Research) necesita para el análisis del estudio. |

### Frontend

| Tecnología | Versión | Justificación |
|---|---|---|
| React | 18.3.x | Biblioteca para SPA, definida explícitamente en la tesis ("SPA con React") y en el documento de agentes. React 18 ofrece concurrent rendering y Suspense, mejorando la experiencia del chat en tiempo real. Versión 18.3 por estabilidad y máxima cobertura de documentación en Context7. |
| Vite | ≥6.0 | Bundler ultra-rápido con HMR (Hot Module Replacement). Reemplaza a webpack/CRA con tiempos de build significativamente menores. Necesario para iteración rápida durante los sprints del MVP (6-7 sprints definidos en el flujo de trabajo entre agentes). |
| TailwindCSS | ≥3.4 | Framework CSS utility-first. Permite implementar rápidamente las opciones de accesibilidad requeridas por HU-09 (subtítulos, contraste alto, fuente grande) mediante clases condicionales (`dark:`, responsive prefixes). La versión 3.4 tiene documentación estable en Context7. |
| Zustand | ≥5.0 | Gestión de estado global ligera. Maneja auth, preferencias (save_history, checkin_enabled, accessibility), sesión activa y estado del chat sin el boilerplate de Redux. El Agente 05 necesita estado global para los toggles de HU-04, HU-10 y HU-11 que persisten entre vistas. |
| React Router | ≥6.28 | Enrutamiento declarativo para la SPA. Soporta las pantallas definidas en la Etapa 5.1 de las preguntas resueltas: registro, login, consentimiento, check-in, chat, preferencias, historial, detalle de conversación, panel SOS. |
| Axios | ≥1.7 | Cliente HTTP con interceptors para JWT. Simplifica la gestión de tokens (refresh automático, headers de autorización) en todas las llamadas al backend. Más ergonómico que fetch nativo para el manejo de errores y la inyección de headers de autenticación requerida por HU-02. |
| Node.js | 22 LTS | Runtime para el toolchain de desarrollo frontend (Vite, build). LTS garantiza soporte extendido y estabilidad para los sprints del proyecto. |

### Base de Datos

| Tecnología | Versión | Justificación |
|---|---|---|
| PostgreSQL | 16.x | Único motor de BD del proyecto tanto para desarrollo local (vía Docker Compose) como para producción futura (Railway Managed PostgreSQL). Se eliminó SQLite para garantizar dev/prod parity (principio 12-factor app) y eliminar la complejidad de compatibilidad dual de motores. La tesis define scripts DDL específicos para PostgreSQL 13+ con extensión pgcrypto, JSONB para campos flexibles (meta, safety_flags, accessibility, checkin_payload), CHECK constraints y ON DELETE CASCADE. PostgreSQL 16 añade mejoras de rendimiento en queries. |
| pgcrypto | (extensión de PostgreSQL) | Generación segura de UUIDs (`gen_random_uuid()`). El script PostgreSQL de la tesis abre con `CREATE EXTENSION IF NOT EXISTS pgcrypto` — es requisito explícito del esquema de BD. |

### Inteligencia Artificial (MVP)

| Tecnología | Versión | Justificación |
|---|---|---|
| Google Gemini API | v1 (vía SDK google-generativeai) | Motor de lenguaje del MVP. El documento de agentes establece: "el sistema utilizará la API de Gemini de Google como motor de lenguaje" durante la fase MVP. Gemini ofrece respuestas en español de alta calidad, filtros de seguridad integrados y streaming de respuestas. La integración se realiza exclusivamente a través de una capa de abstracción (adapter pattern) para permitir el swap futuro a un LLM local. |
| Adapter pattern (custom) | N/A | Capa de abstracción implementada como interface Python (Protocol/ABC) con un `GeminiAdapter` concreto. El Agente 02 (Arquitecto) establece como regla obligatoria que "todo diseño de integración con el motor de lenguaje DEBE usar una interface/adapter". Esto permite que el Agente 04 (Backend) reemplace Gemini por un LLM local en Post-MVP sin modificar la lógica de negocio, servicios ni endpoints. |

### Procesamiento de Voz

| Tecnología | Versión | Justificación |
|---|---|---|
| faster-whisper | ≥1.1 | ASR (Speech-to-Text) local optimizado con CTranslate2. Hasta 4x más rápido que el Whisper original de OpenAI con menor consumo de memoria, contribuyendo al objetivo de latencia ≤ 20s por turno. Modelo `small` para español: equilibrio entre precisión y velocidad en hardware local (Mac M4 / RTX 2060, según diagrama de despliegue). HU-07 requiere "transcripción local" con "botón mic". |
| Piper TTS | ≥2023.11.14 | TTS (Text-to-Speech) local ligero y rápido, con voces en español de alta calidad. Reemplaza a Coqui TTS (proyecto discontinuado/archivado). El Agente 07 requiere TTS local sin dependencias cloud, con voces configurables por el usuario (preferences.tts_voice según HU-07) e integración con subtítulos (HU-09). Piper está diseñado específicamente para ejecución edge/local. |
| FFmpeg | ≥6.0 | Procesamiento y conversión de audio entre formatos. Necesario para normalizar el audio capturado por el micrófono del navegador (WebM/Opus) al formato requerido por faster-whisper (WAV 16kHz). La tabla `attachments` de la tesis almacena adjuntos de tipo `audio`. |
| Web Audio API / MediaRecorder | (nativa del navegador) | Captura de audio del micrófono en el frontend. API nativa del navegador, sin dependencias adicionales. HU-07 requiere "botón mic" para hablar por voz; MediaRecorder captura el stream de audio que se envía al backend para ASR. |

> **Nota sobre SER (Speech Emotion Recognition):** El reconocimiento emocional por voz (speechbrain) fue diferido al Post-MVP tras evaluación multi-agente. En el MVP, el reconocimiento emocional se realiza mediante: (a) el check-in textual (ánimo 0-10, sueño, foco) al inicio de sesión, y (b) los guardrails de texto que detectan indicadores de riesgo en el contenido del mensaje. Se deja preparada una interfaz `EmotionAnalyzer(Protocol)` para integrar SER cuando se implemente. Ver Decisión Arquitectónica #11 y sección Post-MVP.

### Avatar 3D y Lip Sync

| Tecnología | Versión | Justificación |
|---|---|---|
| @react-three/fiber | ≥8.15 | Renderizado 3D declarativo integrado con React 18. Permite embeber un canvas WebGL como componente React con lazy loading vía `React.lazy()` + `Suspense`, alineado con la arquitectura SPA existente. El Agente 15 (3D & Avatar Engineer) lo usa como base del Modo Avatar. |
| @react-three/drei | ≥9.88 | Colección de helpers para React Three Fiber: `OrbitControls` (cámara), `Environment` (iluminación), `useGLTF` (carga de modelos). Reduce significativamente el boilerplate para el componente de avatar. |
| three | ≥0.160 | Motor WebGL subyacente requerido por React Three Fiber. Versión 0.160+ por mejoras en WebGL2 y compatibilidad con VRM 1.0. Se carga exclusivamente vía lazy loading (code splitting de Vite) cuando el usuario activa el Modo Avatar, sin impacto en el bundle del Modo Chat. |
| @pixiv/three-vrm | ≥3.0 | Carga y animación de modelos VRM (estándar abierto de Pixiv/VRoid). Incluye `VRMExpressionManager` con blend shapes nativos para lip sync (aa, ee, ih, oh, ou) y expresiones faciales (happy, sad, neutral, surprised, relaxed). Permite modelos intercambiables sin cambios de código vía variable de entorno. Elegido sobre ReadyPlayerMe SDK para mantener operación 100% local sin dependencia de servicios cloud. |
| Web Audio API (AnalyserNode) | (nativa del navegador) | Análisis de frecuencia de audio en tiempo real para lip sync. El `AnalyserNode` con FFT permite distinguir las 5 formas vocálicas básicas (A, E, I, O, U) que mapean a los blend shapes VRM, sin latencia adicional ni procesamiento backend. Ver ADR #14. |

> **Nota sobre lip sync:** Se eligió lip sync basado en análisis de frecuencia en frontend (Web Audio API) sobre alternativas backend (rhubarb-lip-sync, extracción de visemas desde Piper TTS) por: cero impacto en latencia, cero cambios backend, y viabilidad MVP. La calidad es suficiente para la evaluación de tesis. Ver ADR #14 y documento de decisión técnica completo en `docs/AVATAR_3D_DECISION_TECNICA.md`.

### Seguridad y Guardrails

| Tecnología | Versión | Justificación |
|---|---|---|
| Middleware FastAPI custom (Python) | N/A | Pipeline de prefiltro (mensajes del usuario) y postfiltro (respuestas de Gemini) implementado como middleware de FastAPI. Usa detección basada en keywords, regex y heurísticas NLP en español para identificar indicadores de riesgo: desesperanza, autodesvalorización, ideación suicida (definidos por el Agente 08). El criterio de éxito del Paso 0 exige "0 alertas críticas en prompts estándar"; un middleware Python custom es transparente, auditable y más simple que frameworks externos para 3 estudiantes. |
| re (regex) + listas de keywords | (stdlib Python) | Detección de patrones de riesgo mediante expresiones regulares y listas de palabras clave en español. El Agente 08 requiere implementar `safety_flags` por mensaje (`risk_detected`, `keywords`, `severity`) según el esquema de la tesis. regex permite detección rápida sin dependencias ML adicionales en el MVP. |
| hashlib | (stdlib Python) | Generación de `content_sha256` por mensaje para verificación de integridad. El esquema de la tesis define `content_sha256 TEXT` en la tabla `messages`. Usa SHA-256 de la librería estándar de Python, sin dependencias externas. |

### Testing

| Tecnología | Versión | Justificación |
|---|---|---|
| pytest | ≥8.0 | Framework de testing principal para el backend Python. Cubre tests unitarios, de integración y del Paso 0 (verificación automática) definido en el marco metodológico. El Agente 10 lo usa para verificar constraints de BD, flujos de auth, guardrails y latencia. Amplia documentación en Context7. |
| pytest-asyncio | ≥0.24 | Plugin de pytest para testing de código async. Necesario para testear los endpoints async de FastAPI y las integraciones con Gemini API, ASR/TTS. |
| Vitest | ≥2.0 | Framework de testing para el frontend React, nativo del ecosistema Vite. Cubre tests de componentes (chat, check-in, SOS, preferencias) y hooks. Compatible con React Testing Library para testing centrado en el usuario, alineado con el objetivo SUS ≥ 70. |
| Playwright | ≥1.49 | Tests end-to-end del flujo completo: registro → login → consentimiento → check-in → chat → guardrails → SOS → historial → reporte. El Agente 10 requiere E2E para validar los 5 casos de uso de la tesis. Playwright es más ligero que Cypress, con mejor paralelización y soporte multi-navegador para CI/CD. |
| Locust | ≥2.32 | Pruebas de rendimiento y carga. Mide latencia por turno (objetivo ≤ 20s), estabilidad bajo carga concurrente y consumo de recursos. El marco metodológico define métricas técnicas locales que Locust puede medir y reportar. |
| Coverage.py | ≥7.0 | Métricas de cobertura de tests del backend Python. El Agente 10 debe generar "métricas de cobertura" como entregable. |
| axe-core | ≥4.10 | Validación automatizada de accesibilidad WCAG. HU-09 requiere accesibilidad (subtítulos, contraste, fuente grande) y el Agente 09 exige cumplimiento WCAG. axe-core se integra con Playwright para auditoría automática de cada pantalla. |

### Calidad de Código

| Tecnología | Versión | Justificación |
|---|---|---|
| Ruff | ≥0.8 | Linter y formatter ultrarrápido para Python (escrito en Rust). Reemplaza flake8, isort y black en una sola herramienta con configuración unificada en `pyproject.toml`. Para 3 estudiantes trabajando en el mismo backend FastAPI, un formatter+linter consistente evita conflictos de estilo y detecta errores tempranos (imports no usados, variables shadow, complejidad ciclomática). Se integra en GitHub Actions y en pre-commit hooks. |
| ESLint | ≥9.0 | Linter estándar para JavaScript/React/JSX. Detecta patrones problemáticos, imports no usados, hooks mal utilizados (`eslint-plugin-react-hooks`) y accesibilidad (`eslint-plugin-jsx-a11y`). Tiene el mayor ecosistema de plugins y la documentación más extensa en Context7 — criterio decisivo frente a alternativas más nuevas como Biome. |
| Prettier | ≥3.4 | Formatter opinado para JavaScript, JSX, CSS, JSON y Markdown. Garantiza formato consistente en todo el frontend sin debates de estilo. Se integra con ESLint vía `eslint-config-prettier` para evitar conflictos de reglas. Configuración mínima: un archivo `.prettierrc` y listo. |

### DevOps e Infraestructura

| Tecnología | Versión | Justificación |
|---|---|---|
| Docker | ≥27.0 | Containerización de cada servicio (backend, frontend build, PostgreSQL). El Agente 11 requiere Dockerfiles Railway-ready desde el inicio. Docker garantiza que el entorno de desarrollo sea reproducible para los 3 estudiantes y replicable para el estudio cuasiexperimental (requisito de la tesis: "replicabilidad del estudio"). |
| Docker Compose | v2 | Orquestación local de servicios: backend (FastAPI), frontend (Vite dev/build), base de datos (PostgreSQL). Define la red local, volúmenes para persistencia de BD y variables de entorno. El servicio de inferencia LLM no aplica en el MVP (se consume Gemini vía API). |
| GitHub Actions | N/A | CI/CD automatizado: linting (Ruff + ESLint), formatting check (Prettier), tests (pytest + Vitest), build del frontend, validación en cada push. El flujo de trabajo entre agentes define CI/CD en la Fase de Cimentación (Sprints 1-2). GitHub Actions es gratuito para repositorios y se integra nativamente con el repositorio del proyecto. |

### Documentación

| Tecnología | Versión | Justificación |
|---|---|---|
| Notion (vía MCP) | N/A | Hub central de documentación del proyecto. El Agente 14 tiene como misión mantener la página 'Mabel IA Documentation' como fuente única de verdad, usando las herramientas del MCP de Notion (search, fetch, create-pages, update-page). Cubre ADRs, changelog, guías de desarrollo, esquema de BD y manual de usuario. |
| Swagger UI / OpenAPI | (auto-generado por FastAPI) | Documentación interactiva de la API REST. FastAPI genera automáticamente la especificación OpenAPI 3.1 y Swagger UI en `/docs`. El Agente 02 exige "contratos de API (OpenAPI/Swagger) entre frontend y backend ANTES de la implementación". No requiere configuración adicional. |
| Mermaid | ≥11.0 | Diagramas como código (secuencia, flujo, ER) embebidos en Markdown y Notion. Permite mantener diagramas actualizados junto al código sin herramientas externas. Útil para documentar los flujos de los 5 casos de uso de la tesis. |

### Diseño y Prototipado

| Tecnología | Versión | Justificación |
|---|---|---|
| Figma | N/A (SaaS) | Herramienta principal de diseño de mockups y prototipos de alta fidelidad. Los mockups de la tesis (Figuras 18-34) fueron creados en Figma ("Usando la herramienta de Software Figma"). El Agente 09 la usa para diseñar todas las pantallas, el sistema de diseño (paleta empática, tipografía) y los prototipos interactivos antes de implementación. |
| Pencil (archivo .pen) | N/A | Archivo de mockups alternativo (`Mockups/mabel.pen`) accesible vía MCP de Pencil. El CLAUDE.md del proyecto establece que los mockups .pen deben accederse exclusivamente con herramientas Pencil MCP, no con Read/Grep. |
| Lighthouse | (extensión de navegador) | Auditoría de rendimiento, accesibilidad, SEO y mejores prácticas del frontend. El Agente 09 requiere validar accesibilidad WCAG y el objetivo SUS ≥ 70 incluye usabilidad percibida que Lighthouse ayuda a optimizar. |

### Análisis e Investigación

| Tecnología | Versión | Justificación |
|---|---|---|
| Jupyter Notebook | ≥7.0 | Entorno interactivo para análisis de datos del estudio cuasiexperimental. El Agente 13 lo usa para ejecutar los análisis estadísticos de la Fase 2 (descriptivos, t pareada/Wilcoxon, Cohen's d) y generar visualizaciones reproducibles. |
| pandas | ≥2.2 | Manipulación y limpieza de datasets anonimizados (pretest/posttest, métricas técnicas). El marco metodológico de la tesis define: "consolidando tres fuentes: cuestionarios pre/post, métricas técnicas locales, evidencia cualitativa". pandas unifica estas fuentes para análisis. |
| scipy | ≥1.14 | Pruebas estadísticas: t pareada (normalidad) o Wilcoxon (no paramétrica) para comparación pre-post intra-sujeto. El marco metodológico especifica explícitamente estas pruebas y el reporte de tamaño de efecto con Cohen's d. |
| statsmodels | ≥0.14 | Modelos estadísticos complementarios: intervalos de confianza 95%, descriptivos avanzados. La tesis requiere "IC 95%" en los reportes de resultados. |
| matplotlib + seaborn | ≥3.9 / ≥0.13 | Visualizaciones: "gráficos pre/post, distribución SUS, dashboards de métricas técnicas" (responsabilidad del Agente 13). seaborn genera boxplots y gráficos de distribución profesionales sobre matplotlib. |

---

## Decisiones Arquitectónicas Clave

### 1. Monolito local con servicios containerizados (no microservicios)

La arquitectura es un **monolito modular en FastAPI** con servicios de voz como módulos internos, todo orquestado por Docker Compose. No se adoptan microservicios porque: (a) el equipo son 3 estudiantes que necesitan simplicidad operativa, (b) el despliegue del MVP es 100% local, (c) la comunicación entre componentes (chat → guardrails → LLM → TTS) se beneficia de llamadas in-process sin overhead de red. El diagrama de componentes de la tesis muestra un componente "Backend API (FastAPI)" central que integra todos los servicios.

### 2. SQLAlchemy 2.0 como ORM (no Tortoise ORM)

El Agente 04 listaba SQLAlchemy y Tortoise como opciones. Se elige **SQLAlchemy 2.0+** porque: (a) soporta async nativo desde la versión 2.0, eliminando la ventaja histórica de Tortoise, (b) tiene la comunidad más grande y documentación más extensa en Context7 (consulta obligatoria para todos los agentes de código), (c) Alembic está diseñado específicamente para SQLAlchemy, y (d) los 3 estudiantes encontrarán más recursos de aprendizaje, tutoriales y soporte para SQLAlchemy.

### 3. JWT stateless para autenticación (no sessions server-side)

Se eligen **tokens JWT** sobre sesiones en servidor porque: (a) JWT es stateless, lo que facilita la migración a Railway (sin necesidad de sticky sessions ni almacén de sesiones compartido), (b) el frontend SPA consume una API REST donde JWT en headers es el patrón estándar, (c) simplifica el escalado horizontal futuro. Los tokens se firman con HS256 vía **PyJWT** usando una clave secreta en variable de entorno. Se migró de python-jose a PyJWT por la discontinuación de la primera (ver Registro de Revisiones).

### 4. Zustand para gestión de estado (no Redux ni Context API solo)

Se elige **Zustand** sobre Redux y Context API porque: (a) Redux es excesivo para el estado de esta aplicación (auth, preferencias, sesión de chat) y requiere boilerplate significativo, (b) Context API solo causa re-renders innecesarios en árboles de componentes grandes, (c) Zustand ofrece una API minimalista (store en ~10 líneas) con selectores para evitar re-renders y es suficiente para los toggles de HU-04/HU-10/HU-11 y el estado del chat.

### 5. faster-whisper sobre openai-whisper para ASR

Se elige **faster-whisper** (basado en CTranslate2) sobre la implementación original de OpenAI porque es hasta 4x más rápido y consume menos memoria, factor crítico dado que el presupuesto de latencia total por turno es ≤ 20s (criterio de éxito del estudio) y debe incluir ASR + inferencia Gemini + postfiltro + TTS. El modelo `small` para español ofrece un equilibrio entre precisión (WER competitivo en español) y velocidad (~2-4s por utterance en CPU, <1s en GPU).

### 6. Piper TTS sobre Coqui TTS

Se elige **Piper** sobre Coqui TTS porque: (a) Coqui TTS fue archivado/discontinuado en 2024, sin mantenimiento activo, (b) Piper está activamente mantenido por el proyecto Rhasspy, (c) Piper está diseñado específicamente para ejecución local/edge con baja latencia, (d) tiene voces en español de calidad (incluyendo variantes latinoamericanas), (e) es significativamente más ligero que Coqui, permitiendo que el pipeline completo de voz se ejecute en hardware estándar sin GPU dedicada.

### 7. Guardrails custom en Python (no NeMo Guardrails en MVP)

Se implementan **guardrails como middleware FastAPI custom** usando regex y listas de keywords en español, en lugar de adoptar NVIDIA NeMo Guardrails, porque: (a) NeMo requiere aprender Colang (lenguaje DSL propietario), añadiendo curva de aprendizaje para 3 estudiantes, (b) para el MVP los guardrails son principalmente detección de keywords de riesgo (desesperanza, autolesión, ideación suicida) y validación de tono, que regex + heurísticas cubren adecuadamente, (c) un middleware Python custom es más transparente y auditable, facilitando la validación del Agente 12 (Ética) contra el marco legal colombiano, (d) NeMo Guardrails se puede adoptar en Post-MVP si la complejidad de los filtros lo justifica.

### 8. Playwright para E2E (no Cypress)

Se elige **Playwright** sobre Cypress porque: (a) Playwright es más ligero y rápido en CI (GitHub Actions), con mejor paralelización de tests, (b) soporta múltiples navegadores (Chromium, Firefox, WebKit) nativamente, (c) tiene mejor soporte para testing de WebSockets y SSE (necesario si se implementa streaming de respuestas), (d) la API async de Playwright se alinea mejor con el ecosystem async del proyecto (FastAPI, httpx).

### 9. SSE (Server-Sent Events) para streaming de respuestas del chat

Las respuestas del chat se transmiten al frontend mediante **SSE vía `StreamingResponse` de FastAPI**, no WebSockets completos. SSE es unidireccional (servidor → cliente), perfecto para el caso de uso de streaming token-by-token de la respuesta de Gemini. Esto reduce la latencia percibida por el usuario: en lugar de esperar 10-15s a la respuesta completa, el estudiante ve las palabras aparecer progresivamente. El frontend usa la API nativa `EventSource` o `fetch` con `ReadableStream`.

### 10. Configuración por capa: infraestructura (env vars) vs operativa (system_config)

La configuración del sistema se gestiona en dos capas diferenciadas:

**(a) Configuración de infraestructura** (variables de entorno): DATABASE_URL, GEMINI_API_KEY, SECRET_KEY, CORS_ORIGINS, puertos, LLM_PROVIDER. Se carga con python-dotenv en local y se inyecta directamente por Railway en producción futura. Nunca se hardcodea en el código. Cambiar estos valores requiere reiniciar la aplicación. Esto cumple: (a) el requisito de seguridad de credenciales del Agente 08 ("API keys de Gemini DEBEN gestionarse mediante variables de entorno"), (b) la compatibilidad Railway-ready del Agente 11, (c) las mejores prácticas de 12-factor apps.

**(b) Configuración operativa** (tabla `system_config`): sos_hotline_number, system_maintenance_mode, llm_temperature, tts_default_voice, max_session_duration_minutes, consent_current_version. Almacenada en BD como clave-valor con JSONB, editable por admin en runtime vía interfaz #30 sin reiniciar la aplicación. Los cambios se registran en audit_logs para trazabilidad. Ver Evolución 004 del esquema de BD.

### 11. SER diferido al Post-MVP (reconocimiento emocional vía texto en MVP)

Se difiere **speechbrain (SER)** al Post-MVP porque: (a) las Preguntas Resueltas del proyecto (Etapa 4.3) establecen explícitamente que "la interacción por voz completa (ASR/TTS/SER)" puede dejarse para una segunda versión, (b) ningún criterio de éxito del estudio cuasiexperimental (SUS ≥ 70, latencia ≤ 20s, empatía ≥ 4/5, 0 infracciones) depende de SER, (c) ninguna Historia de Usuario (HU-01 a HU-17) requiere detección de emociones por audio, (d) la tesis describe el reconocimiento emocional como enfoque "híbrido" donde el check-in textual (ánimo, sueño, foco) es el mecanismo primario, (e) speechbrain añade ~2GB+ de dependencias que impactan el tamaño de la imagen Docker y los tiempos de build. Los guardrails de texto (regex + keywords) cubren la detección de riesgo del MVP; se deja preparada una interfaz `EmotionAnalyzer(Protocol)` para integrar SER sin cambios en la arquitectura.

### 12. PyJWT sobre python-jose para JWT (migración por discontinuación)

Se reemplaza **python-jose** por **PyJWT** (`pyjwt[crypto]`) porque: (a) python-jose no ha tenido releases significativos desde 2022 y acumula issues de seguridad sin resolver, (b) para un proyecto que maneja datos emocionales sensibles protegidos por la Ley 1581/2012, depender de una librería sin mantenimiento activo en el componente de autenticación es un riesgo inaceptable, (c) PyJWT es activamente mantenida con releases regulares, (d) la API de PyJWT es compatible funcionalmente (`jwt.encode()` / `jwt.decode()`) y la migración es trivial, (e) PyJWT es más ligera (menos dependencias transitivas que python-jose[cryptography]).

### 13. PostgreSQL como motor único (eliminación de compatibilidad dual con SQLite)

Se elimina **SQLite** del proyecto y se adopta **PostgreSQL 16 como único motor** de base de datos tanto para desarrollo como para producción. Razones: (a) dev/prod parity — usar el mismo motor en ambos entornos elimina bugs sutiles causados por diferencias de comportamiento (NULL ordering, LIKE case sensitivity, transacciones concurrentes, precisión de timestamps), (b) Docker Compose ya está en el stack — levantar PostgreSQL local es `docker compose up -d db` sin fricción de setup, (c) eliminación de complejidad innecesaria — desaparece la lógica condicional en SQLAlchemy para UUIDs (`gen_random_uuid()` vs `uuid.uuid4()`), el mapeo dual de tipos (JSONB/JSON, BOOLEAN/INTEGER, TIMESTAMP/TEXT, UUID/TEXT), el mantenimiento de dos scripts DDL, y la documentación de diferencias entre motores, (d) migración directa a Railway — mismo motor local → Railway Managed PostgreSQL, solo cambia `DATABASE_URL`, (e) un equipo de 3 estudiantes no necesita mantener compatibilidad dual de motores.

### 14. Lip sync vía Web Audio API + three-vrm (no backend processing)

Se elige realizar el lip sync **completamente en el frontend** mediante análisis de frecuencia de audio (Web Audio API `AnalyserNode`) mapeado a los 5 blend shapes vocálicos del estándar VRM (@pixiv/three-vrm), en lugar de opciones que requieran procesamiento backend (rhubarb-lip-sync, modificaciones a Piper TTS). Razones: (a) cero impacto en latencia — el análisis ocurre en tiempo real mientras el audio se reproduce, sin agregar milisegundos al turno, manteniendo la latencia total ≤ 20s, (b) cero cambios backend — Piper TTS sigue generando solo audio sin modificaciones al endpoint ni al pipeline, (c) cero servicios Docker nuevos — no se agrega rhubarb-lip-sync ni ningún otro contenedor, manteniendo la simplicidad operativa para 3 estudiantes, (d) el estándar VRM con @pixiv/three-vrm es open-source y no depende de servicios cloud (ReadyPlayerMe), alineado con el principio de operación 100% local del MVP, (e) la calidad del lip sync basado en frecuencia es suficiente para la evaluación de tesis — los evaluadores verifican sincronización visual, no precisión fonética. Ruta de mejora documentada: si se requiere precisión fonética post-MVP, se puede agregar rhubarb-lip-sync como fuente alternativa de visemas sin cambiar el componente React ni los blend shapes. Ver documento de decisión técnica completo en `docs/AVATAR_3D_DECISION_TECNICA.md`.

---

## Dependencias entre Capas

```
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (React SPA)                  │
│  React 18 + Vite + TailwindCSS + Zustand + Axios       │
│  ┌─────────┐ ┌──────────┐ ┌──────┐ ┌───────────────┐   │
│  │  Chat   │ │ Check-in │ │ SOS  │ │ Preferencias  │   │
│  └────┬────┘ └─────┬────┘ └──┬───┘ └───────┬───────┘   │
│       │            │         │              │           │
│  ┌────┴────────────┴─────────┴──────────────┴────┐      │
│  │        MediaRecorder (mic) / Audio (TTS)      │      │
│  └───────────────────────┬───────────────────────┘      │
└──────────────────────────┼──────────────────────────────┘
                           │ REST API + SSE (streaming)
                           │ JWT en headers
┌──────────────────────────┼──────────────────────────────┐
│                  BACKEND (FastAPI)                       │
│                          │                              │
│  ┌───────────────────────▼────────────────────────────┐ │
│  │              API Router (endpoints)                │ │
│  │  /auth  /sessions  /messages  /preferences  /sos   │ │
│  └───────────────────────┬────────────────────────────┘ │
│                          │                              │
│  ┌───────────┐    ┌──────▼──────┐    ┌───────────────┐  │
│  │ Pre-filtro│───▶│  Service    │───▶│ Post-filtro   │  │
│  │(guardrail)│    │   Layer     │    │ (guardrail)   │  │
│  └───────────┘    └──────┬──────┘    └───────────────┘  │
│                          │                              │
│           ┌──────────────┼──────────────┐               │
│           │              │              │               │
│    ┌──────▼─────┐ ┌──────▼─────┐ ┌─────▼──────┐        │
│    │ LLM Adapter│ │Voice Module│ │ Repository │        │
│    │ (Gemini)   │ │ ASR / TTS  │ │ (SQLAlchemy)│       │
│    └──────┬─────┘ └────────────┘ └─────┬──────┘        │
│           │                            │               │
└───────────┼────────────────────────────┼───────────────┘
            │                            │
   ┌────────▼────────┐         ┌────────▼────────┐
   │  Gemini API     │         │  PostgreSQL 16  │
   │  (Google Cloud) │         │  (local/Docker) │
   └─────────────────┘         └─────────────────┘
```

**Flujo de un mensaje de chat (texto):**
1. Frontend envía POST `/api/v1/messages` con JWT + contenido
2. **Pre-filtro** (middleware): analiza el texto del usuario buscando indicadores de riesgo
3. Si riesgo detectado → registra `safety_event` + retorna señal SOS al frontend
4. Si ok → **Service Layer** construye el prompt (system prompt + check-in + historial reciente)
5. **LLM Adapter** (`GeminiAdapter`) envía a Gemini API y recibe streaming
6. **Post-filtro**: analiza la respuesta de Gemini antes de enviarla al estudiante
7. Persiste mensaje en BD (con `content_sha256`, `meta`, `safety_flags`, tokens)
8. Retorna respuesta al frontend vía SSE (streaming) o JSON

**Flujo de un mensaje de chat (voz):**
1. Frontend captura audio con MediaRecorder → envía blob a POST `/api/v1/asr`
2. Backend procesa con **faster-whisper** → texto transcrito
3. Continúa el flujo de texto (pasos 2-8 arriba)
4. Respuesta de texto se envía a **Piper TTS** → audio generado
5. Frontend recibe audio + subtítulos sincronizados

> **Post-MVP:** Cuando se integre SER (speechbrain), se insertará un paso entre 2 y 3 del flujo de voz: "speechbrain analiza emoción del audio → enriquece el pre-filtro con datos emocionales". La interfaz `EmotionAnalyzer` ya estará preparada.

---

## Preparación para Railway

El stack del MVP está diseñado para una migración fluida a Railway como plataforma cloud:

| Aspecto | Preparación en MVP | Mapeo a Railway |
|---|---|---|
| **Configuración** | Config de infraestructura vía env vars (python-dotenv en local). Config operativa vía tabla `system_config` en BD (migra con PostgreSQL). | Railway inyecta env vars nativamente. `system_config` migra automáticamente con Railway Managed PostgreSQL. |
| **Backend** | Dockerfile independiente con `CMD ["uvicorn", ...]` | Railway service con Dockerfile o Nixpacks auto-detect |
| **Frontend** | Build estático con `vite build` → archivos en `dist/` | Railway static site o servido por Nginx/backend |
| **Reverse proxy** | No se usa en MVP local (Uvicorn sirve directamente) | Nginx como servicio Railway para proxy + assets estáticos |
| **Base de datos** | PostgreSQL 16 en Docker Compose como servicio separado | Railway Managed PostgreSQL (plugin) con DATABASE_URL auto-inyectado |
| **Health checks** | Endpoint `/health` en FastAPI | Railway usa health checks HTTP para determinar readiness |
| **Logs** | structlog a stdout en JSON | Railway captura stdout automáticamente en su log drain |
| **Networking** | Docker Compose network entre servicios | Railway Private Networking entre servicios del proyecto |
| **Secrets** | `.env` file local (git-ignored) | Railway Secrets management (env vars encriptadas) |
| **Stateless** | JWT (sin sesiones en servidor). Excepción: la tabla `attachments` almacena rutas a archivos de audio/imagen/documento en disco local (campo `path`). Para migración a Railway: migrar a almacenamiento de objetos (S3/R2/Cloudflare) con presigned URLs, o usar Railway Volume persistente. | Parcialmente compatible con deploys efímeros. Backend stateless (JWT). Archivos de adjuntos requieren solución de almacenamiento persistente (Railway Volume o S3). |
| **Config file** | `railway.toml` preparado en el repositorio | Railway lo detecta automáticamente al conectar el repo |

**Limitación conocida:** Los modelos de voz (faster-whisper, Piper) requieren archivos de modelo locales (~200MB-500MB). En Railway, estos deben empaquetarse en la imagen Docker o descargarse al arranque. Si el tamaño de imagen es excesivo, los servicios de voz pueden desplegarse como servicio separado con volumen persistente.

---

## Preparación Post-MVP (LLM Local)

> **NADA de lo listado en esta sección se instala, configura o implementa en el MVP.** Esta sección documenta únicamente la estrategia de migración futura para referencia del equipo.

### (a) Capa de abstracción implementada en el MVP

```python
# Interfaz (Protocol) implementada en el MVP
class LLMProvider(Protocol):
    async def generate(self, messages: list[dict], **kwargs) -> AsyncIterator[str]: ...
    async def count_tokens(self, text: str) -> int: ...

# Adapter concreto del MVP
class GeminiAdapter:
    """Implementa LLMProvider usando google-generativeai SDK."""
    ...

# Futuro adapter Post-MVP (NO se implementa en MVP)
class LocalLLMAdapter:
    """Implementará LLMProvider usando vLLM/llama.cpp con modelo local ~3B."""
    ...
```

El swap de Gemini a LLM local requiere: (1) implementar `LocalLLMAdapter`, (2) cambiar la variable de entorno `LLM_PROVIDER=local`, (3) proveer hardware con GPU. **Ningún otro módulo del sistema cambia.**

### (b) Tecnologías que se AGREGARÁN en Post-MVP

| Tecnología | Propósito |
|---|---|
| PyTorch ≥2.x | Runtime de inferencia del modelo local ~3B |
| Hugging Face Transformers | Carga y gestión del modelo base |
| PEFT (LoRA/QLoRA) | Fine-tuning eficiente con adaptadores de bajo rango |
| bitsandbytes | Cuantización 4/8-bit para reducir uso de VRAM |
| vLLM o llama.cpp | Servidor de inferencia optimizado (batching, KV-cache) |
| CUDA Toolkit (RTX 2060) o Metal (Mac M4) | Aceleración GPU para inferencia |
| Weights & Biases | Tracking de experimentos de fine-tuning |
| speechbrain ≥1.0 (SER) | Reconocimiento emocional por voz — se integrará vía interfaz `EmotionAnalyzer(Protocol)` preparada en el MVP. Enriquece los guardrails con datos emocionales del audio, complementando la detección textual. |

### (c) Tecnologías del MVP que NO cambian

- FastAPI, React, PostgreSQL, Docker, GitHub Actions — intactos
- Pipeline de voz (faster-whisper, Piper) — intacto (SER se añade como módulo adicional)
- Guardrails middleware — intacto (filtra salida del LLM independientemente del proveedor; SER enriquece pero no reemplaza)
- Frontend — intacto (consume la misma API REST/SSE)
- Esquema de BD — intacto (el campo `meta` en `messages` ya soporta `{"model": "local-3b-lora-v1"}`)

### (d) Impacto en infraestructura Docker al migrar a LLM local

La migración a un LLM local (~3B parámetros) introduce cambios significativos en la infraestructura que deben planificarse desde ahora:

**Nuevo servicio Docker `llm-engine`:**
- Docker Compose añadirá un servicio dedicado para inferencia (`llm-engine`) separado del backend API, comunicándose vía HTTP interno o gRPC.
- Este servicio necesitará acceso a GPU, lo cual requiere **NVIDIA Container Toolkit** (para RTX 2060) o configuración de Metal (para Mac M4).
- Ejemplo de configuración Docker Compose con GPU:
  ```yaml
  llm-engine:
    build: ./llm-engine
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - MODEL_PATH=/models/mabel-3b-lora
      - QUANTIZATION=4bit
  ```

**Requisitos de hardware actualizados:**
- **VRAM mínima:** ~4-6GB para modelo 3B cuantizado a 4-bit (RTX 2060 tiene 6GB — justo pero viable)
- **RAM:** ≥16GB recomendado (modelo + backend + BD + voz)
- **Drivers:** CUDA ≥12.0 (RTX 2060) o macOS ≥14.0 (Metal, Mac M4)
- **Almacenamiento:** ~5-10GB adicionales para modelos y datasets de fine-tuning

**Impacto en CI/CD:**
- Los runners de GitHub Actions estándar NO tienen GPU → los tests de inferencia del LLM local deberán ejecutarse en self-hosted runners con GPU, o mockear el servicio LLM en CI.
- Los Dockerfiles de `llm-engine` serán significativamente más pesados (~5-10GB con CUDA base image + modelo) → builds más lentos, estrategia de cache de capas necesaria.

**Lo que NO cambia en la infraestructura:**
- El backend FastAPI sigue siendo el mismo contenedor (consume `llm-engine` vía la interfaz `LLMProvider` en lugar de Gemini API)
- PostgreSQL, frontend, pipeline de voz — mismos contenedores
- railway.toml necesitará actualización para el nuevo servicio, pero la estructura base se mantiene

---

## Tecnologías Descartadas

| Tecnología | Razón del descarte |
|---|---|
| **Django / Django REST Framework** | Framework "batteries-included" demasiado pesado para un backend API-only. FastAPI ofrece mejor rendimiento async (necesario para latencia ≤ 20s), documentación OpenAPI auto-generada (requisito del Arquitecto) y tipado nativo con Pydantic, con menor curva de aprendizaje para una API REST moderna. |
| **Express.js / NestJS (Node.js backend)** | Requeriría Node.js como runtime del backend, perdiendo acceso directo al ecosistema Python de ML/NLP: Whisper (ASR), Piper (TTS), scipy/statsmodels (análisis). Tener dos runtimes (Node.js backend + Python ML) duplicaría la complejidad de infraestructura y Docker para 3 estudiantes. |
| **Redux** | Gestor de estado excesivo para las necesidades del MVP. El estado global se limita a auth, preferencias (5 toggles) y sesión de chat. Redux requiere actions, reducers, middleware (thunk/saga), store configuration — Zustand logra lo mismo en ~80% menos código con una API más directa. |
| **MongoDB** | BD documental innecesaria: el esquema de 13 tablas de la tesis es claramente relacional (FK, CASCADE, CHECK constraints, UNIQUE indexes). Los campos flexibles (meta, safety_flags, accessibility, checkin_payload) se manejan con JSONB de PostgreSQL sin sacrificar integridad referencial ni transacciones ACID. |
| **Next.js / Remix** | Frameworks SSR/full-stack que añaden complejidad de server-side rendering innecesaria. La aplicación es una SPA local; no necesita SEO, indexación ni pre-rendering. React + Vite es más simple y produce un build estático servible desde cualquier servidor, compatible con Railway. |
| **Firebase / Supabase** | Plataformas BaaS cloud que violan el requisito de "operación 100% local" y la privacidad por diseño exigida por la Ley 1581/2012 (citada en las bases legales de la tesis). Los datos sensibles de salud mental no pueden enviarse a infraestructuras de terceros sin control total del almacenamiento. |
| **Cypress** | Framework E2E más pesado que Playwright: mayor uso de recursos en CI, no soporta múltiples navegadores nativamente (solo Chromium por defecto), y tiene peor soporte para SSE/streaming. Playwright es más moderno y se integra mejor con GitHub Actions. |
| **Coqui TTS** | Proyecto de TTS open-source que fue archivado/discontinuado en 2024. Sin mantenimiento activo, usar Coqui representa un riesgo de deuda técnica. Piper TTS ofrece funcionalidad equivalente, está activamente mantenido, es más ligero y tiene voces en español de calidad. |
| **Tortoise ORM** | ORM async para Python con comunidad significativamente más pequeña que SQLAlchemy. SQLAlchemy 2.0+ ya soporta async nativo, tiene la mayor base de documentación en Context7, y Alembic (migraciones) está diseñado específicamente para él. Para 3 estudiantes, la mayor disponibilidad de recursos de SQLAlchemy reduce la fricción de aprendizaje. |
| **NeMo Guardrails (en MVP)** | Framework de NVIDIA para guardrails conversacionales que requiere aprender Colang (lenguaje DSL propietario). Para el MVP, los guardrails son principalmente detección de keywords de riesgo y validación de tono, que regex + heurísticas Python cubren con menor complejidad. Se reevaluará para Post-MVP si la sofisticación de filtros lo justifica. |
| **python-jose[cryptography]** | Librería JWT discontinuada — sin releases significativos desde 2022, con issues de seguridad acumulados sin resolver. Para un proyecto que maneja datos emocionales sensibles protegidos por la Ley 1581/2012, depender de una librería sin mantenimiento activo en el componente de autenticación es un riesgo inaceptable. Reemplazada por PyJWT, activamente mantenida y funcionalmente compatible. |
| **speechbrain (en MVP)** | Framework completo de ML para audio (~2GB+ de dependencias). SER no es requerido por ninguna HU, no impacta los criterios de éxito del estudio, y las Preguntas Resueltas (4.3) listan explícitamente ASR/TTS/SER como deferibles a segunda versión. Los guardrails de texto cubren la detección de riesgo del MVP. Diferido a Post-MVP con interfaz preparada para integración futura. |
| **Nginx (en MVP)** | Reverse proxy innecesario para el MVP 100% local: Uvicorn sirve el backend directamente y Vite proxy maneja el desarrollo. Para 30 estudiantes en sesiones de 15-20 min en un entorno controlado local, un reverse proxy no aporta valor. Se adopta al migrar a Railway como servicio de producción. |
| **Biome** | Linter/formatter todo-en-uno para JavaScript como alternativa a ESLint + Prettier. Descartado por: comunidad más pequeña, menor ecosistema de plugins (no tiene equivalente a eslint-plugin-react-hooks ni eslint-plugin-jsx-a11y), y menor documentación en Context7. Para 3 estudiantes, ESLint + Prettier tiene más tutoriales, más soporte comunitario y más integración con el ecosistema React existente. |
| **SQLite** | BD alternativa para desarrollo "ligero" descartada para evitar complejidad de compatibilidad dual de motores. PostgreSQL 16 en Docker Compose garantiza dev/prod parity (principio 12-factor app). Los 3 estudiantes usan Docker para desarrollo, eliminando la necesidad de una BD sin setup. Las diferencias sutiles entre SQLite y PostgreSQL (NULL ordering, LIKE case sensitivity, transacciones, timestamps) causarían bugs difíciles de diagnosticar. Docker Compose con servicio `db` es tan simple como ejecutar `docker compose up -d db`. |

---

## Trazabilidad con Requisitos del Proyecto

| Decisión Tecnológica | Requisito Origen | Fuente |
|---|---|---|
| FastAPI con StreamingResponse (SSE) | Chat en tiempo real con latencia percibida ≤ 20s por turno | Marco metodológico — Criterios de éxito |
| PostgreSQL 16 (único motor, dev y prod) | `CREATE EXTENSION IF NOT EXISTS pgcrypto;` — UUIDs seguros para todas las PKs de 13 tablas. Único motor tanto para desarrollo local (Docker Compose) como producción futura (Railway Managed PostgreSQL) | ADR #13 — Eliminación de compatibilidad dual; Script PostgreSQL — Anexos de tesis; Principio 12-factor app |
| SQLAlchemy + Alembic | Repository pattern para BD + migraciones incrementales del esquema | Agente 02 (Arquitecto) — Patrones obligatorios |
| PyJWT + passlib[bcrypt] | Registro con email/contraseña + inicio de sesión seguro + sesiones stateless. PyJWT reemplaza a python-jose por discontinuación | HU-01, HU-02 — Historias de usuario; Ley 1581/2012 (seguridad de datos sensibles) |
| Adapter pattern para Gemini | Capa de abstracción intercambiable (Gemini → LLM local futuro) | Documento de agentes — Nota MVP |
| google-generativeai SDK | Integración con API de Gemini como motor de lenguaje del MVP | Documento de agentes — "el sistema utilizará la API de Gemini de Google" |
| React 18 SPA + Vite | "SPA con React, siguiendo principios de usabilidad centrada en el usuario" | Etapa 5.4 — Preguntas resueltas |
| TailwindCSS (clases de accesibilidad) | Subtítulos, contraste alto, fuente grande | HU-09 — "activar subtítulos para mejorar accesibilidad" |
| Zustand para estado global | Toggles de historial ON/OFF, check-in ON/OFF, accesibilidad | HU-04, HU-10, HU-11 — Preferencias que persisten entre vistas |
| faster-whisper (modelo `small`) | ASR local en español con baja latencia | HU-07 — "hablar por voz (ASR/TTS)" + diagrama de despliegue (Mac M4/RTX 2060) |
| Piper TTS con voces en español | TTS local con voces configurables + subtítulos sincronizados | HU-07, HU-09 — "TTS con voz seleccionada", "subtítulos en voces" |
| SER diferido a Post-MVP | "Para una segunda versión se pueden dejar: la interacción por voz completa (ASR/TTS/SER)" | Preguntas Resueltas — Etapa 4.3; Criterios de éxito no dependen de SER |
| Middleware custom de guardrails (regex) | Prefiltro/postfiltro + 0 alertas críticas en prompts estándar | Paso 0 — Criterios de seguridad; HU-08 — "derivación si hay riesgo" |
| ON DELETE CASCADE en BD | Eliminación con doble confirmación y borrado real en cascada | HU-13 — "borrar una conversación" + caso de uso "Historial y Privacidad" |
| JSONB para safety_flags | `{ "risk_detected": true, "keywords": [...], "severity": N }` | Esquema de tabla `messages` — Script PostgreSQL de la tesis |
| content_sha256 (hashlib) | Verificación de integridad de contenido por mensaje | Esquema de tabla `messages` — campo `content_sha256 TEXT` |
| structlog (JSON a stdout) | Métricas técnicas: latencia por turno, tokens, activaciones de guardrails | Marco metodológico — "métricas técnicas locales" para análisis del estudio |
| Docker Compose (3 servicios) | Despliegue 100% local reproducible para estudio cuasiexperimental | Tesis — "despliegue 100% local"; "replicabilidad del estudio" |
| Variables de entorno universales | Configuración inyectable en Railway sin cambios en código | Agente 11 — "variables de entorno para toda configuración" |
| python-dotenv + .env | Gestión segura de GEMINI_API_KEY sin hardcodear | Agente 04 — "API keys de Gemini DEBEN gestionarse mediante variables de entorno" |
| pytest + Paso 0 suite | Verificación automática pre-piloto: coherencia, tono, guardrails, latencia | Marco metodológico — Fase "Paso 0 — Técnica de verificación automática" |
| Playwright E2E | Flujo completo: registro → consentimiento → chat → SOS → historial | 5 casos de uso de la tesis |
| Locust (rendimiento) | "Latencia media ≤ 20s y 0 infracciones" bajo carga | Marco metodológico — Criterios de éxito indicativos |
| axe-core (accesibilidad) | Cumplimiento WCAG: contraste, fuentes escalables, navegación por teclado | HU-09 + Agente 09 — Accesibilidad obligatoria |
| passlib[bcrypt] | Medidas de seguridad para datos sensibles de salud emocional | Ley 1581/2012 — citada en bases legales de la tesis |
| Consentimiento versionado (tabla consents) | Consentimiento expreso con versión, scope y timestamp | Ley 1581/2012 + Decreto 1377/2013; HU-03 |
| pandas + scipy + Jupyter | Análisis estadístico: descriptivos, t pareada/Wilcoxon, Cohen's d, IC 95% | Marco metodológico — "Técnicas de procesamiento y análisis de datos" |
| Notion (MCP) | Fuente única de verdad documental del proyecto | Agente 14 — "'Mabel IA Documentation' como fuente única de verdad" |
| Ruff (linter/formatter Python) | Consistencia de código en backend para equipo de 3 estudiantes | CI/CD — "linting en cada push"; 3 desarrolladores en mismo codebase |
| ESLint + Prettier (linter/formatter JS) | Consistencia de código en frontend para equipo de 3 estudiantes | CI/CD — "linting en cada push"; accesibilidad (eslint-plugin-jsx-a11y) alineada con HU-09 |

---

## Registro de Revisiones

### Revision 1 — 2026-02-18

| # | Observacion | Veredicto | Cambio aplicado |
|---|---|---|---|
| 1 | python-jose discontinuado — migrar a PyJWT | **ACEPTADO** | Reemplazado `python-jose[cryptography] ≥3.3` por `PyJWT ≥2.9 (pyjwt[crypto])` en tabla Backend. Actualizado ADR #3 (JWT). Agregado nuevo ADR #12 (migración PyJWT). python-jose movido a Tecnologías Descartadas con justificación de discontinuación y riesgo de seguridad. Trazabilidad actualizada. |
| 2 | speechbrain SER — diferir al Post-MVP | **ACEPTADO** | speechbrain eliminado de tabla Procesamiento de Voz. Agregada nota explicativa bajo la tabla. Agregado nuevo ADR #11 (SER diferido) con evidencia de Preguntas Resueltas 4.3. speechbrain movido a tabla Post-MVP (b) y a Tecnologías Descartadas (en MVP). Diagrama de dependencias actualizado (Voice Module: ASR/TTS). Flujo de voz simplificado. Interfaz `EmotionAnalyzer(Protocol)` documentada para integración futura. Resumen Ejecutivo actualizado. |
| 3 | Nginx como Post-MVP — eliminarlo del stack MVP | **ACEPTADO** | Nginx eliminado de tabla DevOps. Movido a tabla de Preparación para Railway como "Reverse proxy" que se adopta al desplegar. Agregado a Tecnologías Descartadas (en MVP) con justificación: Uvicorn sirve directamente para 30 estudiantes en entorno local controlado. |
| 4 | Ruff/ESLint/Prettier faltantes en el stack | **ACEPTADO** | Nueva subsección "Calidad de Código" agregada entre Testing y DevOps con 3 entradas: Ruff (Python), ESLint (JS/React), Prettier (formatting). GitHub Actions actualizado para referenciar herramientas específicas. Biome evaluado y descartado (agregado a Tecnologías Descartadas). Dos filas de trazabilidad agregadas. |
| 5 | Post-MVP Docker/GPU — documentación incompleta | **ACEPTADO** | Nueva subsección (d) "Impacto en infraestructura Docker al migrar a LLM local" agregada a la sección Post-MVP. Documenta: servicio Docker `llm-engine` con GPU passthrough (NVIDIA Container Toolkit), requisitos de hardware (VRAM, RAM, drivers), ejemplo de Docker Compose con GPU, impacto en CI/CD (self-hosted runners), y qué NO cambia en la infraestructura. |

### Revisión 2 — 2026-02-18

| # | Observación | Veredicto | Cambio aplicado |
|---|---|---|---|
| 6 | SQLite eliminado — PostgreSQL 16 como único motor | **ACEPTADO** | Eliminada fila de SQLite de tabla Base de Datos. Fila de PostgreSQL actualizada como único motor (dev + prod). Nueva ADR #13 (PostgreSQL único, eliminación de compatibilidad dual). Eliminada referencia a SQLite en trazabilidad. SQLite agregado a Tecnologías Descartadas. Diagrama y flujos actualizados. Script db/schema_sqlite.sql eliminado del proyecto. |

### Revisión 3 — 2026-02-22

| # | Observación | Veredicto | Cambio aplicado |
|---|---|---|---|
| 7 | Avatar 3D con lip sync — nueva feature para Objetivo Específico 3 de tesis | **ACEPTADO** | Nueva subsección "Avatar 3D y Lip Sync" agregada entre "Procesamiento de Voz" y "Seguridad y Guardrails" con 5 tecnologías: @react-three/fiber, @react-three/drei, three, @pixiv/three-vrm, Web Audio API (AnalyserNode). Nueva ADR #14 (lip sync vía Web Audio API + three-vrm, no backend processing). Nota explicativa sobre decisión técnica con referencia a `docs/AVATAR_3D_DECISION_TECNICA.md`. Nuevo Agente 15 (3D & Avatar Engineer) agregado al equipo de desarrollo. Nueva HU-18 definida. Interfaz #10 actualizada con Modo Avatar. Esquema de BD extendido con `preferences.preferred_chat_mode` y `sessions.avatar_used`. |

### Revisión 4 — 2026-02-24

| # | Observación | Veredicto | Cambio aplicado |
|---|---|---|---|
| 8 | Auditoría post-Evo 004 — 12 hallazgos de inconsistencia | **ACEPTADO** | H-01: "8 tablas" → "13 tablas" en 3 ubicaciones (Resumen, Alembic, MongoDB). H-05: "13 agentes activos" → "15 agentes (14 activos + 1 diferido)". H-10: ADR #10 reescrito — distingue config de infraestructura (env vars) vs config operativa (tabla `system_config`). Fila "Configuración" en tabla Railway actualizada. H-11: Fila "Stateless" corregida — reconoce excepción de `attachments` (archivos locales en `path`), recomienda S3/R2/Railway Volume para migración cloud. |
