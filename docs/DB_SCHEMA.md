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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `email` | TEXT | NO | — | UNIQUE; correo institucional UMB |
| `hashed_password` | TEXT | NO | — | bcrypt hash (cost 12) |
| `display_name` | TEXT | SÍ | — | Nombre visible (opcional) |
| `role` | TEXT | NO | `'student'` | `student` \| `admin` |
| `disabled_at` | TIMESTAMPTZ | SÍ | — | Bloqueo admin (login responde 403) |
| `disabled_reason` | TEXT | SÍ | — | Obligatoria si `disabled_at` no es NULL |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |
| `deleted_at` | TIMESTAMPTZ | SÍ | — | Reservada para post-MVP (hoy se hace hard DELETE) |
| `cohort` | TEXT | SÍ | — | Marcador del estudio (Evo 006): `piloto-fase1`, `dev`, `control`, etc. |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `user_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE |
| `token_hash` | TEXT | NO | — | SHA-256 del token enviado al usuario; UNIQUE |
| `expires_at` | TIMESTAMPTZ | NO | — | Caducidad típica: 60 min |
| `used_at` | TIMESTAMPTZ | SÍ | — | Marca el consumo (idempotencia) |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `version` | TEXT | NO | — | UNIQUE (ej. `1.0`) |
| `title` | TEXT | NO | — | Título visible al usuario |
| `body` | TEXT | NO | — | Texto legal completo |
| `status` | TEXT | NO | `'draft'` | `draft` \| `active` \| `archived` |
| `published_at` | TIMESTAMPTZ | SÍ | — | Fecha de publicación |
| `created_by` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `user_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE |
| `scope` | TEXT | NO | — | `solo_uso` \| `uso_mejora_anon` |
| `accepted_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |
| `revoked_at` | TIMESTAMPTZ | SÍ | — | NULL = activo; revocación temporal sin perder historial |
| `consent_version_id` | UUID | NO | — | FK `consent_versions.id` ON DELETE RESTRICT |

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
| `user_id` | UUID | NO | — | PK + FK `users.id` ON DELETE CASCADE |
| `save_history` | BOOLEAN | NO | `false` | Toggle de retención de historial (D-04) |
| `ui_language` | TEXT | NO | `'es'` | Idioma de UI (solo `es` en MVP) |
| `tts_voice` | TEXT | SÍ | — | ID de voz Piper (placeholder hasta TTS final) |
| `accessibility` | JSONB | SÍ | — | Toggles de accesibilidad (subtítulos, etc.) |
| `checkin_enabled` | BOOLEAN | NO | `true` | Permitir check-in pre-sesión |
| `preferred_chat_mode` | TEXT | NO | `'chat'` | `chat` \| `avatar` (Avatar 2D/3D, Evo 003) |

**CHECK**
- `chk_preferences_chat_mode`: `preferred_chat_mode IN ('chat','avatar')`

**Evolución**: creada en initial con `preferred_chat_mode` (Evo 003). TIMESTAMPTZ no aplica — sin columnas temporales.

---

### 2.4 Conversación

#### `sessions`

Hilo de conversación del usuario. UNIQUE parcial garantiza una sesión activa por usuario (`ended_at IS NULL`). Evo 012 introdujo soft-hide controlado por el usuario.

| Columna | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `user_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE |
| `started_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |
| `ended_at` | TIMESTAMPTZ | SÍ | — | NULL = activa |
| `topic_hint` | TEXT | SÍ | — | Sugerencia inicial de tema |
| `meta` | JSONB | SÍ | — | Metadatos libres |
| `checkin_opt_in` | BOOLEAN | NO | `true` | El usuario aceptó el check-in pre-sesión |
| `checkin_payload` | JSONB | SÍ | — | Respuestas del check-in |
| `checkin_completed_at` | TIMESTAMPTZ | SÍ | — | |
| `avatar_used` | BOOLEAN | NO | `false` | Esta sesión usó modo avatar (Evo 003) |
| `hidden_at` | TIMESTAMPTZ | SÍ | — | NULL = visible. NOT NULL = oculta del sidebar del usuario (Evo 012) |
| `hidden_reason` | TEXT | SÍ | — | Origen del hide (audit trail) |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `session_id` | UUID | NO | — | FK `sessions.id` ON DELETE CASCADE |
| `role` | TEXT | NO | — | `system` \| `user` \| `assistant` |
| `content` | TEXT | NO | — | Texto del mensaje |
| `content_sha256` | TEXT | SÍ | — | Hash opcional para deduplicación |
| `meta` | JSONB | SÍ | — | Metadatos libres (incluye `greeting=true` para mensajes de saludo) |
| `safety_flags` | JSONB | SÍ | — | Resultado del pipeline de guardrails |
| `tokens_prompt` | INT | SÍ | — | Tokens consumidos por el prompt |
| `tokens_completion` | INT | SÍ | — | Tokens generados |
| `latency_ms` | INT | SÍ | — | Latencia end-to-end (assistant) |
| `asr_latency_ms` | INT | SÍ | — | Latencia ASR (Whisper) — Evo 006 |
| `llm_latency_ms` | INT | SÍ | — | Latencia LLM (Gemini/OpenAI-compat) — Evo 006 |
| `tts_latency_ms` | INT | SÍ | — | Latencia TTS (Piper) — Evo 006 |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `message_id` | UUID | NO | — | FK `messages.id` ON DELETE CASCADE |
| `reporter_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE |
| `reason` | TEXT | NO | — | `hallucination` \| `harmful` \| `privacy` \| `low_empathy` \| `other` |
| `details` | TEXT | SÍ | — | Texto libre del reporte |
| `status` | TEXT | NO | `'open'` | `open` \| `triaged` \| `resolved` \| `dismissed` |
| `severity` | INT | SÍ | — | 1-5 (asignada al triage) |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |
| `updated_at` | TIMESTAMPTZ | SÍ | — | Set por el admin al cambiar status |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `message_id` | UUID | NO | — | FK `messages.id` ON DELETE CASCADE |
| `kind` | TEXT | NO | — | `audio` \| `image` \| `doc` |
| `path` | TEXT | NO | — | Ruta relativa en `UPLOAD_DIR` |
| `meta` | JSONB | SÍ | — | Metadatos (duración, tamaño, MIME, etc.) |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `user_id` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL |
| `session_id` | UUID | SÍ | — | FK `sessions.id` ON DELETE SET NULL |
| `event_type` | TEXT | NO | — | Texto libre (`guardrail_trigger`, `sos_manual`, etc.) — sin CHECK |
| `payload` | JSONB | SÍ | — | Detalle del evento (keywords matched, severidad, etc.) |
| `status` | TEXT | NO | `'active'` | `active` \| `reviewed` \| `resolved` |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `user_id` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL (preserva agregados post-eliminación) |
| `instrument` | TEXT | NO | — | `sus` \| `empathy_rubric` \| `wellbeing_pre` \| `wellbeing_post` |
| `phase` | TEXT | NO | — | `pre` \| `post` |
| `score` | NUMERIC(5,2) | SÍ | — | Puntaje agregado |
| `raw_data` | JSONB | SÍ | — | Respuestas crudas |
| `administered_at` | TIMESTAMPTZ | NO | — | Cuándo se aplicó al participante |
| `imported_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | Cuándo se cargó al sistema |
| `imported_by` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `message_id` | UUID | NO | — | FK `messages.id` ON DELETE CASCADE |
| `rater_id` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL |
| `score` | INT | NO | — | 1-5 |
| `criteria` | JSONB | SÍ | — | `{"empathic_tone":true,"validation":true,"hallucination":false}` |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |
| `updated_at` | TIMESTAMPTZ | SÍ | — | Set por `PATCH /admin/empathy-ratings/{id}` cuando el rater edita (Evo 009) |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `session_id` | UUID | NO | — | FK `sessions.id` ON DELETE CASCADE |
| `user_id` | UUID | NO | — | FK `users.id` ON DELETE CASCADE |
| `rating` | INT | NO | — | 1-5 |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Refleja la última edición |

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
| `id` | UUID | NO | `gen_random_uuid()` | PK |
| `actor_id` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL (renombrada desde `admin_id` en Evo 008) |
| `actor_role` | TEXT | NO | — | `admin` \| `student` \| `system` (Evo 008; sin server_default — backfill de filas históricas fue `'admin'` y luego se removió el DEFAULT) |
| `action` | TEXT | NO | — | Identificador semántico de la acción (sin CHECK por extensibilidad) |
| `target_type` | TEXT | SÍ | — | Tipo de entidad apuntada (polimórfico) |
| `target_id` | UUID | SÍ | — | UUID del target (sin FK por polimorfismo) |
| `detail` | JSONB | SÍ | — | Payload arbitrario de la acción |
| `ip_address` | TEXT | SÍ | — | Soporta IPv4/IPv6 |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |

**CHECK**
- `audit_logs_actor_role_check` (alias `chk_audit_logs_actor_role` en la migración): `actor_role IN ('admin','student','system')`

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
| `key` | TEXT | NO | — | PK (ej. `safety_keywords`) |
| `value` | JSONB | NO | — | Valor estructurado o escalar |
| `description` | TEXT | SÍ | — | Documentación inline |
| `updated_by` | UUID | SÍ | — | FK `users.id` ON DELETE SET NULL |
| `updated_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |
| `created_at` | TIMESTAMPTZ | NO | `CURRENT_TIMESTAMP` | |

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
