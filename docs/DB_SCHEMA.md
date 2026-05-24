# Esquema de Base de Datos — Mabel IA

> **Estado**: alineado al 2026-05-24 · 15 tablas reales (Evo 012)
> **Fuente de verdad operativa**: `backend/alembic/versions/*.py` (las migraciones aplicadas son la realidad)
> **DDL declarativo**: `db/schema_postgresql.sql` (tiene drift parcial — falta `session_ratings` y `sessions.hidden_at`/`hidden_reason`)
> **Reemplaza**: `DB_SCHEMA_REVIEW.md`, `DB_SCHEMA_EVOLUTION_002.md`, `DB_SCHEMA_EVOLUTION_004.md`, `REPORTE_VALIDACION_BD_INTERFACES.md`, Notion "Esquema Definitivo de BD"

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Tablas | **15** |
| Columnas totales | ~110 |
| Foreign keys | ~16 |
| CHECK constraints | ~14 |
| UNIQUE constraints (declarados + parciales) | ~9 |
| Índices explícitos | ~26 |
| Migraciones Alembic aplicadas | 10 archivos (1 initial + 2 seeds + 7 evolutivas: 006-012) |

**Motor**: PostgreSQL 16 (único motor — Docker Compose en dev sobre puerto 5433, Railway/Postgres en producción).
**Tipos temporales**: todas las columnas son `TIMESTAMPTZ` desde la Evo 007 (2026-05-22).
**Identificadores**: UUID (`gen_random_uuid()` vía `pgcrypto`) en todas las PKs salvo `system_config` (TEXT PK por decisión de arbitraje del Agente 02 — las keys son identificadores semánticos conocidos en código).
**Extensiones**: `pgcrypto` (UUIDs server-side).
**Borrado de datos**: hard DELETE en MVP (D-14). `safety_events.user_id` y `audit_logs.actor_id` usan `ON DELETE SET NULL` para preservar evidencia anónima post-eliminación de cuenta.

### Tablas por dominio

| Dominio | Tablas |
|---------|--------|
| Autenticación | `users`, `password_reset_tokens` |
| Consentimiento | `consent_versions`, `consents` |
| Preferencias | `preferences` |
| Conversación | `sessions`, `messages`, `message_reports`, `attachments` |
| Seguridad | `safety_events` |
| Investigación | `survey_responses`, `empathy_ratings`, `session_ratings` |
| Auditoría | `audit_logs` |
| Sistema | `system_config` |

---

## 2. Catálogo de tablas

### 2.1 Autenticación

#### `users`

Tabla maestra de cuentas. Soporta dos roles (`student`, `admin`), bloqueo administrativo (`disabled_at` + razón) y hard DELETE (`deleted_at` se reserva pero el flujo actual borra directamente — D-14).

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK generada server-side por `pgcrypto`. Se referencia desde 11 tablas hijas (preferences, sessions, consents, audit_logs.actor_id, etc.). El generar UUID en Postgres y no en Python evita colisiones por clock-skew en múltiples workers. |
| `email` | TEXT | NO | — | UNIQUE. Correo institucional UMB (regla aplicada en `backend/app/schemas/auth.py` `RegisterRequest`, no en BD — se permite cualquier email para el flujo de invitación admin). Caso-insensitivo a nivel de búsqueda (`func.lower()` en `users_service.list_paginated`). |
| `hashed_password` | TEXT | NO | — | bcrypt hash (cost 12) generado en `auth_service.register_student`. Nunca expuesto fuera del backend; no aparece en `users/me` (Pydantic schema lo omite). Lo regenera el flujo de reset y el `PATCH /users/me/password`. |
| `display_name` | TEXT | SÍ | — | Nombre visible. NULL cuando el admin invita un usuario sin nombre o cuando se importa un alta legacy. Frontend hace fallback a `email.split('@')[0]` o "Usuario" (ver `StudentSidebarV3.tsx:560`, `UserMenu.tsx:161`). Pre-MVP el registro lo exige (`auth.RegisterRequest`); por eso usuarios self-served siempre lo tienen. |
| `role` | TEXT | NO | `'student'` | `student` \| `admin` (CHECK `chk_users_role`). Decisión D-01: login unificado, el JWT incluye `role` y el frontend redirige con `RoleGuard`. **No hay roles intermedios** (rater/tutor) — los empathy_ratings los hace cualquier admin. Cambiar el rol es operación manual (no hay endpoint). |
| `disabled_at` | TIMESTAMPTZ | SÍ | — | Bloqueo administrativo. NULL = cuenta activa. NOT NULL = `auth_service.login` responde 403. Set por `admin/users_service.disable_user`. La sesión JWT existente no se invalida server-side (stateless): el bloqueo solo aplica al próximo login. Para forzar logout inmediato habría que rotar `JWT_SECRET`. |
| `disabled_reason` | TEXT | SÍ | — | Texto libre del admin (visible en `UserDetailDrawer`). CHECK `chk_users_disabled_reason` la fuerza obligatoria cuando `disabled_at IS NOT NULL` — invariante de BD, no se puede bypassear desde código. Auditada en `audit_logs.detail.reason`. |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Server-side default. Usada en métricas de altas semanales (`metrics_service.users_new_this_week`). |
| `deleted_at` | TIMESTAMPTZ | SÍ | — | **Reservada — sin uso operativo al 2026-05-24**. D-14 fuerza hard DELETE: `account_service.delete_account` ejecuta `DELETE FROM users` directo (CASCADE en hijas). Se mantiene la columna para post-MVP si se decide soft delete. **No leer en queries** — el flujo asume "si la fila existe, está viva". |
| `cohort` | TEXT | SÍ | — | Marcador del estudio cuasi-experimental (Evo 006). Valores observados: `piloto-fase1`, `dev`, `control`, `intervention`. Sin CHECK constraint — texto libre para flexibilidad. Filtro principal del panel de métricas (`metrics_service` acepta `cohort=`). Índice parcial `idx_users_cohort` omite NULL (admin no participa del estudio). Editable desde `PATCH /admin/users/{id}/cohort` (auditado como `target_type='user_cohort'`). |

**CHECK constraints**
- `chk_users_role`: `role IN ('student', 'admin')`
- `chk_users_disabled_reason`: `disabled_at IS NULL OR disabled_reason IS NOT NULL`

**Índices**
- PK `users_pkey` sobre `id`
- UNIQUE `users_email_key` sobre `email`
- `idx_users_cohort` parcial: `(cohort) WHERE cohort IS NOT NULL`

**Evolución**: creada en `08b6189ffc35` (initial). `cohort` agregada en Evo 006. Tipos temporales migrados a TIMESTAMPTZ en Evo 007.

---

#### `password_reset_tokens`

Almacena tokens de recuperación de contraseña (hash SHA-256 nunca el token en claro). Un token consumido (`used_at IS NOT NULL`) no puede reutilizarse.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. Identificador interno; no se devuelve al usuario (el usuario solo ve el `token` en claro, que NO se guarda). |
| `user_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE. El CASCADE permite que al eliminar la cuenta los tokens pendientes desaparezcan automáticamente (D-10: tokens en tabla separada, no como columnas en `users`). |
| `token_hash` | TEXT | NO | — | SHA-256 hex del token aleatorio (`secrets.token_urlsafe`). **El token en claro nunca toca disco** — solo el hash. UNIQUE garantiza que dos solicitudes no pueden generar el mismo hash. Validación en `auth_service.reset_password`: hashea el token recibido y busca por igualdad. |
| `expires_at` | TIMESTAMPTZ | NO | — | Caducidad típica: 60 min (configurable en `auth_service`). `expires_at < now()` invalida el token aunque siga sin usarse. No hay cron de limpieza — se purgan al delete del user. |
| `used_at` | TIMESTAMPTZ | SÍ | — | Marca el consumo. NULL = token disponible. NOT NULL = ya redimido (`auth_service.reset_password` lo setea atómicamente con el cambio de password). El índice parcial `idx_prt_token_active` solo cubre filas `used_at IS NULL` para acelerar la búsqueda del path feliz. **Idempotente**: re-usar un token usado devuelve 400, no error de BD. |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Server-side default. Usado por `idx_prt_user_created` para mostrar el historial de solicitudes ordenado descendiente. |

**Índices**
- PK
- UNIQUE `password_reset_tokens_token_hash_key`
- `idx_prt_user_created`: `(user_id, created_at DESC)`
- `idx_prt_token_active` parcial: `(token_hash) WHERE used_at IS NULL`

**Evolución**: creada en initial. TIMESTAMPTZ en Evo 007.

---

### 2.2 Consentimiento

#### `consent_versions`

Documento legal del consentimiento informado (Ley 1581/2012). Cada versión guarda el cuerpo completo para auditabilidad. Una versión `active` a la vez; el resto queda `draft` o `archived`.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. Referenciada por `consents.consent_version_id` con `ON DELETE RESTRICT` (no se puede borrar una versión que tenga aceptaciones — protege evidencia legal). |
| `version` | TEXT | NO | — | UNIQUE. Identificador semántico (ej. `1.0`, `1.1`, `2.0`). Texto libre, no semver enforced. Usado por humanos en el panel admin para distinguir versiones; el código nunca parsea el formato. |
| `title` | TEXT | NO | — | Título visible al usuario en la pantalla de consentimiento (`/consent`). Se muestra como heading del documento. |
| `body` | TEXT | NO | — | Texto legal **completo**, formato Markdown (renderizado en frontend con `marked` o equivalente). **Inmutable en producción**: una vez activada, modificar el body invalidaría la evidencia legal de aceptación. Para cambiar el texto se crea una versión nueva (D-09). Tamaño esperado: 5-20 KB. |
| `status` | TEXT | NO | `'draft'` | `draft` \| `active` \| `archived` (CHECK `chk_consent_versions_status`). **Invariante**: solo una versión puede estar `active` a la vez. El índice parcial `idx_consent_versions_active` permite el lookup `WHERE status='active'` sin scan. `admin/config_service.activate_consent_version` (línea 248-258) hace UPDATE atómico: archiva la actual y activa la nueva en la misma transacción para mantener el invariante. |
| `published_at` | TIMESTAMPTZ | SÍ | — | Fecha de publicación (cuando pasó de `draft` a `active`). NULL = nunca publicada. Se conserva al pasar a `archived` para auditoría histórica. |
| `created_by` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL. Admin que redactó la versión. SET NULL preserva el documento si la cuenta del admin se elimina (versión legal sobrevive a la persona). |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Fecha de creación del registro (no de publicación — para eso `published_at`). |

**CHECK**
- `chk_consent_versions_status`: `status IN ('draft','active','archived')`

**Índices**
- PK; UNIQUE `consent_versions_version_key`
- `idx_consent_versions_active` parcial: `(status) WHERE status = 'active'`

**Seed**: `3c6f5125803d_seed_consent_version_active.py` inserta la versión `1.0` con el texto legal de la UMB.

**Evolución**: creada en initial; TIMESTAMPTZ en Evo 007.

---

#### `consents`

Aceptación del consentimiento por usuario. Re-aceptación post-revocación se hace vía UPDATE (`SET revoked_at = NULL`) no INSERT — el UNIQUE compuesto `(user_id, consent_version_id)` lo enforza.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. Identificador interno; en logs y exports se usa el par `(user_id, consent_version_id)` como llave semántica. |
| `user_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE. CASCADE porque el consentimiento sin user no tiene sentido legal (y la evidencia del acto se preserva via `audit_logs` con `target_type='consent'`). |
| `scope` | TEXT | NO | — | `solo_uso` \| `uso_mejora_anon` (CHECK `chk_consents_scope`). **Semántica**: `solo_uso` = el usuario solo permite usar sus datos para su propia experiencia; los mensajes >30 días deben redactarse (Cron L2 pendiente, ver §6). `uso_mejora_anon` = permite uso agregado anonimizado para investigación/mejora del modelo. Leído por `history_service` y servicios de métricas para decidir qué datos incluir. PO-Q1 cubre la decisión. |
| `accepted_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Timestamp del acto de aceptación (server-side). Es la **fuente legal** del consentimiento — D-09 exige scroll hasta el final antes de aceptar; el frontend solo dispara el POST cuando esa condición se cumple. |
| `revoked_at` | TIMESTAMPTZ | SÍ | — | NULL = consentimiento activo. NOT NULL = revocado. **Modelo de re-aceptación** (PO-Q1, Evo 005): tras revocar, si el usuario vuelve a aceptar la MISMA versión, se hace UPDATE `SET revoked_at = NULL, accepted_at = now()` (no INSERT — UNIQUE `(user_id, consent_version_id)` lo prohibiría). Si aparece una versión nueva, sí se inserta una fila nueva. |
| `consent_version_id` | UUID | NO | — | FK `consent_versions.id` ON DELETE RESTRICT. **Invariante crítico** (Evo 005): NOT NULL desde 2026-02-24. RESTRICT garantiza que ninguna versión con aceptaciones pueda eliminarse — protege evidencia bajo Ley 1581/2012. La columna legacy `version` TEXT se eliminó en Evo 005 por redundancia con esta FK. |

**CHECK**
- `chk_consents_scope`: `scope IN ('solo_uso','uso_mejora_anon')`

**UNIQUE**
- `uq_consents_user_version`: `(user_id, consent_version_id)`

**Índices**
- PK; UNIQUE arriba
- `idx_consents_user_latest`: `(user_id, accepted_at DESC)`

**Evolución**: creada en initial. Evo 005 eliminó la columna redundante `version` TEXT y promovió `consent_version_id` a NOT NULL. TIMESTAMPTZ en Evo 007.

---

### 2.3 Preferencias

#### `preferences`

Configuración 1:1 por usuario. El PK es directamente `user_id` (sin columna `id` propia).

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `user_id` | UUID | NO | — | PK + FK `users.id` ON DELETE CASCADE. **No hay columna `id` separada** — la tabla es 1:1 con `users` por diseño (decisión Ag.03). Permite `INSERT ON CONFLICT (user_id) DO UPDATE` idempotente al actualizar preferencias. |
| `save_history` | BOOLEAN | NO | `false` | Toggle de retención del historial conversacional. **`false` (default privacy-first)** = los mensajes NO se persisten (`chat_service` ramifica en `if save_history:` antes de cada INSERT a `messages`); la conversación es efímera, solo vive en el contexto del request. **`true`** = mensajes persisten en BD, sidebar muestra el historial. Decisión de "privacy by default": el usuario debe optar IN explícitamente (D-04 en MEMORY hace referencia a esto; D-14 política de retención hard-DELETE complementa). Cambiar de `true` → `false` no borra retroactivamente; solo el flag detiene nuevas escrituras (la limpieza activa va por `history_service`). |
| `ui_language` | TEXT | NO | `'es'` | **Reservada** para futuras versiones multi-idioma. En el MVP solo `es` (es-CO). Leída por `preference_service.get_preferences` para pasar al frontend, pero `frontend/src/i18n` no existe — siempre vuelve `es`. **Cuándo cambiar**: cuando se implemente i18n (post-Fase 10), aquí va el código del locale (`es-CO`, `es-MX`, etc.). |
| `tts_voice` | TEXT | SÍ | — | ID de voz Piper (ej. `es_ES-mls_9972-low`). **Placeholder hasta el modelo 2D/avatar animado** (ver MEMORY `onboarding-pending-when-voice-avatar-lands`). En el MVP solo hay 1 voz instalada; el selector está oculto en Settings (Onboarding.tsx:32) y siempre escribe NULL. `admin/users_service.py:253-254` lee `tts_enabled = pref.tts_voice is not None` como proxy "voz habilitada". NULL = TTS off. |
| `accessibility` | JSONB | SÍ | — | Bag JSON para toggles de accesibilidad. **Shape esperado**: `{"contrast": "normal"\|"high", "font_size": "sm"\|"md"\|"lg", "subtitles": bool, ...}`. Settings.tsx:354/404 escribe estas keys; Chat.tsx:105 las lee para activar subtítulos en burbujas. Los 3 toggles documentados están comentados/deshabilitados en UI hasta que se cierre la decisión de avatar 2D animado (ver `onboarding-pending`); el JSONB sigue aceptando escrituras para no perder datos cuando se rehabiliten. NULL = todos los defaults. |
| `checkin_enabled` | BOOLEAN | NO | `true` | Permite que el flujo de chat presente el check-in pre-sesión (estados: ánimo, energía, estrés, sueño...). Si `false`, el flujo salta el modal y arranca chat directo. Default `true` porque el check-in es central al objetivo psicoeducativo (alimenta `sessions.checkin_payload` que se inyecta al system prompt). |
| `preferred_chat_mode` | TEXT | NO | `'chat'` | `chat` \| `avatar` (CHECK `chk_preferences_chat_mode`, Evo 003). `chat` = burbujas tradicionales. `avatar` = renderiza el avatar 2D/3D con lip-sync (Fase 9, pendiente). En el MVP solo `chat` está implementado; `avatar` es un toggle reservado. Cuando una sesión se inicia bajo modo `avatar`, `sessions.avatar_used = true` queda como marca histórica. |

**CHECK**
- `chk_preferences_chat_mode`: `preferred_chat_mode IN ('chat','avatar')`

**Evolución**: creada en initial con `preferred_chat_mode` (Evo 003). TIMESTAMPTZ no aplica — sin columnas temporales.

---

### 2.4 Conversación

#### `sessions`

Hilo de conversación del usuario. UNIQUE parcial garantiza una sesión activa por usuario (`ended_at IS NULL`). Evo 012 introdujo soft-hide controlado por el usuario.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. Aparece en URLs (`/chat/:sessionId`) y como `session_id` en los SSE streams. |
| `user_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE. CASCADE arrastra mensajes, attachments y session_ratings al eliminar la cuenta (D-14 hard delete). Para safety_events conserva NULL via SET NULL (evidencia anónima). |
| `started_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Server-side. Define el orden de la lista del sidebar (índices `idx_sessions_user_time` y `idx_sessions_user_visible` ambos usan esta columna). |
| `ended_at` | TIMESTAMPTZ | SÍ | — | NULL = sesión activa. NOT NULL = cerrada. **Invariante**: UNIQUE parcial `uq_sessions_user_active` (Evo 005b) — un usuario solo puede tener UNA sesión con `ended_at IS NULL`. Si intenta abrir otra, `chat_service.create_session` debería cerrar la anterior primero (race-safe vía CONSTRAINT, no via lógica). |
| `topic_hint` | TEXT | SÍ | — | Texto libre que el usuario aporta al crear la sesión desde el modal de nuevo chat (input "¿De qué quieres hablar?"). Lo envía `POST /sessions` con `body.topic_hint` (`session_router.py:64`). **No se inyecta al system prompt directamente** — solo aparece como sub-título de la sesión en el sidebar (UI hint). NULL = sesión sin tema declarado. |
| `meta` | JSONB | SÍ | — | Bag JSON libre. **Uso actual al 2026-05-24**: vacío en práctica — no hay grep activo de keys específicas en el código. Reservado para extender la sesión con metadata (ej. `{"source": "checkin_modal", "campaign": "midterm-stress"}`) sin migrar el schema. |
| `checkin_opt_in` | BOOLEAN | NO | `true` | Snapshot del consentimiento al check-in en el momento de crear la sesión (independiente de `preferences.checkin_enabled` que puede cambiar después). Default `true`. Si el usuario rechazó el check-in en el modal, queda `false` y `checkin_payload` queda NULL. |
| `checkin_payload` | JSONB | SÍ | — | Respuestas del check-in pre-sesión. **Shape**: `{"mood": int, "energy": int, "stress": int, "sleep_quality": "good"\|..., "sleep": float, "loneliness": int, "focus": [str], "focus_other": str, "note": str}` (ver `services/llm/prompts.py:159-187` y `metrics_service.py:670-694`). Inyectado al system prompt vía `build_system_prompt(session.checkin_payload)` (`chat_service.py:297`). NULL si el usuario saltó el check-in. Métricas agregadas vía cast JSONB→Float en `metrics_service`. |
| `checkin_completed_at` | TIMESTAMPTZ | SÍ | — | Timestamp del envío del check-in. NULL = check-in no completado (incluye casos de opt-out y abandono del modal). |
| `avatar_used` | BOOLEAN | NO | `false` | Marca histórica: esta sesión utilizó el modo avatar (Evo 003). Setea `true` cuando `preferences.preferred_chat_mode='avatar'` al momento de crear la sesión. Útil para métricas A/B chat vs avatar cuando Fase 9 esté implementada. En el MVP siempre `false`. |
| `hidden_at` | TIMESTAMPTZ | SÍ | — | Evo 012. Soft-hide controlado por el usuario. NULL = visible en su sidebar. NOT NULL = el usuario eligió ocultarla (toggle "Guardar historial" off, o "Quitar" en el menú 3-puntos). **El admin sigue viendo todo** (panel de métricas usa `select(SessionModel)` directo). El índice parcial `idx_sessions_user_visible` cubre la query del sidebar. Operación **one-way** — no hay UI para "des-ocultar". Ver `docs/DATA_RETENTION_POLICY.md`. |
| `hidden_reason` | TEXT | SÍ | — | Audit trail del hide. CHECK `ck_sessions_hidden_reason` admite `user_toggle_off` (toggle global preferences off), `user_per_session` (menú 3-puntos en una sesión específica) o `admin_action` (reservada — admin no oculta hoy). Set por `history_service.py:82` y `:170`. |

**CHECK**
- `ck_sessions_hidden_reason`: `hidden_reason IS NULL OR hidden_reason IN ('user_toggle_off','user_per_session','admin_action')`

**Índices**
- PK
- `idx_sessions_user_time`: `(user_id, started_at)`
- `uq_sessions_user_active` UNIQUE parcial: `(user_id) WHERE ended_at IS NULL`
- `idx_sessions_user_visible` parcial: `(user_id, started_at DESC) WHERE hidden_at IS NULL` (Evo 012, cubre la query del sidebar `list_by_user`)

**Evolución**: creada en initial. `avatar_used` en Evo 003. TIMESTAMPTZ en Evo 007. `hidden_at` + `hidden_reason` + índice visible en Evo 012.

---

#### `messages`

Mensajes del hilo (system / user / assistant). La latencia se desglosa desde Evo 006 para separar ASR / LLM / TTS. La Evo 009 añadió UNIQUE parcial que protege contra greetings duplicados por StrictMode.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. Referenciada por `message_reports`, `attachments`, `empathy_ratings` (todas CASCADE). |
| `session_id` | UUID | NO | — | FK `sessions.id` ON DELETE CASCADE. Index `idx_messages_session_time(session_id, created_at)` soporta la query principal del repo (`list_by_session` ordenado ASC). |
| `role` | TEXT | NO | — | `system` \| `user` \| `assistant` (CHECK `chk_messages_role`). En el MVP solo se persisten `user` y `assistant`; `system` está reservado por compatibilidad con el patrón OpenAI/Gemini pero no se inserta — el system prompt va inline al request del LLM, no al historial. |
| `content` | TEXT | NO | — | Texto del mensaje. Para `assistant` es la respuesta completa concatenada del SSE stream. Para `user` es el input tal cual (post-transcripción ASR si fue audio). Sin sanitización HTML server-side — el frontend renderiza como texto plano. |
| `content_sha256` | TEXT | SÍ | — | Hash SHA-256 hex del content. Generado siempre en `chat_service` (`hashlib.sha256(content.encode()).hexdigest()`, líneas 267, 421, 586). **Sin UNIQUE constraint** — NO previene duplicados activamente. Sirve para futuras deduplicaciones offline y para verificar integridad si se exporta el historial. NULL solo en filas históricas pre-Fase 8. |
| `meta` | JSONB | SÍ | — | Metadatos libres del LLM. **Shape observado**: `{"model": "<LLM_MODEL>"}` para mensajes regulares; `{"model": "...", "greeting": true}` para el saludo inicial. La key `"greeting"` es **load-bearing**: el UNIQUE parcial `uq_messages_session_greeting` la usa para deduplicar el saludo automático (Evo 009, race contra React StrictMode que invoca `useEffect` dos veces). El predicado del índice usa `meta->>'greeting' = 'true'` (text equality) intencionalmente. |
| `safety_flags` | JSONB | SÍ | — | Resultado del pipeline de guardrails para este mensaje. **Shape**: `{"risk_detected": bool, "keywords": [str], "severity": int}` (1-5). NULL = el mensaje pasó sin trigger o guardrails estaban deshabilitados. Set en `chat_service.py:268-272` (pre-filter en user msg) y `:408` (post-filter en assistant msg). El registro en `safety_events` es paralelo — esta columna es el snapshot del mensaje, `safety_events` el log temporal. |
| `tokens_prompt` | INT | SÍ | — | Tokens consumidos por el prompt (input). Devuelto por el LLM provider en su response. NULL si el provider no lo reporta o si el mensaje es del usuario. Usado para métricas de costo/uso en el admin. |
| `tokens_completion` | INT | SÍ | — | Tokens generados (output). Solo poblado para `role='assistant'`. Acumulado atómico en el greeting via `update(Message)` directo en `chat_service.py:631-638` para evitar race en concurrent turns. |
| `latency_ms` | INT | SÍ | — | Latencia **end-to-end** del turno assistant (medida server-side desde inicio de procesamiento hasta último chunk del SSE). `time.time() - start_time` x1000 en `chat_service.py:401`. Es el KPI principal del criterio de éxito ("mediana ≤ 20s"). NULL en mensajes user y en assistant pre-Evo 006. Índice parcial `idx_messages_latency` cubre solo `role='assistant'` para queries de métricas. |
| `asr_latency_ms` | INT | SÍ | — | Latencia del Whisper transcribiendo audio del usuario (Evo 006). Medida en `asr_service` antes de pasar el texto a `chat_service`. NULL si el turno fue texto puro. Permite separar tiempo "transcripción" vs "modelo" en el dashboard. |
| `llm_latency_ms` | INT | SÍ | — | Latencia pura del LLM (Evo 006). Hoy igual a `latency_ms` porque el LLM domina el pipeline y ASR/TTS son out-of-band (`chat_service.py:425-427` documenta esto). Cuando el TTS pase a ser síncrono, este campo divergerá de `latency_ms`. |
| `tts_latency_ms` | INT | SÍ | — | Latencia del Piper sintetizando audio (Evo 006). NULL si el turno no usó TTS o si fue out-of-band. Permite aislar el costo de voz en el dashboard. |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Server-side. Define el orden estricto de la conversación (índice `idx_messages_session_time`). |

**CHECK**
- `chk_messages_role`: `role IN ('system','user','assistant')`

**Índices**
- PK
- `idx_messages_session_time`: `(session_id, created_at)`
- `idx_messages_latency` parcial: `(latency_ms) WHERE role='assistant' AND latency_ms IS NOT NULL`
- `uq_messages_session_greeting` UNIQUE parcial: `(session_id) WHERE role='assistant' AND meta->>'greeting'='true'` (Evo 009 — dedupe del saludo automático contra dobles invocaciones de `useEffect` en StrictMode)

**Evolución**: creada en initial. Latency-split en Evo 006. TIMESTAMPTZ en Evo 007. UNIQUE parcial del greeting en Evo 009.

---

#### `message_reports`

Reportes del estudiante sobre mensajes del asistente (alucinación, dañino, privacidad, baja empatía, otro). UNIQUE `(message_id, reporter_id)` evita doble-reporte del mismo usuario.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. |
| `message_id` | UUID | NO | — | FK `messages.id` ON DELETE CASCADE. Si el mensaje desaparece (raro — solo via hard delete de la cuenta), el reporte también: no tiene sentido un reporte huérfano. |
| `reporter_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE. CASCADE intencional — al eliminar la cuenta del reporter, sus reportes desaparecen (D-14). Los hallazgos accionables quedan registrados en `audit_logs` (que sí es SET NULL). |
| `reason` | TEXT | NO | — | CHECK `chk_message_reports_reason`: `hallucination` (info falsa) \| `harmful` (contenido dañino) \| `privacy` (filtración de datos) \| `low_empathy` (tono frío) \| `other`. Estos 5 valores son los que renderiza el modal de reporte en `frontend/src/components/chat/ReportModal`. Métricas: `low_empathy` cruza con el criterio de éxito "empatía ≥ 4/5 en ≥ 80%". |
| `details` | TEXT | SÍ | — | Texto libre opcional del reporter explicando el motivo. NULL = solo se marcó el motivo sin comentario. Visible al admin en `admin/reports_service`. |
| `status` | TEXT | NO | `'open'` | CHECK `chk_message_reports_status`: `open` (recién creado) → `triaged` (admin lo revisó y asignó severidad) → `resolved` (acción tomada) o `dismissed` (descartado). Las transiciones son one-way en práctica; el código no impone máquina de estados estricta. Indice `idx_message_reports_status` soporta el filtro de la cola admin. |
| `severity` | INT | SÍ | — | 1-5 (CHECK `chk_message_reports_severity`). NULL en estado `open` — solo el admin la asigna al triage (`admin/reports_service.py:151,221`). 5 = crítico (puede disparar revisión inmediata del modelo); 1 = ruido. |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Cuándo el reporter lo creó. |
| `updated_at` | TIMESTAMPTZ | SÍ | — | Cuándo el admin cambió status/severidad por última vez. NULL = nunca tocado por admin (sigue `open`). El backend lo setea manualmente — no hay trigger. |

**CHECK**
- `chk_message_reports_reason`
- `chk_message_reports_status`
- `chk_message_reports_severity`: `severity IS NULL OR (severity BETWEEN 1 AND 5)`

**Índices**
- PK
- UNIQUE `uq_message_reports_msg_user`: `(message_id, reporter_id)`
- `idx_message_reports_status`: `(status)`
- `idx_message_reports_msg_time`: `(message_id, created_at)`
- `idx_message_reports_reporter`: `(reporter_id)`

**Evolución**: creada en initial. TIMESTAMPTZ en Evo 007.

---

#### `attachments`

Adjuntos por mensaje (audio ASR, imagen, doc). `kind` controlado por CHECK.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. |
| `message_id` | UUID | NO | — | FK `messages.id` ON DELETE CASCADE. Al borrar el mensaje, el adjunto desaparece de la BD; **el archivo físico en disco NO se borra automáticamente** (sin trigger ni job). Es deuda — para MVP los uploads son <1GB total. |
| `kind` | TEXT | NO | — | CHECK `chk_attachments_kind`: `audio` \| `image` \| `doc`. En el MVP **solo `audio` está implementado** (vía ASR — `attachment_repository.create_audio` lo hardcodea). `image` y `doc` están reservados para post-MVP cuando se habilite upload manual. |
| `path` | TEXT | NO | — | Ruta relativa dentro de `UPLOAD_DIR` (ver `core/config.py`, default `uploads/audio/`). Formato típico: `<uuid>.wav` o `<uuid>.webm`. **Path traversal NO validado a nivel de BD** — el backend confía en que el código de upload genere paths seguros (siempre UUID-based). |
| `meta` | JSONB | SÍ | — | Bag JSON para duración (ms), MIME type, tamaño en bytes, codec, sample rate, etc. Shape no estandarizado al 2026-05-24 — uso poco frecuente. NULL en mayoría de filas; el backend no depende de él. |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Server-side. |

**CHECK**
- `chk_attachments_kind`: `kind IN ('audio','image','doc')`

**Índices**
- PK
- `idx_attachments_message`: `(message_id)`

**Evolución**: creada en initial. TIMESTAMPTZ en Evo 007.

---

### 2.5 Seguridad

#### `safety_events`

Eventos de seguridad detectados por guardrails o disparados por el usuario (SOS manual). Tras Evo 005c, `user_id` y `session_id` son nullable y usan `SET NULL` para preservar evidencia anónima cuando se elimina la cuenta (D-14).

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. Referenciada por `audit_logs.target_id` cuando un admin actualiza el evento (`target_type='safety_event'`). |
| `user_id` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL (Evo 005c, D-14). NULLABLE permite preservar el evento como **evidencia anónima** tras hard DELETE de la cuenta — clave para auditoría legal y métricas globales. Inserción siempre con `user_id` real; queda NULL solo post-CASCADE. |
| `session_id` | UUID | SÍ | — | FK `sessions.id` ON DELETE SET NULL. Mismo principio: evidencia sobrevive al borrado de la sesión. NULL = sesión ya eliminada o evento que no nació en una sesión (raro). |
| `event_type` | TEXT | NO | — | **Texto libre sin CHECK** — extensibilidad sobre estricteza. **Valores reales observados al 2026-05-24**: `risk_detected` (guardrails pre o post — `guardrails_service.py:33,68`), `user_report` (estudiante reportó mensaje — `report_service.py:54`). El admin agrega tipos custom via `admin/safety_events_service`. Índice `idx_safety_events_type` para filtros. |
| `payload` | JSONB | SÍ | — | Detalle del evento. **Shape para `risk_detected`**: `{"keywords": [str], "severity": int, "message_id": str\|null, "filter": "pre"\|"post"}` (ver `guardrails_service.py:34-39`). **Shape para `user_report`**: `{"report_id": str}` (`report_service.py:55`). `metrics_service.py:1151` extrae `payload->>'keywords'` para top-N agregado (anonimizado). |
| `status` | TEXT | NO | `'active'` | CHECK `chk_safety_events_status`: `active` (sin atención) \| `reviewed` (admin lo vio) \| `resolved` (acción tomada). Default `active` para que toda fila nueva entre a la cola. Indice `idx_safety_events_status` soporta el filtro del badge "alertas pendientes". |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Usado para ventanas temporales (`safety_events_24h`, `safety_events_per_day` en métricas — `metrics_service.py:395,1091`). |

**CHECK**
- `chk_safety_events_status`: `status IN ('active','reviewed','resolved')`

**Índices**
- PK
- `idx_safety_events_user_time`: `(user_id, created_at)`
- `idx_safety_events_type`: `(event_type)`
- `idx_safety_events_status`: `(status)`

**Evolución**: creada en initial. Evo 005c volvió `user_id` nullable con SET NULL. TIMESTAMPTZ en Evo 007.

---

### 2.6 Investigación

#### `survey_responses`

Respuestas a instrumentos del estudio cuasi-experimental (SUS, rúbrica de empatía, bienestar pre/post). UNIQUE `(user_id, instrument, phase)` garantiza una respuesta por par.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. |
| `user_id` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL. **Crítico para investigación**: preservar agregados aunque el participante elimine su cuenta. El índice parcial `idx_survey_user WHERE user_id IS NOT NULL` filtra solo respuestas todavía vinculadas. |
| `instrument` | TEXT | NO | — | CHECK `chk_survey_responses_instrument`: `sus` (System Usability Scale, 10 ítems Likert 1-5; criterio éxito SUS≥70) \| `empathy_rubric` (rúbrica de empatía aplicada externamente, D-11) \| `wellbeing_pre`/`wellbeing_post` (instrumento de bienestar pre/post intervención, mide el effect size ≥0.3 del criterio de éxito). |
| `phase` | TEXT | NO | — | CHECK `chk_survey_responses_phase`: `pre` \| `post`. **Importante**: la combinación con `instrument` no es libre — `wellbeing_pre` debería tener `phase='pre'` y `wellbeing_post` `phase='post'`. UNIQUE `(user_id, instrument, phase)` previene aplicaciones duplicadas. |
| `score` | NUMERIC(5,2) | SÍ | — | Puntaje agregado (ej. SUS 0-100). NULL si solo se almacenaron las respuestas crudas y el agregado se calcula al vuelo. Numeric con 2 decimales para precisión sin pérdida. |
| `raw_data` | JSONB | SÍ | — | Respuestas crudas del instrumento. Shape libre — depende del instrumento (típicamente `{"q1": 4, "q2": 5, ...}` para SUS, o JSON estructurado para wellbeing). Permite recalcular el score si cambia la fórmula. NULL si solo se importó el agregado. |
| `administered_at` | TIMESTAMPTZ | NO | — | Cuándo se aplicó al participante en la realidad (externo al sistema). **D-11**: instrumentos SUS/Empatía se administran fuera de la app (Google Forms u otro) y se importan vía CSV. Esta es la fecha "real" del evento. |
| `imported_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Cuándo el admin cargó la respuesta al sistema. Es ≥ `administered_at`. Útil para auditoría de la carga de datos. |
| `imported_by` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL. Admin que ejecutó la importación. SET NULL para preservar la fila si el admin se elimina. |

**CHECK**
- `chk_survey_responses_instrument`
- `chk_survey_responses_phase`: `phase IN ('pre','post')`

**UNIQUE**
- `uq_survey_user_instrument_phase`: `(user_id, instrument, phase)`

**Índices**
- PK; UNIQUE arriba
- `idx_survey_instrument_phase`: `(instrument, phase)`
- `idx_survey_user` parcial: `(user_id) WHERE user_id IS NOT NULL`

**Evolución**: creada en Evo 004 (Notion la llama tabla nueva); registrada en initial de Alembic. TIMESTAMPTZ en Evo 007.

---

#### `empathy_ratings`

Calificaciones de empatía por evaluador entrenado (rater) sobre mensajes del asistente. Sustituye la fuente del criterio de éxito "empatía ≥ 4/5 en ≥ 80%". UNIQUE `(message_id, rater_id)` admite múltiples raters para inter-rater reliability.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. Usada como `target_id` en `audit_logs` (`target_type='empathy_rating'`). |
| `message_id` | UUID | NO | — | FK `messages.id` ON DELETE CASCADE. Si el mensaje desaparece (hard delete del user), las calificaciones también — la unidad de evaluación deja de existir. |
| `rater_id` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL. **Permite inter-rater reliability**: el mismo mensaje puede tener N filas con distinto rater. NULL = el rater fue eliminado pero la calificación persiste para análisis histórico. |
| `score` | INT | NO | — | 1-5 (CHECK `chk_empathy_ratings_score`). **Semántica**: 1 = nada empático, 5 = altamente empático. Criterio de éxito del estudio: ≥4 en ≥80% de los mensajes calificados. |
| `criteria` | JSONB | SÍ | — | Checklist desglosada del rater. **Shape**: `{"empathic_tone": bool, "validation": bool, "hallucination": bool}` y opcionalmente más keys (ver `schemas/admin.py:386` "free-form checklist"). Permite analizar el "por qué" de un score bajo (ej. ¿fue por tono o por alucinación?). NULL = rater solo dio score sin checklist. |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Cuándo se creó la calificación inicial. |
| `updated_at` | TIMESTAMPTZ | SÍ | — | Set por `PATCH /admin/empathy-ratings/{id}` cuando el rater edita score o criteria (Evo 009). NULL = nunca editada (created_at sigue siendo la fuente única del timestamp original). El servicio compara con `criteria is not None` para decidir si actualiza (`empathy_service.py:323-325`). |

**CHECK**
- `chk_empathy_ratings_score`: `score BETWEEN 1 AND 5`

**UNIQUE**
- `uq_empathy_ratings_message_rater`: `(message_id, rater_id)`

**Índices**
- PK; UNIQUE arriba
- `idx_empathy_ratings_message`: `(message_id)`
- `idx_empathy_ratings_rater`: `(rater_id)`

**Evolución**: creada en Evo 006. `updated_at` agregada en Evo 009.

---

#### `session_ratings`

Calificación del estudiante a una sesión (1-5 corazones, más = mejor). UPSERT idempotente por `(session_id, user_id)`. CTA visible incluso en sesiones cerradas; el estudiante puede editar la calificación en cualquier momento.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. |
| `session_id` | UUID | NO | — | FK `sessions.id` ON DELETE CASCADE. Al cerrar/borrar sesión, su rating desaparece. |
| `user_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE. Garantiza que el rating no sobrevive a la cuenta. La UNIQUE `(session_id, user_id)` formalmente admite que distintos usuarios califiquen la misma sesión, pero el modelo de negocio actual es 1:1 sesión-usuario (la sesión pertenece a un solo user), así que en práctica hay máx. 1 rating por sesión. |
| `rating` | INT | NO | — | 1-5 corazones (CHECK `ck_session_ratings_range`). **Semántica**: 1 = muy mala experiencia, 5 = excelente. UI: header del chat (visible incluso en sesiones cerradas). El estudiante puede **editar las veces que quiera** (UPSERT idempotente via UNIQUE). |
| `created_at` | TIMESTAMPTZ | NO | `now()` | Cuándo se hizo el primer rating de la sesión. NOT NULL. |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Refleja la última edición. Igual a `created_at` si nunca se editó. **NOT NULL** (distinto a otras tablas) — el UPSERT setea ambos en el INSERT inicial. |

**CHECK**
- `ck_session_ratings_range`: `rating BETWEEN 1 AND 5`

**UNIQUE**
- `uq_session_ratings_session_user`: `(session_id, user_id)`

**Índices**
- PK; UNIQUE arriba
- `idx_session_ratings_session`: `(session_id)`
- `idx_session_ratings_user`: `(user_id)`

**Evolución**: nueva en Evo 011 (no existe en `db/schema_postgresql.sql` — drift documentado en §5).

---

### 2.7 Auditoría

#### `audit_logs`

Tabla inmutable de auditoría (no se eliminan, no se actualizan). Evo 008 renombró `admin_id` → `actor_id` y agregó `actor_role` para registrar también acciones del estudiante (register, login, login_failed, delete, consent grant/revoke, password reset) y del sistema (jobs).

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK. Es la única forma de referirse a una entrada concreta — el resto es búsqueda por filtros. |
| `actor_id` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL (renombrada desde `admin_id` en Evo 008). SET NULL preserva la entrada inmutable aunque la cuenta se elimine — los logs son la **evidencia legal**, sobreviven a la persona. NULL legítimo cuando: (a) acción del sistema (job, migration), (b) actor ya borrado, (c) acción anónima (pre-auth). |
| `actor_role` | TEXT | NO | — | CHECK `chk_audit_logs_actor_role`: `admin` \| `student` \| `system`. Evo 008 introdujo `student` y `system` (antes solo había `admin`). **Sin `server_default`** intencional: forzar al código a ser explícito sobre el rol (`audit_service.py:64-94`); un INSERT que omita actor_role falla con NOT NULL en vez de silenciosamente marcar como `admin`. Backfill histórico fue `'admin'` y luego DROP DEFAULT. Indice `idx_audit_logs_role_time` soporta el filtro "por rol" del panel. |
| `action` | TEXT | NO | — | **Texto libre sin CHECK** — la extensibilidad pesa más que la estricteza. Valores observados: `register`, `login`, `login_failed`, `delete_account`, `consent_grant`, `consent_revoke`, `password_reset`, `disable_user`, `enable_user`, `update_cohort`, `update_safety_event`, `delete_safety_event`, `create_empathy_rating`, `update_empathy_rating`, etc. La validación de coherencia (actor_role + action) NO se enforce en BD ni en código deliberadamente (`audit_service.py:9-10`). |
| `target_type` | TEXT | SÍ | — | Tipo de entidad apuntada (polimorfismo intencional). Valores observados: `user`, `user_cohort`, `safety_event`, `message`, `empathy_rating`, `consent`. NULL para acciones globales (login, logout, system jobs). |
| `target_id` | UUID | SÍ | — | UUID del target. **Sin FK** porque es polimórfico — puede apuntar a `users.id`, `safety_events.id`, etc. La consecuencia: si la entidad target se elimina, el UUID aquí queda **huérfano** (no se limpia automáticamente). Aceptable porque audit_logs son inmutables y los UUIDs nunca se reciclan. |
| `detail` | JSONB | SÍ | — | Payload contextual arbitrario. Ejemplos: `{"reason": "..."}` (disable_user), `{"old": "cohort_a", "new": "cohort_b"}` (update_cohort), `{"score": 4, "criteria": {...}}` (empathy_rating), `{"reason": "...", "bulk": true}` (bulk ops), `{"previous": {...}}` (updates con diff). NULL = acción sin detalle extra (raro). |
| `ip_address` | TEXT | SÍ | — | IP del request (cuando aplica). Soporta IPv4 e IPv6 (por eso TEXT, no INET). NULL para acciones del sistema o cuando no se capturó. Útil para investigaciones forenses. |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Inmutable. Define el orden cronológico — todos los índices (`idx_audit_logs_*`) ordenan DESC para mostrar lo más reciente primero. |

**CHECK**
- CHECK constraint `actor_role IN ('admin','student','system')`. **⚠️ Naming dual (deuda DR-11)**: el modelo SQLAlchemy declara `name='audit_logs_actor_role_check'` (`backend/app/models/audit_log.py:16`) mientras la migración 008 crea `chk_audit_logs_actor_role` (`backend/alembic/versions/008_audit_logs_actor.py:124`). **No son alias** — son nombres distintos en Postgres; según el orden de aplicación puede crearse uno u otro (o duplicarse si Postgres ya tiene la otra por autogenerate previo). Verificar con `\d audit_logs` post-deploy.

**Índices**
- PK
- `idx_audit_logs_actor_time`: `(actor_id, created_at DESC)` (renombrado desde `idx_audit_logs_admin_time` en Evo 008)
- `idx_audit_logs_action_time`: `(action, created_at DESC)`
- `idx_audit_logs_role_time`: `(actor_role, created_at DESC)` (nuevo en Evo 008 — soporta el filtro "por rol" del panel admin)

**FK rename**: Evo 008 también renombra la constraint `audit_logs_admin_id_fkey` → `audit_logs_actor_id_fkey` (Postgres no auto-renombra constraints en RENAME COLUMN; evita ruido futuro en autogenerate).

**Evolución**: creada en initial. TIMESTAMPTZ en Evo 007. Renombre + nuevo rol en Evo 008.

---

### 2.8 Sistema

#### `system_config`

Configuración runtime ajustable por admin sin redeploy. PK es TEXT (clave semántica conocida en código). Cada valor es JSONB libre.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `key` | TEXT | NO | — | PK semántica (no UUID — decisión de arbitraje Ag.02). Las keys son identificadores conocidos en código (`get_sos_threshold`, `get_guardrails_enabled`, etc.). Permite UPSERT idempotente desde seeds. |
| `value` | JSONB | NO | — | Valor estructurado o escalar (JSONB acepta `true`, `4`, `"str"`, `[...]`, `{...}`). NOT NULL — todas las keys deben tener un valor. **Validación por key** en `admin/config_service.py:113-128` (ej. `validate_sos_severity_threshold` exige int 1-5). Ver tabla de shapes abajo. |
| `description` | TEXT | SÍ | — | Documentación inline visible al admin en el panel. Texto libre. NULL aceptado pero los seeds siempre la pueblan. |
| `updated_by` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL. Admin que hizo el último cambio. NULL para seeds iniciales (no había usuario admin todavía) y para cambios del sistema. |
| `updated_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Refleja la última escritura. El backend lo setea explícitamente al UPSERT — no hay trigger. |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Cuándo se creó la key originalmente (típicamente: seed migration). Inmutable post-creación. |

**Índices**: solo PK.

**Keys seedeadas** (`a1b2c3d4e5f6` + Evo 006 + Evo 010):

| key | Shape de `value` | Descripción |
|---|---|---|
| `sos_hotline_numbers` | `[{name, number}, ...]` | Líneas de crisis del Panel SOS (#12) |
| `safety_keywords` | `[{keyword, critical}, ...]` (Evo 010) | Lista 100% data-driven. `critical=true` fuerza severidad 5 (auto-SOS); `false` suma +1 (cap 4) |
| `sos_severity_threshold` | `4` (entero como JSON) | Umbral para activación automática de SOS (1-5) |
| `guardrails_enabled` | `true` (booleano JSON) | Toggle global de guardrails |
| `study_lock_enabled` | `false` (Evo 006) | Bloqueo de configuración durante el estudio. `true` → PATCH a guardrails devuelve 423 salvo override |

**Evolución**: creada en initial. Seeds operativos en `a1b2c3d4e5f6`. `study_lock_enabled` en Evo 006. TIMESTAMPTZ en Evo 007. Migración de shape de `safety_keywords` (legacy `["str", ...]` → estructurado) en Evo 010.

---

## 3. Diagrama de relaciones

```
                                ┌────────────────────┐
                                │       users        │
                                │  (PK: id)          │
                                └──────────┬─────────┘
              ┌──────────────────┬─────────┼─────────┬────────────┬──────────────┐
              │ CASCADE          │ CASCADE │ SET NULL│ SET NULL   │ CASCADE      │
              ▼                  ▼         ▼         ▼            ▼              ▼
       ┌──────────────┐   ┌────────────┐  ...   ┌──────────┐  ┌────────┐  ┌──────────────┐
       │ preferences  │   │  consents  │        │audit_logs│  │ surveys│  │   sessions    │
       │ (PK: user_id)│   └──────┬─────┘        │ actor_id │  │_responses│ └──────┬────────┘
       └──────────────┘          │RESTRICT      └──────────┘  └────────┘         │ CASCADE
                                 ▼                                                ▼
                        ┌──────────────────┐                              ┌─────────────┐
                        │ consent_versions │                              │  messages   │
                        └──────────────────┘                              └──────┬──────┘
                                                                                 │ CASCADE
                                                            ┌────────────────────┼──────────────────┐
                                                            ▼                    ▼                  ▼
                                                   ┌───────────────┐    ┌──────────────────┐  ┌─────────────────┐
                                                   │  attachments  │    │ message_reports  │  │ empathy_ratings │
                                                   └───────────────┘    └──────────────────┘  └─────────────────┘

  ┌───────────────────────┐ ON DELETE CASCADE de users
  │ password_reset_tokens │
  └───────────────────────┘

  ┌──────────────┐  user_id SET NULL,  session_id SET NULL
  │safety_events │
  └──────────────┘

  ┌────────────────┐  session_id CASCADE, user_id CASCADE
  │session_ratings │
  └────────────────┘

  ┌──────────────┐  updated_by SET NULL
  │ system_config│
  └──────────────┘
```

### FKs principales (resumen)

| Tabla | Columna | Referencia | ON DELETE |
|---|---|---|---|
| `consents` | `user_id` | `users.id` | CASCADE |
| `consents` | `consent_version_id` | `consent_versions.id` | RESTRICT |
| `consent_versions` | `created_by` | `users.id` | SET NULL |
| `preferences` | `user_id` | `users.id` | CASCADE |
| `password_reset_tokens` | `user_id` | `users.id` | CASCADE |
| `sessions` | `user_id` | `users.id` | CASCADE |
| `messages` | `session_id` | `sessions.id` | CASCADE |
| `attachments` | `message_id` | `messages.id` | CASCADE |
| `message_reports` | `message_id` | `messages.id` | CASCADE |
| `message_reports` | `reporter_id` | `users.id` | CASCADE |
| `safety_events` | `user_id` | `users.id` | SET NULL |
| `safety_events` | `session_id` | `sessions.id` | SET NULL |
| `audit_logs` | `actor_id` | `users.id` | SET NULL |
| `survey_responses` | `user_id` | `users.id` | SET NULL |
| `survey_responses` | `imported_by` | `users.id` | SET NULL |
| `empathy_ratings` | `message_id` | `messages.id` | CASCADE |
| `empathy_ratings` | `rater_id` | `users.id` | SET NULL |
| `session_ratings` | `session_id` | `sessions.id` | CASCADE |
| `session_ratings` | `user_id` | `users.id` | CASCADE |
| `system_config` | `updated_by` | `users.id` | SET NULL |

---

## 4. Evoluciones del esquema (002 → 012)

Las evoluciones 002-005c son históricas y están consolidadas en el initial migration de Alembic (`08b6189ffc35`). Las evoluciones 006-012 son las migraciones explícitas post-initial.

### Evo 002 — Tablas operativas iniciales (2026-02-20)
- **Nuevas**: `audit_logs`, `password_reset_tokens`, `survey_responses`.
- **Modificadas**: `users` (+`role`, +`disabled_at`, +`disabled_reason`); `safety_events` (+`status`).
- **Origen**: catálogo de interfaces MVP + D-06, D-10, D-11.

### Evo 003 — Avatar 2D/3D (2026-02-22)
- `preferences.preferred_chat_mode` (CHECK chat/avatar).
- `sessions.avatar_used` BOOLEAN.

### Evo 004 — Consentimiento versionado y configuración runtime (2026-02-23)
- **Nuevas**: `consent_versions`, `system_config`.
- **Modificadas**: `messages.latency_ms`; `consents.revoked_at`, `consents.consent_version_id`.
- **+5 índices**: `idx_consent_versions_active`, `idx_messages_latency`, `idx_consents_user_latest`, `idx_attachments_message`, `idx_message_reports_reporter`.

### Evo 005 — Auditoría post-004 (2026-02-24)
- Eliminada `consents.version` TEXT (redundante con `consent_version_id`).
- `consents.consent_version_id` promovida a NOT NULL.
- Re-aceptación post-revocación: vía UPDATE (`SET revoked_at = NULL`), no INSERT.

### Evo 005b — UNIQUE parcial / sesión única activa (2026-02-25)
- `uq_sessions_user_active` UNIQUE parcial: `(user_id) WHERE ended_at IS NULL`.

### Evo 005c — safety_events.user_id nullable + SET NULL (2026-02-26, D-14)
- Preserva eventos como registros anónimos tras hard DELETE de la cuenta.

### Evo 006 — Research instrumentation (2026-05-20)
- **Archivo**: `006_research_instrumentation.py` (revision `006_research_inst`).
- `users.cohort` TEXT + `idx_users_cohort` parcial.
- `messages.asr_latency_ms`, `messages.llm_latency_ms`, `messages.tts_latency_ms`.
- Nueva tabla `empathy_ratings` (con UNIQUE `(message_id, rater_id)` e índices).
- Seed `system_config.study_lock_enabled = false`.

### Evo 007 — TIMESTAMP → TIMESTAMPTZ (2026-05-22)
- **Archivo**: `007_timestamptz_conversion.py`.
- Convierte 24 columnas (lista en la migración) a `TIMESTAMP WITH TIME ZONE`.
- **Motivación**: asyncpg lanzaba "can't subtract offset-aware and offset-naive datetimes" en queries de métricas; el backend escribe `datetime.now(UTC)` aware, columnas naive lo rompían.
- Idempotente: cada ALTER se guarda con un check en `information_schema.columns`.

### Evo 008 — audit_logs actor genérico (2026-05-22)
- **Archivo**: `008_audit_logs_actor.py`.
- Rename `admin_id` → `actor_id` (idempotente).
- Rename FK constraint `audit_logs_admin_id_fkey` → `audit_logs_actor_id_fkey`.
- +`actor_role` TEXT NOT NULL (backfill con `'admin'`, luego DROP DEFAULT para que futuros INSERT sin valor fallen).
- CHECK `chk_audit_logs_actor_role` (`admin|student|system`).
- Drop `idx_audit_logs_admin_time`; create `idx_audit_logs_actor_time` y `idx_audit_logs_role_time`.

### Evo 009 — Greeting UNIQUE + empathy.updated_at (2026-05-22)
- **Archivo**: `009_greeting_unique_empathy_updated.py`.
- Preflight: borra greetings duplicados preservando el más antiguo por sesión.
- `uq_messages_session_greeting` UNIQUE parcial: `(session_id) WHERE role='assistant' AND meta->>'greeting'='true'` (text equality intencional — evita cast a boolean que rompería sobre payloads rogue).
- +`empathy_ratings.updated_at` TIMESTAMPTZ NULL.

### Evo 010 — safety_keywords legacy → estructurado (2026-05-23)
- **Archivo**: `010_safety_keywords_structured.py`.
- `system_config.value` de `safety_keywords`: `["suicidio", ...]` (legacy string[]) → `[{"keyword": "suicidio", "critical": true}, ...]` (estructurado, 17 entradas baseline).
- Guard idempotente: solo UPDATE si `jsonb_typeof(value->0) <> 'object'`.
- Downgrade es no-op intencional (rollback reintroduciría la regresión de seguridad).

### Evo 011 — session_ratings (2026-05-23)
- **Archivo**: `011_session_ratings.py`.
- Nueva tabla `session_ratings` (1-5 corazones, UPSERT por `(session_id, user_id)`).

### Evo 012 — sessions.hidden_at + hidden_reason (2026-05-23)
- **Archivo**: `012_sessions_hidden.py`.
- `sessions.hidden_at` TIMESTAMPTZ NULL + `sessions.hidden_reason` TEXT NULL.
- CHECK `ck_sessions_hidden_reason` (valores `user_toggle_off|user_per_session|admin_action`).
- `idx_sessions_user_visible` parcial: `(user_id, started_at DESC) WHERE hidden_at IS NULL`.
- Habilita el patrón de `docs/DATA_RETENTION_POLICY.md` (soft-hide one-way controlado por el usuario; admin sigue viendo todo).

---

## 5. DDL drift

El archivo `db/schema_postgresql.sql` se mantuvo manualmente como DDL declarativo y se ha desviado del estado real al 2026-05-24:

| Drift | Descripción |
|---|---|
| **Falta tabla `session_ratings`** | Introducida en Evo 011 (2026-05-23). El SQL declarativo solo lista 14 tablas (faltaría la 15). |
| **Faltan `sessions.hidden_at` y `sessions.hidden_reason`** | Introducidas en Evo 012 (2026-05-23). |
| **Faltan CHECK `ck_sessions_hidden_reason` y `idx_sessions_user_visible`** | Consecuencia del anterior. |
| **Comentarios desactualizados** | El encabezado del archivo dice "13 tablas (102 columnas)" — la realidad es 15 tablas / ~110 columnas. |

**Recomendación**: tratar las migraciones Alembic como única fuente de verdad. Regenerar el DDL declarativo cuando se necesite (ver §7) o eliminarlo si nadie lo consume directamente.

---

## 6. Política de retención

Detalle completo en **`docs/DATA_RETENTION_POLICY.md`**.

Puntos clave que cumplir desde la BD:

- **Hard DELETE en MVP** (D-14): borrado directo de cuentas via CASCADE en las FKs hijas. `users.deleted_at` queda reservada para post-MVP.
- **`safety_events.user_id` SET NULL** (Evo 005c): la evidencia de seguridad persiste anónima.
- **`audit_logs.actor_id` SET NULL** (Evo 008): los logs son inmutables y sobreviven a la eliminación del actor.
- **`survey_responses.user_id` SET NULL**: preserva agregados del estudio post-eliminación.
- **Soft-hide del usuario** (Evo 012): `sessions.hidden_at` quita una sesión del sidebar sin borrarla (admin sigue viendo todo para métricas). La acción es one-way y B-04 (scope `solo_uso` → hard delete) se enforce en `history_service.py`, no en BD.
- **Cron L2 (post-MVP)**: redacción de `messages` con `created_at > 30 días` para `consents.scope = 'solo_uso'`. Pendiente de implementación.

---

## 7. Cómo regenerar el schema

```bash
# 1) Aplicar todas las migraciones desde cero
cd backend && source .venv/bin/activate
alembic upgrade head

# 2) Revertir la última migración
alembic downgrade -1

# 3) Crear una nueva migración con autogenerate
alembic revision --autogenerate -m "descripcion en castellano"

# 4) Inspeccionar el estado actual de la BD
alembic current
alembic history --verbose

# 5) Regenerar db/schema_postgresql.sql desde una BD limpia
docker compose up -d
cd backend && alembic upgrade head
pg_dump --schema-only --no-owner --no-privileges \
  -h localhost -p 5433 -U postgres mabel_dev \
  > db/schema_postgresql.sql.regen
```

**Política operativa** (memoria `dev-prod-status.md`): Mabel-IA está en pre-prod. Los cambios de schema pueden aplicarse vía force-update local; no es obligatorio crear migraciones Alembic formales hasta el deploy productivo. Las migraciones 006-012 son idempotentes precisamente porque reflejan force-updates aplicados primero al dev local y luego formalizados.

---

## 8. Drift detectado / pendientes

Inventariado al 2026-05-24:

| Punto | Estado | Acción sugerida |
|---|---|---|
| `db/schema_postgresql.sql` desactualizado | Drift confirmado (§5) | Regenerar via `pg_dump --schema-only` post `alembic upgrade head` |
| Notion "Esquema Definitivo de BD" desactualizado | Habla de 13 tablas y `admin_id` en audit_logs | Marcar como histórico — este documento lo reemplaza |
| `docs/DB_SCHEMA_EVOLUTION_002.md` | Histórico previo a Alembic | ✅ Eliminado en migración 2026-05-24 |
| `docs/DB_SCHEMA_EVOLUTION_004.md` | Histórico previo a Alembic | ✅ Eliminado en migración 2026-05-24 |
| `DB_SCHEMA_REVIEW.md` (raíz) | Revisión inicial PO 2026-02-18 | ✅ Eliminado en migración 2026-05-24 |
| `docs/REPORTE_VALIDACION_BD_INTERFACES.md` | Validación BD vs interfaces (1033 líneas) | ✅ Eliminado en migración 2026-05-24 |
| `users.deleted_at` sin uso operativo | Reservada (D-14 hace hard DELETE) | Mantener para post-MVP o eliminar con migración explícita |
| `Cron L2` (redacción >30d para `solo_uso`) | Pendiente | Implementar cuando se priorice retención automática |
| `tts_voice` y toggles de avatar | Placeholders | Habilitar cuando se cierre el modelo 2D animado con TTS |

---

## Apéndice A — Lista completa de migraciones Alembic

| Revision | Down revision | Archivo | Fecha |
|---|---|---|---|
| `08b6189ffc35` | (none) | `08b6189ffc35_initial_schema_13_tables.py` | 2026-03-07 |
| `3c6f5125803d` | `08b6189ffc35` | `3c6f5125803d_seed_consent_version_active.py` | 2026-03-07 |
| `a1b2c3d4e5f6` | `3c6f5125803d` | `a1b2c3d4e5f6_seed_system_config_operational_keys.py` | 2026-03-07 |
| `006_research_inst` | `a1b2c3d4e5f6` | `006_research_instrumentation.py` | 2026-05-20 |
| `007_timestamptz` | `006_research_inst` | `007_timestamptz_conversion.py` | 2026-05-22 |
| `008_audit_actor` | `007_timestamptz` | `008_audit_logs_actor.py` | 2026-05-22 |
| `009_greeting_empathy` | `008_audit_actor` | `009_greeting_unique_empathy_updated.py` | 2026-05-22 |
| `010_safety_kw_struct` | `009_greeting_empathy` | `010_safety_keywords_structured.py` | 2026-05-23 |
| `011_session_ratings` | `010_safety_kw_struct` | `011_session_ratings.py` | 2026-05-23 |
| `012_sessions_hidden` | `011_session_ratings` | `012_sessions_hidden.py` | 2026-05-23 |

---

## Apéndice B — Mapa de modelos SQLAlchemy ↔ tablas

| Modelo (Python) | Archivo | Tabla |
|---|---|---|
| `User` | `backend/app/models/user.py` | `users` |
| `PasswordResetToken` | `backend/app/models/password_reset_token.py` | `password_reset_tokens` |
| `ConsentVersion` | `backend/app/models/consent_version.py` | `consent_versions` |
| `Consent` | `backend/app/models/consent.py` | `consents` |
| `Preference` | `backend/app/models/preference.py` | `preferences` |
| `Session` | `backend/app/models/session.py` | `sessions` |
| `Message` | `backend/app/models/message.py` | `messages` |
| `MessageReport` | `backend/app/models/message_report.py` | `message_reports` |
| `Attachment` | `backend/app/models/attachment.py` | `attachments` |
| `SafetyEvent` | `backend/app/models/safety_event.py` | `safety_events` |
| `SurveyResponse` | `backend/app/models/survey_response.py` | `survey_responses` |
| `EmpathyRating` | `backend/app/models/empathy_rating.py` | `empathy_ratings` |
| `SessionRating` | `backend/app/models/session_rating.py` | `session_ratings` |
| `AuditLog` | `backend/app/models/audit_log.py` | `audit_logs` |
| `SystemConfig` | `backend/app/models/system_config.py` | `system_config` |

---

## Apéndice C — Mapa Repositorio ↔ Tabla + comportamientos no-evidentes

Los repositorios viven en `backend/app/repositories/`. Hay **14 archivos** para 15 tablas — `session_ratings` no tiene repo dedicado; su acceso se hace desde `session_repository.py`.

| Repositorio | Tabla principal | Notas / comportamientos no-evidentes |
|---|---|---|
| `user_repository.py` | `users` | `list_paginated` no filtra `disabled_at IS NULL` — el filter es responsabilidad del caller. |
| `password_reset_repository.py` | `password_reset_tokens` | `mark_used` setea `used_at`. Idempotente: no falla si ya está used. |
| `consent_version_repository.py` | `consent_versions` | `get_active()` filtra `is_active=true`. Solo una activa a la vez (UNIQUE parcial). |
| `consent_repository.py` | `consents` | `get_current(user_id)` devuelve el consentimiento más reciente (`MAX(accepted_at)`). |
| `preference_repository.py` | `preferences` | Si no existe, devuelve `None` (no crea defaults — `preference_service` se encarga). |
| `session_repository.py` | `sessions` (solo) | **⚠️ load-bearing**: `list_by_user` filtra `hidden_at IS NULL` por defecto. `history_service.py:227` (línea 226 es el comentario, 227-229 la query real) usa `select(SessionModel)` directo para listar incluyendo hidden, intencional. |
| (sin repo dedicado) | `session_ratings` | Acceso directo vía SQLAlchemy desde `backend/app/services/admin/metrics_service.py` (import del modelo `SessionRating` + queries inline). El servicio del chat usa el repo de mensajes; los ratings no tienen wrapper. |
| `message_repository.py` | `messages` | `list_by_session` ordena por `created_at ASC` para preservar orden conversacional. `count_for_window` cuenta para el sliding window (default 20). |
| `message_report_repository.py` | `message_reports` | `exists_for_message_user` para badge "Ya reportado" (idempotencia UI). |
| `attachment_repository.py` | `attachments` | `create_audio` setea `kind='audio'` automáticamente. |
| `safety_event_repository.py` | `safety_events` | `count_active_for_user` para badge sidebar. NO filtra por `user_id IS NULL` (los anónimos cuentan para métricas globales). |
| `survey_response_repository.py` | `survey_responses` | Import-only API; sin métodos UI-facing. |
| `empathy_rating_repository.py` | `empathy_ratings` | `list_queue` devuelve mensajes sin calificar; `list_rated` muestra todos los ratings (cross-rater). |
| `audit_log_repository.py` | `audit_logs` | `create` valida `actor_role` ∈ ALLOWED_ROLES en código (no confiar solo en CHECK). |
| `system_config_repository.py` | `system_config` | Cache en memoria con TTL — refresh al restart. `set_value` invalida el cache. |

### Servicios que bypassean el repo deliberadamente

- `history_service.py:227-229` — `select(SessionModel).where(SessionModel.id == session_id)` directo para INCLUIR sesiones soft-hidden (el repo `list_by_user` las filtra). Comentario en línea 226 documenta la decisión.
- `account_service.delete_account()` — delega en `user_repository.delete()` (no ejecuta SQL crudo). El repo hace `delete(User).where(User.id == user_id)` ORM-level DML; el CASCADE lo aplica Postgres. El snapshot del email se hace ANTES del delete porque `audit_logs.actor_id` queda NULL post-CASCADE (FK SET NULL).
- `chat_service` — usa `update(Message)` directo (`backend/app/services/chat_service.py:631-638`) para acumular tokens en el greeting de forma atómica, evitando race en concurrent assistant turns. El repo de mensajes no expone un `increment_tokens` atómico. El sliding window de contexto sí va por el repo (`self.message_repo.get_context_window(...)`), no por SQL directo.
