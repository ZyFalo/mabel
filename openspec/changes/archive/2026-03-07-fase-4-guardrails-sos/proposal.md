## Why

Mabel IA tiene chat funcional (Fase 3) pero sin guardrails de seguridad. Un estudiante podría expresar crisis emocional y Mabel no detectaría el riesgo ni ofrecería líneas de ayuda. Esta fase implementa el sistema de seguridad completo: pre/post-filtros, detección de crisis, Panel SOS con líneas de emergencia, y seed data operacional en system_config. Es requisito obligatorio antes del piloto con 30 estudiantes.

## What Changes

- **Nuevo:** Guardrails middleware — pre-filtro (antes de Gemini, keywords match) y post-filtro (después de Gemini, contenido de riesgo). Toggle global desde `system_config.guardrails_enabled`.
- **Nuevo:** Servicio de guardrails con cálculo de severidad (1-5) basado en keywords detectadas. Umbral configurable desde `system_config.sos_severity_threshold`.
- **Nuevo:** Repository y router de safety_events — `POST /api/v1/safety-events` para registrar risk_detected, redirect_shown, user_report
- **Nuevo:** Repository de system_config — lectura de las 4 claves operacionales con cache en memoria
- **Nuevo:** Migración Alembic de seed data — 4 claves en system_config (sos_hotline_numbers, safety_keywords, sos_severity_threshold, guardrails_enabled) con valores exactos del §7.10
- **Nuevo:** Panel SOS (#12) — componente superpuesto (D-02), activación manual (FAB) + automática (pre-filtro), líneas de ayuda con `tel:`, corte de TTS al activar
- **Nuevo:** Error de Conexión (#20) — componente inline con backoff exponencial (3s→6s→12s→max 30s), shell offline PWA
- **Nuevo:** Sesión Expirada JWT (#21) — modal bloqueante, preserva borrador en localStorage
- **Nuevo:** Endpoint `GET /api/v1/system-config/sos` para obtener líneas de ayuda desde frontend
- **Modificado:** `ChatService.send_message` — integrar pre-filtro antes de enviar a Gemini y post-filtro después de recibir respuesta. SSE incluye flag `risk_detected` si post-filtro detecta riesgo.
- **Modificado:** `main.py` — registrar router de safety_events y endpoint de system_config

## Capabilities

### New Capabilities
- `guardrails-backend`: Pre-filtro, post-filtro, GuardrailsService, safety_events CRUD, system_config read, severity calculation, cache de config
- `sos-frontend`: Panel SOS (#12), activación manual/automática, líneas tel:, corte TTS, Error de Conexión (#20), Sesión Expirada JWT (#21)
- `system-config-seed`: Migración Alembic con 4 claves operacionales exactas del §7.10

### Modified Capabilities
- `chat-backend`: Integrar pre/post-filtro en send_message, flag risk_detected en SSE
- `backend-scaffold`: Agregar routers de safety-events y system-config al main.py

## Impact

**Backend:**
- Nuevos archivos: `services/guardrails_service.py`, `repositories/safety_event_repository.py`, `repositories/system_config_repository.py`, `routers/safety_event_router.py`, `routers/system_config_router.py`, `schemas/guardrails.py`
- Modificados: `services/chat_service.py` (pre/post-filtro), `main.py` (routers)
- Nueva migración Alembic: seed data system_config
- Tablas usadas (ya existen): `safety_events` (7 cols), `system_config` (6 cols)

**Frontend:**
- Nuevos archivos: `components/sos/SosPanel.tsx`, `components/ui/ConnectionError.tsx`, `components/ui/SessionExpiredModal.tsx`
- Modificados: `components/ui/SosFab.tsx` (reemplazar placeholder por real), `pages/Chat.tsx` (integrar detección de crisis en SSE), `api/client.ts` (interceptor sesión expirada), `App.tsx` (agregar SessionExpiredModal global)

**API endpoints nuevos:**
- `POST /api/v1/safety-events` — registrar evento de seguridad
- `GET /api/v1/system-config/sos` — obtener líneas de ayuda + estado de guardrails
