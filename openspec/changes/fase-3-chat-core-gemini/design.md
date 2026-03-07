## Design Decisions

### Decision 1: LLMProvider Protocol + GeminiAdapter

**Context:** CLAUDE.md especifica un adapter pattern (`LLMProvider(Protocol)` + `GeminiAdapter`) para que Gemini pueda ser reemplazado por un modelo local post-MVP.

**Decision:** Crear un `Protocol` en `app/services/llm/provider.py` con método `generate_stream(messages, system_prompt, config) -> AsyncGenerator[str, None]`. La implementación `GeminiAdapter` en `app/services/llm/gemini_adapter.py` usa el SDK `google-generativeai`. El adapter se instancia en el service layer, no como singleton global.

**Rationale:**
- Protocol (no ABC) = duck typing, sin herencia forzada
- AsyncGenerator para streaming nativo
- El adapter recibe `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` desde settings
- Post-MVP: crear `LocalModelAdapter` que implemente el mismo Protocol

### Decision 2: Streaming SSE

**Context:** Las respuestas de Gemini deben llegar palabra por palabra al frontend para UX fluida.

**Decision:** El endpoint `POST /api/v1/sessions/:id/messages` retorna `StreamingResponse` con `media_type="text/event-stream"`. Cada chunk SSE tiene formato `data: {"token": "palabra"}\n\n`. Al finalizar: `data: {"done": true, "message_id": "uuid", "latency_ms": N}\n\n`. El frontend usa `fetch` + `ReadableStream` (no EventSource, porque POST no es compatible con EventSource).

**Rationale:**
- SSE es más simple que WebSockets para flujo unidireccional
- `fetch` + `ReadableStream` soporta POST con body (EventSource solo GET)
- `sse-starlette` no es necesario — `StreamingResponse` de FastAPI es suficiente
- El mensaje completo se persiste al finalizar el stream (no chunk por chunk)

### Decision 3: System Prompt de Mabel

**Context:** Mabel es un asistente de psicoeducación, no un terapeuta. Necesita límites claros.

**Decision:** El system prompt se almacena como constante en `app/services/llm/prompts.py` (no en BD). Incluye:
- Identidad: "Soy Mabel, asistente virtual de apoyo psicoeducativo de la UMB"
- Rol: orientación emocional, técnicas de bienestar, escucha empática
- Límites: no diagnosticar, no prescribir, no reemplazar profesionales
- Tono: cálido, empático, en español colombiano informal pero respetuoso
- Crisis: si detecta riesgo, responder con empatía y sugerir buscar ayuda profesional
- Privacidad: no solicitar datos personales sensibles

**Rationale:** Constante en código porque el system prompt es parte de la identidad del producto, no configuración runtime. Cambios requieren revisión de código + deploy.

### Decision 4: Context Window

**Context:** Gemini necesita contexto de la conversación para respuestas coherentes (§6.2 Notion BD).

**Decision:** Antes de cada llamada a Gemini, el servicio obtiene los últimos N mensajes de la sesión (`ORDER BY created_at DESC LIMIT N`, luego reverse). N=20 por defecto (configurable en settings como `CONTEXT_WINDOW_SIZE`). Los mensajes se mapean a `{role, content}` para el prompt. El system prompt va primero, luego el contexto, luego el mensaje nuevo.

**Rationale:**
- 20 mensajes = ~10 turnos de conversación, suficiente para coherencia
- Variable de entorno (no system_config) porque es un parámetro técnico del LLM, no operacional
- El reverse es necesario porque la query trae DESC pero Gemini necesita orden cronológico

### Decision 5: save_history=OFF

**Context:** §3.8 del esquema BD: cuando `preferences.save_history = FALSE`, los mensajes NO se persisten.

**Decision:** Al recibir un mensaje, el servicio verifica `preferences.save_history` del usuario:
- Si `true`: persiste el mensaje del usuario y la respuesta del asistente en `messages`
- Si `false`: la sesión existe (para metadata y check-in) pero NO se insertan filas en `messages`. El chat funciona con mensajes en memoria (lista en el servicio para esa request). El context window se construye solo con los mensajes de la request actual.

**Rationale:** Lógica en la capa Service (no triggers BD). Auditable y transparente. La sesión siempre se crea para check-in y métricas.

### Decision 6: Sesión Única Activa

**Context:** `uq_sessions_user_active` (UNIQUE parcial WHERE ended_at IS NULL) garantiza máximo 1 sesión activa por usuario.

**Decision:** Al crear una nueva sesión (`POST /api/v1/sessions`):
1. Intentar INSERT directamente
2. Si falla por UniqueViolation en `uq_sessions_user_active`, cerrar la sesión activa existente (`UPDATE sessions SET ended_at = NOW() WHERE user_id = :uid AND ended_at IS NULL`)
3. Reintentar INSERT
4. Retornar la nueva sesión + flag `previous_session_closed: true` para que el frontend muestre toast informativo

**Rationale:** Primero intentar INSERT (optimista) porque en el flujo normal no hay sesión activa previa. El índice UNIQUE previene race conditions por concurrencia.

### Decision 7: Check-in Snapshot

**Context:** §3.6 del esquema BD: `sessions.checkin_opt_in` es un snapshot de `preferences.checkin_enabled`.

**Decision:** Al crear la sesión, leer `preferences.checkin_enabled` del usuario y copiarlo a `sessions.checkin_opt_in`. Si `checkin_opt_in = true`, el frontend redirige a `/session/:id/checkin`. Si `false`, directo a `/session/:id/chat`. El check-in se persiste con `PATCH /api/v1/sessions/:id` actualizando `checkin_payload` y `checkin_completed_at`.

**Rationale:** Snapshot garantiza integridad temporal — si el estudiante cambia preferencias después de crear la sesión, la sesión conserva la configuración original.

### Decision 8: Reporte de Mensajes

**Context:** HU-14/15/16/17 — los estudiantes pueden reportar mensajes de Mabel con motivo y severidad.

**Decision:**
- `POST /api/v1/messages/:id/reports` con body `{reason, severity?, details?}`
- `GET /api/v1/messages/:id/reports/check` retorna `{already_reported: bool}` usando §6.5
- UNIQUE constraint `(message_id, reporter_id)` previene duplicados
- El frontend muestra badge "Ya reportado" en burbujas previamente reportadas
- Al crear reporte, también crear un `safety_event` con `event_type = "message_report"` (Fase 4 lo usará para el dashboard admin)

**Rationale:** Separar la verificación de duplicado en endpoint GET permite al frontend precargar el estado de "ya reportado" al renderizar las burbujas.

### Decision 9: Frontend Layout con Sidebar

**Context:** #08, #09, #10, #14, #18 — todas las pantallas de chat tienen sidebar (#34B).

**Decision:** Crear un layout `StudentLayout` que incluye `Header` + `Sidebar` + area de contenido. Las rutas de estudiante se renderizan dentro de este layout. El sidebar es colapsable via hamburger button en el Header. Estado de colapso en localStorage para persistir preferencia.

**Rationale:** Layout compartido evita duplicación. El sidebar es consistente en todas las vistas autenticadas del estudiante (PO decidió 220px para ambos roles).

### Decision 10: Componentes Transversales

**Context:** #36 (Toast), #37 (Modal Confirmación), #38 (Skeletons), #39 (Empty States) son componentes reutilizables sin mockup — implementar desde spec de Notion.

**Decision:**
- **Toast:** Componente global con Zustand store (`useToastStore`). 4 tipos (success, error, info, warning). Auto-dismiss 5s. Posición top-right.
- **Modal Confirmación:** Componente reutilizable con props (title, message, confirmLabel, onConfirm, variant: simple | verification). Variant "verification" requiere escribir texto de confirmación.
- **Skeletons:** Componentes atómicos (SkeletonCard, SkeletonChat, SkeletonText) con animación pulse de Tailwind.
- **Empty States:** Componente genérico con props (icon, title, description, action?).

**Rationale:** Zustand para Toast porque necesita ser accesible desde cualquier componente sin prop drilling. Los demás son presentacionales puros.
