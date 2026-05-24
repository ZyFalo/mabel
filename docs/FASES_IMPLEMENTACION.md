# Fases de Implementación — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `4d124e2`
> **Fuente de verdad**: este archivo + `git log` + `openspec/changes/archive/`
> **Reemplaza**: Notion "Flujo de Implementación" (congelada en 2026-03-07, dice Fase 8-10 pendientes cuando 8 ya está hecha) + `FASE2_*.md` + `FASE3_*.md` (notas históricas fragmentadas)

Plan original: 10 fases incrementales. **Hito pilotable** alcanzado tras la Fase 7 (2026-03-07). **Hito de producción mínima viable** alcanzado tras la Fase 8 (2026-05-22). Pendientes: Fase 9 (Avatar 3D) y Fase 10 (Testing + QA + Deployment polish).

---

## Resumen ejecutivo

| Fase | Alcance | HUs | Estado | Comentario |
|------|---------|-----|--------|------------|
| 1 | Infraestructura + BD | — | ✅ Completada (2026-03-07) | Scaffold, 13 modelos iniciales, migración Alembic, monorepo |
| 2 | Auth + Consentimiento | HU-01, HU-02, HU-03 | ✅ Completada (2026-03-07) | Base obligatoria — sin auth no hay nada |
| 3 | Chat Core + LLM | HU-05, HU-06, HU-12, HU-14-17 | ✅ Completada (2026-03-07, migrada a Mabel-Gemma4 el 2026-05-23) | Streaming SSE, adapter pattern, originalmente Gemini |
| 4 | Guardrails + SOS + Seeds | HU-08 | ✅ Completada (2026-03-07) | Pre/post-filtro, panel SOS, severity 1-5 |
| 5 | Preferencias + Onboarding + Legal | HU-04, HU-11, HU-12, HU-13 | ✅ Completada (2026-03-07) | ARCO, eliminación, cambio de contraseña, revocación |
| 6 ↔ 7 | Check-in + Reportes | HU-06, HU-14 | ✅ Completada (2026-03-07) | Paralelizable con Fase 7 |
| — | 🎯 **HITO: Pilotable** | — | ✅ 2026-03-07 | Listo para piloto con 30 estudiantes UMB |
| 7 ↔ 6 | Voz ASR/TTS | HU-07, HU-09, HU-10 | ✅ Completada (2026-03-07) | faster-whisper + Piper TTS, paralelizable con Fase 6 |
| 8 | Panel Admin | HU-15, HU-16, HU-17 | ✅ Completada (2026-05-22) | Lifecycle completo, audit logs, multi-select bulk actions |
| — | 🎯 **HITO: MVP Productivo** | — | ✅ 2026-05-22 | Admin operativo, branding completo, Railway-ready |
| 9 | Avatar 3D + Lip Sync | HU-18 | ⏳ Pendiente | MVP actualmente usa avatar 2D en `/voice` (e1db168) |
| 10 | PWA + Instrumentos + Polish | D-15, SUS, encuestas | ⏳ Pendiente | `vite-plugin-pwa` no instalado, instrumentos externos D-11 |

### Trabajos completados fuera del plan canónico (2026-05)

| Trabajo | Fecha | Commit | Notas |
|---|---|---|---|
| Swap del adaptador LLM a OpenAI-compat | 2026-05-21 | (memoria `llm-openai-compat-migration.md`) | D-17 propuesta |
| Reskinado Mabel student | 2026-05-20 | `ca845f4` | D-16 propuesta |
| Reskinado Mabel admin | 2026-05-22 | `543f4b9` | D-16 propuesta |
| Mabel 2D en modo voz (Voice.tsx) | 2026-05-22 | `e1db168` | Adelanto parcial de Fase 9 |
| Integración Mabel-Gemma4 vía Modal | 2026-05-23 | `768b17d` | D-18 propuesta |
| 3 capas UX wait time LLM | 2026-05-24 | `ee2d3ca` + `fd089b3` | D-20 propuesta |
| Cron L2 redaction de message_id | 2026-05-24 | `8adbb54` | D-21 propuesta (era "post-MVP") |
| Auditoría manuales de tesis | 2026-05-24 | `4d124e2` | 48 hallazgos catalogados + fixes aplicados |
| Migración Notion → docs/ | 2026-05-24 | en curso | D-22 propuesta |

---

## Lógica del orden original

- **Fases 2 → 4** construyen el flujo crítico: login → chat → seguridad.
- **Fases 5 → 6** completan la experiencia del estudiante hasta ser pilotable.
- **Fases 6 ↔ 7** son **paralelizables** — ambas enriquecen el chat (Fase 3) de forma independiente. En la práctica se implementaron simultáneamente.
- **Fases 8 → 10** son mejoras incrementales que no bloquearon el piloto.

---

## Detalle por fase

### Fase 1 — Infraestructura + BD ✅

- **Completada**: 2026-03-07
- **Archivada en**: `openspec/changes/archive/2026-03-07-fase-1-infraestructura-bd/`
- **Entregables**:
  - Monorepo `backend/` + `frontend/`
  - 13 modelos SQLAlchemy iniciales (async + asyncpg) — crecieron a 15 con Evos 006/011
  - Migración Alembic inicial (`08b6189ffc35`, 13 tablas iniciales, 20 índices manuales)
  - FastAPI scaffold con health check (`/api/v1/health`)
  - React 18 + Vite + TailwindCSS v4 + Zustand + React Router (actualizado a React 19 + Vite 7 + Router 7 en mayo)
  - Docker Compose (PostgreSQL 16, puerto 5433)
  - `.env.example`, `.gitignore`, Ruff, ESLint+Prettier
  - Script `create_db.py` (asyncpg directo)
- **Notas**:
  - 39 discrepancias spec-vs-DDL corregidas en revisión previa
  - 6 índices añadidos manualmente a migración (no detectados por autogenerate)
  - TailwindCSS v4 usa `@tailwindcss/vite` + `@theme` (no `tailwind.config.js`)

### Fase 2 — Auth + Consentimiento ✅

- **Completada**: 2026-03-07
- **Archivada en**: `openspec/changes/archive/2026-03-07-fase-2-auth-consentimiento/`
- **HUs**: HU-01 (Registro), HU-02 (Login), HU-03 (Consentimiento)
- **Entregables backend (15 tareas)**:
  - Schemas Pydantic: `auth.py` (7 DTOs), `consent.py` (6 DTOs + enums)
  - Repositories: user, password_reset, consent, consent_version (async)
  - Services: auth_service (register, login, forgot/reset password), consent_service (accept, patch, status)
  - Middleware: `get_current_user`, `require_role`, `require_consent`
  - Routers: auth (5 endpoints), consent (4 endpoints), users (1 endpoint)
  - Seed: migración Alembic con `consent_version v1.0` activa
  - 11 rutas API verificadas
- **Entregables frontend (17 tareas)**:
  - Páginas: Landing (#01), Register (#02), Login (#03), ForgotPassword (#04), ResetPassword (#05), AccessDenied (#32), Consent (#06, scroll obligatorio + PATCH re-accept), ConsentRequired (#22, 3 variantes), ConsentRejected (#41)
  - Layout: Header (2 variantes por rol)
  - Infra: axios + JWT interceptor, Zustand auth store, 4 guards (PublicRoute, ProtectedRoute, ConsentGuard, RoleGuard)
- **Notas**:
  - 4 discrepancias detectadas en validación pre-apply (PATCH re-accept, scroll obligatorio, redirect condicional, estado sin versión activa) — todas corregidas antes de implementar
  - Vite build: 297 KB, 0 errores TypeScript

### Fase 3 — Chat Core + LLM ✅

- **Completada original**: 2026-03-07 (con Gemini API directo)
- **Migrada**: 2026-05-23 (commit `768b17d` — swap a Mabel-Gemma4 vía Modal)
- **Archivada en**: `openspec/changes/archive/2026-03-07-fase-3-chat-core-gemini/`
- **HUs**: HU-05 (Sesiones), HU-06 (Check-in), HU-12 (Historial), HU-14-17 (Reportes)
- **Entregables backend (17 archivos)**:
  - **LLM Abstraction (original)**: `LLMProvider(Protocol)` + `GeminiAdapter` (`google-generativeai` SDK, modelo `gemini-2.5-flash`)
  - **LLM Abstraction (actual)**: `LLMProvider(Protocol)` + `OpenAICompatAdapter` (default) + `GeminiAdapter` (legacy). Factory `get_llm_provider()` lee `LLM_PROVIDER` env.
  - System prompt como constante en `prompts.py`:
    - Generic flavor: `MABEL_SYSTEM_PROMPT` (psicoeducación, empatía, límites éticos, identidad)
    - Mabel-Gemma4 flavor: `MABEL_GEMMA4_SYSTEM_PROMPT` (fijo, viene en el fine-tune; check-in se inyecta en user turn, no system)
  - Streaming SSE via FastAPI `StreamingResponse(media_type="text/event-stream")` con generador async que formatea events a mano (`data: ...\n\n`). No se usa `sse-starlette`.
  - Schemas: `chat.py` (11 DTOs)
  - Repositories: session, message, message_report, preference (async)
  - Services: ChatService, ReportService
  - Routers: session_router (con messages anidados), report_router
  - 8 endpoints nuevos: sessions CRUD, messages CRUD, reports
  - Context window: 20 mensajes por defecto (`CONTEXT_WINDOW_SIZE` env var)
  - `save_history=OFF`: sesión se crea pero mensajes no se persisten
  - Sesión única activa: INSERT optimista + retry tras UniqueViolation de `uq_sessions_user_active`
  - `content_sha256` con `hashlib.sha256`
  - `checkin_opt_in` como snapshot de `preferences.checkin_enabled`
- **Entregables frontend (15 archivos)**:
  - Componentes transversales: Toast (#36), ConfirmModal (#37), Skeleton (#38), EmptyState (#39), SosFab
  - Layout: Sidebar estudiante (#34B) con historial agrupado, badge "En curso", "Historial desactivado" si `save_history=false`
  - Páginas: Home (#08), CheckIn (#09), Chat (#10), SessionEnd (#18), SessionDetail (#14)
  - Modal: ReportModal (#11) con 5 motivos, severity 1-5, badge "Ya reportado"
  - Stores: toastStore, chatStore (Zustand)
- **Cambios post-Fase 3 (2026-05)**:
  - Lazy session create (D-19): la sesión se crea al primer mensaje, no al navegar
  - 3 capas UX wait (D-20): LlmStatusChip, StreamingIndicator, useLlmPrewarm, streamingStatusText
  - Cold-start retry: 8×10s para 503 "Loading model", 3× exponencial 1-2-4s para 429/502/504
  - Mensajes de error más específicos (commit `61c980e`)

### Fase 4 — Guardrails + SOS ✅

- **Completada**: 2026-03-07
- **Archivada en**: `openspec/changes/archive/2026-03-07-fase-4-guardrails-sos/`
- **HUs**: HU-08 (Derivación SOS / Crisis)
- **Entregables backend (10 archivos)**:
  - Schemas: `guardrails.py` (3 DTOs)
  - Repositories: safety_event (create), system_config (lazy cache, 4 getters)
  - Services: GuardrailsService (pre-filter + post-filter + severity calc 1-5)
  - Routers: safety_event_router (POST `/safety-events`), system_config_router (GET `/system-config/sos`)
  - Chat integration: pre/post-filtro integrado en ChatService, `safety_flags` en mensajes
  - `main.py`: 2 routers nuevos registrados
  - Alembic migration: seed data (`sos_hotline_numbers`, `safety_keywords`, `sos_severity_threshold=3`, `guardrails_enabled=true`)
- **Entregables frontend (8 archivos)**:
  - SosPanel (#12): overlay superpuesto (D-02), líneas `tel:` desde `system_config`, registro `redirect_shown`, NO cierra sesión
  - SosFab: upgrade a SosPanel real (activación manual)
  - ConnectionError (#20): backoff exponencial 3s→6s→12s→max 30s
  - SessionExpiredModal (#21): modal bloqueante, preserva borrador en localStorage
  - Chat integration: `risk_detected` via SSE, auto-open SOS, corte de TTS (hook para Fase 7), draft recovery
  - App.tsx: SessionExpiredHandler global
- **Notas**:
  - Activación automática si `severity >= sos_severity_threshold` (default 3)
  - `system_config` cache en memoria, refresh con restart (MVP)
- **Cambios post-Fase 4**:
  - Evo 010 (2026-05-23): `system_config.value` para `safety_keywords` cambia shape (`string[]` → `[{keyword, critical}]`) para distinguir keywords críticas vs informativas
  - Cron L2 (D-21, 2026-05-24): redacción de `message_id` de payloads >30 días

### Fase 5 — Preferencias + Historial + Legal ✅

- **Completada**: 2026-03-07
- **Archivada en**: `openspec/changes/archive/2026-03-07-fase-5-preferencias-historial-legal/`
- **HUs**: HU-04 (Historial toggle), HU-11 (Historial), HU-12 (Ver sesiones), HU-13 (Borrar conversación)
- **Entregables backend (14 tareas)**:
  - Schemas: `preferences.py` (UpdatePreferencesRequest, PreferencesResponse, DeleteAccountRequest, ExportFormatEnum), `auth.py` (+ChangePasswordRequest), `consent.py` (+reduce_scope, +revoke en ConsentActionEnum)
  - Repositories: preference (+create, +update), user (+delete)
  - Services: preference (get/upsert), account (delete_account, change_password, export_data JSON/CSV), consent (+reduce-scope, +revoke)
  - Routers: preference (GET `/preferences/me`, PUT `/preferences`), users (+DELETE `/users/me`, +GET `/users/me/export`), auth (+PUT `/auth/change-password`), consent (+3 error handlers 409)
- **Entregables frontend (9 tareas)**:
  - Stores: preferencesStore
  - Páginas: Onboarding (#07, stepper 3 pasos), Settings (#15, 5 secciones → reducido a 4 en 2026-05)
  - Modales: DeleteAccountModal (#16, "ELIMINAR" case-sensitive), RevokeConsentModal (#17, 2 opciones: reduce-scope / revoke), ArcoExportModal (#40, JSON + CSV download), ChangePasswordModal (#42, strength indicator)
  - Guards: OnboardingGuard
- **Requisitos legales cubiertos (Ley 1581/2012)**:
  - #16 Eliminación de Cuenta: hard DELETE + CASCADE + SET NULL selectivo (D-14)
  - #17 Revocación de Consentimiento: reduce-scope (PATCH) + revoke (SET `revoked_at`, logout)
  - #40 ARCO Export: ver + exportar datos JSON/CSV (sin contenido de mensajes)
  - #42 Cambio de Contraseña: verificación de contraseña actual
- **Cambios post-Fase 5**:
  - Settings refactor (commit `543f4b9`): de 5 tabs a 4 (Accesibilidad fusionada en Voz)
  - Settings convertido en modal global vía `openSettings(tab?)` (commit `ca845f4`)

### Fase 6 — Check-in + Reportes ✅

- **Completada**: 2026-03-07 (mayoritariamente desde Fase 3)
- **Archivada en**: `openspec/changes/archive/2026-03-07-fase-6-checkin-reportes/`
- **HUs**: HU-06 (Check-in emocional), HU-14/15/16/17 (Reportes)
- **Esta fase cerró 3 gaps remanentes de Fase 3**:
  - SafetyEventRepository inyectado en ReportService. `safety_event` creado atómicamente con report (`event_type='user_report'`, `payload={'report_id'}`).
  - `CheckinPayload.focus` validado con Literal (6 categorías originales, extendidas a 8 en 2026-05: Académico, Social, Familiar, Pareja, Salud, Económico, Futuro, Otro)
  - Reported IDs cargados desde servidor al montar Chat (`Promise.allSettled`)
- **Cambios post-Fase 6**:
  - Check-in extendido a 7 campos (mood, sleep_quality, sleep_hours, focus multi-select, energy, notes, anonymous opt-in) en commit `67a99a0`

### Fase 7 — Voz ASR/TTS ✅

- **Completada**: 2026-03-07
- **Archivada en**: `openspec/changes/archive/2026-03-07-fase-7-voz-asr-tts/`
- **HUs**: HU-07 (ASR), HU-09 (Subtítulos), HU-10 (Toggle check-in)
- **Entregables backend (9 archivos)**:
  - Config: +4 env vars (`WHISPER_MODEL`, `PIPER_VOICE`, `PIPER_MODEL_PATH`, `UPLOAD_DIR`)
  - AsrService: faster-whisper con modelo lazy-loaded, transcripción + attachment opcional
  - TtsService: Piper TTS via subprocess, StreamingResponse `audio/wav`
  - Routers: `POST /api/v1/asr/transcribe` (audio multipart → texto), `GET /api/v1/tts/synthesize` (texto → WAV stream)
  - AttachmentRepository: create attachment (`kind='audio'`)
- **Entregables frontend (8 archivos)**:
  - Hooks: useAudioRecorder (MediaRecorder API, WebM), useTts (auto-play, mute con localStorage), useSubtitles (word-by-word highlight proporcional)
  - Chat.tsx: botón micrófono (pulsante rojo `#DC2626`), auto-play TTS al fin de SSE, mute global en área de input, subtítulos `bg-primary/20`
  - Settings.tsx: toggle TTS, preview de voz, `ttsEnabled` desde `accessibility` JSONB
  - SOS integration: `stopTts()` + `stopSubtitles()` al detectar riesgo
- **Scripts**: `setup-piper.sh` para instalación de Piper TTS
- **Cambios post-Fase 7**:
  - Piper voice baked en Docker image en build (60MB, Dockerfile L66-70) en lugar de setup separado
  - Voice mode 2D animada (commit `e1db168`) — adelanto parcial de Fase 9

### Fase 8 — Panel Admin ✅

- **Completada**: 2026-05-22
- **Commits principales**: `1c97b01` (config), `281f961` (admin lifecycle), `ffe1211` (full lifecycle + audit + multi-select), `543f4b9` (brand-skin), `ca845f4` (student redesign)
- **Archivada en**: `openspec/changes/archive/2026-05-20-fase-8-admin-panel/`
- **HUs**: HU-15, HU-16, HU-17
- **Entregables**:
  - **Backend**: routers admin separados (`backend/app/routers/admin/`): users, reports, safety-events, metrics, config, audit-logs, empathy-ratings. Servicios admin (`backend/app/services/admin/`).
  - **Frontend**: páginas admin completas (`frontend/src/pages/admin/`): Dashboard, Users, Reports, SafetyEvents, Metrics, Config, AuditLogs, EmpathyRatings. Componentes: BulkActionModal, DisableUserModal, EnableUserModal, UserDetailDrawer, ExportCsvButton, InfoHint, charts/.
  - **BD**:
    - Evo 006 (research instrumentation): `users.cohort`, `empathy_ratings`, latency-split en messages
    - Evo 008 (audit_logs actor): `audit_logs.admin_id` → `actor_id` + `actor_role` con CHECK
    - Evo 011 (session_ratings): tabla nueva
    - Evo 012 (sessions hidden): `hidden_at`, `hidden_reason`
  - **Funcionalidades**:
    - Lifecycle completo: Deshabilitar / Rehabilitar / Eliminar / Audit log por usuario
    - Multi-select bulk actions
    - Configuración runtime de `system_config` desde panel
    - Empathy ratings inter-rater
    - Métricas: dashboard 24h, métricas tabs B-E (sessions/day, mood distribution, safety events, latency)
    - Audit log con triple actor_role
- **Brand-skin aplicado** (D-16): paleta UMB consistente entre student y admin
- **Documentación**: `docs/ADMIN_PANEL.md` (~900 líneas, mantenida al día con cada fix per workflow agreement)

### Fase 9 — Avatar 3D + Lip Sync ⏳

- **Estado**: Pendiente
- **HUs**: HU-18
- **Alcance previsto**:
  - `@react-three/fiber` + `@pixiv/three-vrm`
  - Web Audio API para análisis de frecuencia (lip sync sin latencia)
  - Blend shapes (aa/ee/ih/oh/ou) a 30 FPS
  - Toggle Modo Chat / Modo Avatar 3D
- **Implementación parcial actual**: `frontend/src/pages/Voice.tsx` + `frontend/src/components/voice/MabelAvatar.tsx` implementan un avatar **2D** ilustrado/animado en modo voz (commit `e1db168`, 2026-05-22). Esto cubre la UX equivalente sin la complejidad WebGL.
- **Decisión técnica completa**: `docs/AVATAR_3D_DECISION_TECNICA.md` (ADR aprobado pero no implementado al 100%).
- **Riesgo**: si se implementa, el bundle crece ~255KB (three.js stack) + modelo VRM ~5MB. Beneficio: mayor sensación de presencia para el estudiante.

### Fase 10 — PWA + Instrumentos + Polish ⏳

- **Estado**: Pendiente
- **Decisión bloqueante**: D-15 (PWA via `vite-plugin-pwa`)
- **Alcance previsto**:
  - `vite-plugin-pwa` (service worker, manifest, instalable). **Estado actual**: NO instalado en `frontend/package.json`.
  - Cache-first (assets) + network-first (API)
  - Instrumentos: SUS, rúbrica empatía, bienestar pre/post (administrados externamente, D-11)
  - Importación de `survey_responses` (D-13)
  - Pulido final, accesibilidad WCAG validada, testing E2E
- **Riesgo**: si no se implementa PWA, el estudiante depende del browser bookmark.

---

## Hitos del proyecto

| Hito | Fecha | Comentario |
|------|-------|------------|
| 🎯 **Pilotable** | 2026-03-07 | Fases 1-7 completas. Lista para piloto con 30 estudiantes UMB. |
| 🎯 **MVP Productivo** | 2026-05-22 | Fase 8 completa. Admin operativo + Railway-ready. |
| 🎯 **Producción con LLM propio** | 2026-05-23 | Mabel-Gemma4 hospedada en Modal. Backend en Railway. |
| 🎯 **Compliance L2** | 2026-05-24 | Cron L2 redaction implementado. Ley 1581/2012 Art. 4 cubierto. |
| 🎯 **Documentación viva** | 2026-05-24 | Migración Notion → `docs/` (este doc entre ellos). |
| ⏳ **Avatar 3D shipped** | (Fase 9) | Pendiente |
| ⏳ **PWA + Polish final** | (Fase 10) | Pendiente |
| ⏳ **Estudio cuasiexperimental completo** | (post-Fase 10) | Recolección + análisis estadístico + tesis sustentada |

---

## Historial de actualizaciones de este doc

| Fecha | Cambio |
|---|---|
| 2026-05-24 | Doc creado consolidando Notion "Flujo de Implementación" (snapshot 2026-03-07) + `FASE2_*.md` + `FASE3_*.md` + commits 2026-05. Marca Fase 8 como ✅, añade trabajos fuera del plan canónico (LLM swap, cron L2, UX wait, brand-skins, manual audit). |

## Referencias

- `MEMORY.md` — auto-memoria con cambios completos por commit
- `git log --oneline -30` — últimos 30 commits con descripción
- `openspec/changes/archive/` — bitácoras detalladas de cada fase (1-8)
- `docs/DECISIONES.md` — qué decisiones se implementaron en cada fase
- `docs/DB_SCHEMA.md` §"Evoluciones" — historial de cambios de schema por fase
- `docs/INTERFACES_MVP.md` — qué interfaces se implementaron en cada fase
