## Why

Mabel IA tiene autenticación y consentimiento (Fase 2), pero el estudiante no puede conversar con el asistente. Esta fase implementa el corazón del producto: sesiones de chat con check-in emocional, integración con Gemini 2.0 Flash via adapter pattern, streaming SSE, reportes de mensajes, y la interfaz completa de chat (#08, #09, #10, #11, #14, #18, #34B). Al terminar, un estudiante podrá conversar con Mabel por primera vez.

## What Changes

- **Nuevo:** LLM abstraction layer (`LLMProvider` protocol + `GeminiAdapter`) para integración con Gemini 2.0 Flash con swap futuro a modelo local
- **Nuevo:** Streaming SSE para respuestas palabra por palabra desde Gemini al frontend
- **Nuevo:** System prompt de Mabel (psicoeducación, empatía, límites éticos, no diagnóstico)
- **Nuevo:** CRUD de sesiones con enforcement de sesión única activa (`uq_sessions_user_active`)
- **Nuevo:** Mensajes CRUD con `content_sha256`, `latency_ms`, `tokens_prompt/completion`, `save_history=OFF` logic
- **Nuevo:** Check-in pre-sesión (mood, sleep, focus, note) con snapshot `checkin_opt_in` desde preferences
- **Nuevo:** Reporte de mensajes (5 razones, severidad, UNIQUE per message+reporter)
- **Nuevo:** Context window — últimos N mensajes como contexto para Gemini
- **Nuevo:** Home del estudiante (#08) con sidebar, saludo personalizado, sugerencias de conversación
- **Nuevo:** Sidebar del estudiante (#34B) con historial agrupado por fecha, sesión activa, variante historial desactivado
- **Nuevo:** Chat principal (#10, sin Avatar por ahora) con burbujas, input, typing indicator, finalizar sesión
- **Nuevo:** Check-in pre-sesión (#09) con slider de ánimo, sueño, foco, notas
- **Nuevo:** Modal de reporte (#11) con motivo, severidad, detalles, validación de duplicados
- **Nuevo:** Detalle de sesión (#14) en solo lectura para sesiones finalizadas
- **Nuevo:** Pantalla de sesión finalizada (#18) con resumen y despedida
- **Nuevo:** Componentes transversales: Toast (#36), Modal confirmación (#37), Skeleton loaders (#38), Empty states (#39)
- **Modificado:** `backend/app/main.py` — registrar routers de sessions, messages, reports

## Capabilities

### New Capabilities
- `chat-backend`: Sessions CRUD, messages CRUD, Gemini integration (LLMProvider + GeminiAdapter), streaming SSE, content_sha256, latency_ms, save_history logic, sesión única activa, check-in, context window, reporte de mensajes
- `chat-frontend`: Home (#08), sidebar (#34B), check-in (#09), chat (#10 sin Avatar), reporte (#11), detalle de sesión (#14), sesión finalizada (#18), componentes transversales (#36, #37, #38, #39)

### Modified Capabilities
- `backend-scaffold`: Agregar routers de sessions, messages y reports al main.py

## Impact

**Backend:**
- Nuevos archivos: `schemas/chat.py`, `repositories/session_repository.py`, `repositories/message_repository.py`, `repositories/message_report_repository.py`, `repositories/preference_repository.py`, `services/chat_service.py`, `services/llm/provider.py`, `services/llm/gemini_adapter.py`, `services/llm/prompts.py`, `routers/session_router.py`, `routers/message_router.py`, `routers/report_router.py`
- Modificados: `main.py` (nuevos routers), `requirements.txt` (+google-generativeai, +sse-starlette)
- Tablas usadas (ya existen): `sessions` (10 cols), `messages` (11 cols), `message_reports` (9 cols), `preferences` (7 cols, lectura)
- No se crean ni modifican tablas — los modelos SQLAlchemy ya existen de Fase 1

**Frontend:**
- Nuevos archivos: ~15 componentes/páginas (Home, Sidebar, Chat, CheckIn, SessionEnd, SessionDetail, ReportModal, Toast, ConfirmModal, Skeleton, EmptyState)
- Nuevo store: `chatStore.ts` (sesiones, mensajes, streaming)
- Modificados: `App.tsx` (nuevas rutas), `Header.tsx` (integración con sidebar toggle)
- Dependencia nueva: ninguna (SSE via fetch nativo)

**API endpoints nuevos:**
- `POST /api/v1/sessions` — crear sesión (cierre automático de previa)
- `GET /api/v1/sessions` — listar sesiones del usuario
- `GET /api/v1/sessions/:id` — detalle de sesión
- `PATCH /api/v1/sessions/:id` — actualizar check-in / finalizar
- `POST /api/v1/sessions/:id/messages` — enviar mensaje + obtener respuesta SSE
- `GET /api/v1/sessions/:id/messages` — listar mensajes de sesión
- `POST /api/v1/messages/:id/reports` — reportar mensaje
- `GET /api/v1/messages/:id/reports/check` — verificar si ya reportó
