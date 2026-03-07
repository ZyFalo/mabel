## Design Decisions

### Decision 1: Pre-filtro vs Post-filtro

**Context:** Los guardrails deben detectar crisis tanto en el mensaje del usuario como en la respuesta de Gemini.

**Decision:**
- **Pre-filtro:** Analiza el mensaje del usuario ANTES de enviarlo a Gemini. Match de keywords desde `system_config.safety_keywords`. Si detecta match, calcula severidad y registra `safety_event` con `event_type = "risk_detected"`. Si severidad >= `sos_severity_threshold`, el SSE incluye flag `risk_detected: true` para activar SOS automático en frontend. El mensaje IGUAL se envía a Gemini (Mabel debe responder con empatía), pero el frontend sabe que debe mostrar el Panel SOS.
- **Post-filtro:** Analiza la respuesta de Gemini DESPUÉS de recibirla (acumulada al final del streaming). Si detecta keywords de riesgo en la respuesta, registra `safety_event`. Esto cubre el caso en que Gemini genere contenido problemático. El flag se envía en el evento `done` del SSE.

**Rationale:** Enviar a Gemini incluso cuando se detecta riesgo permite que Mabel responda empáticamente. El Panel SOS se muestra ADEMÁS de la respuesta, no en lugar de ella.

### Decision 2: Cálculo de Severidad

**Context:** El campo `payload.severity` en safety_events es 1-5, mismo rango que `sos_severity_threshold`.

**Decision:** Severidad = min(5, cantidad_de_keywords_detectadas + ponderación). Cada keyword base suma 1. Keywords críticas (ej: "suicidio") suman 2. Si severidad >= `sos_severity_threshold` (default 3) → activación automática de SOS. Si severidad < threshold → solo se registra el safety_event, sin SOS automático.

**Rationale:** Sistema simple y transparente. Ponderación por keyword permite priorizar términos más graves. Admin puede ajustar threshold desde #30 (Fase 8).

### Decision 3: event_type sin CHECK en BD

**Context:** §2.9 confirma que `event_type` es TEXT NOT NULL sin CHECK constraint.

**Decision:** Validación vía Pydantic enum en el schema, no en BD. Valores MVP: `risk_detected`, `redirect_shown`, `user_report`. Esto permite agregar nuevos tipos post-MVP sin migración.

**Rationale:** Flexibilidad > rigidez para un campo que puede evolucionar.

### Decision 4: payload estructura por event_type

**Context:** §2.9 define 3 estructuras de payload.

**Decision:**
- `risk_detected`: `{ "keywords": [...], "severity": N, "message_id": "uuid", "filter": "pre"|"post" }`
- `redirect_shown`: `{ "trigger": "auto"|"manual", "lines_shown": [...] }`
- `user_report`: `{ "report_id": "uuid" }`

**Rationale:** JSONB flexible, validación en app. Se agrega `filter` para distinguir pre/post-filtro en analytics.

### Decision 5: system_config cache en memoria

**Context:** Las 4 claves se leen frecuentemente (cada mensaje pasa por guardrails).

**Decision:** `SystemConfigRepository` carga las 4 claves al instanciarse y las cachea en un dict. Para MVP, el cache dura la vida del proceso. Refresh requiere restart del servidor. En Fase 8, cuando admin cambie config desde #30, se invalida el cache.

**Rationale:** Tabla de 4 filas = query instantáneo, pero evitar I/O en cada mensaje es mejor. MVP no necesita invalidación sofisticada.

### Decision 6: Panel SOS como componente superpuesto (D-02)

**Context:** D-02 del PO: "El SOS debe ser instantáneo, sin navegación."

**Decision:** `SosPanel` es un overlay que se muestra SOBRE la pantalla actual. No navega, no cierra sesión. El estudiante puede cerrar el panel y volver al chat. Las líneas de ayuda se cargan desde `GET /api/v1/system-config/sos` al montar el componente. Cada línea tiene enlace `tel:` nativo.

**Rationale:** Overlay = inmediato. No interrumpe el contexto. El estudiante decide si llamar o seguir chateando.

### Decision 7: Activación automática de SOS en SSE

**Context:** Cuando el pre-filtro detecta riesgo con severidad >= threshold, el frontend debe abrir el Panel SOS automáticamente.

**Decision:** El primer SSE event del stream de mensajes incluye `risk_detected: true` si el pre-filtro detectó riesgo. El frontend lee este flag y abre `SosPanel` automáticamente. También registra un `safety_event` de tipo `redirect_shown` con `trigger: "auto"`.

**Rationale:** El flag viaja en el mismo stream SSE, no requiere endpoint separado ni polling.

### Decision 8: Error de Conexión con backoff exponencial

**Context:** #20 especifica backoff 3s→6s→12s→max 30s.

**Decision:** Componente `ConnectionError` con retry automático usando backoff exponencial. Intervalos: 3, 6, 12, 24, 30 (cap). Se muestra inline en el área de contenido (el shell header+sidebar permanece visible desde cache PWA). Botón manual de reintento resetea el timer.

**Rationale:** Backoff previene flood al servidor. El shell permanece gracias al Service Worker de PWA (Fase 10 lo implementará, pero el componente ya está preparado).

### Decision 9: Sesión Expirada JWT con preservación de borrador

**Context:** #21 especifica modal bloqueante + preservar borrador en localStorage.

**Decision:** El interceptor de axios detecta 401. Antes de redirigir, guarda el contenido actual del textarea de chat en `localStorage.setItem('mabel_draft', text)`. Al volver a `/session/:id/chat` post-login, el textarea se pre-llena con el borrador guardado y se limpia de localStorage.

**Rationale:** Evita que el estudiante pierda un mensaje largo por expiración de JWT.
