-- =============================================================
-- Mabel IA -- Esquema de Base de Datos (MVP)
-- Motor: PostgreSQL 16 (UNICO motor -- desarrollo y produccion)
-- Generado por: Agente 03 -- Database Engineer
-- Fecha original: 2026-02-18
-- Actualizado: 2026-02-23
-- Tablas: 13 (102 columnas)
-- Fuente: DB_SCHEMA_REVIEW.md (Revision aprobada por Product Owner)
-- Evolucion 002: INTERFACES_MVP_CATALOGO.md (5 cambios, 3 tablas nuevas, 4 columnas nuevas)
-- Evolucion 003: Avatar 3D (HU-18) — +preferences.preferred_chat_mode, +sessions.avatar_used
-- Evolucion 004: Validacion BD vs Interfaces MVP — +consent_versions, +system_config,
--                +messages.latency_ms, +consents.revoked_at/consent_version_id, 5 indices nuevos
-- Evolucion 005: Auditoria post-Evo004 — -consents.version (redundante con consent_version_id),
--                consent_version_id pasa a NOT NULL (102 columnas total)
-- Evolucion 005b: safety_events.user_id cambia de NOT NULL CASCADE a nullable SET NULL
--                 (preserva eventos de seguridad como registros anonimos post-eliminacion de cuenta)
-- =============================================================
-- Historial de cambios:
--   2026-02-18  Esquema base: 8 tablas, 3 CHECK constraints (reason, severity, scope)
--   2026-02-20  Evolucion 002: +audit_logs, +password_reset_tokens, +survey_responses,
--               +users.role, +users.disabled_at/disabled_reason, +safety_events.status
--   2026-02-22  Evolucion 003: +preferences.preferred_chat_mode, +sessions.avatar_used
--   2026-02-23  Evolucion 004: +consent_versions, +system_config,
--               +messages.latency_ms, +consents.revoked_at/consent_version_id,
--               +5 indices (consent_versions_active, messages_latency,
--               consents_user_latest, attachments_message, message_reports_reporter)
--   2026-02-26  Evolucion 005b: safety_events.user_id → nullable + ON DELETE SET NULL
--               (H-35: hard DELETE en MVP, preservar eventos anonimos)
-- =============================================================

-- Requisitos: PostgreSQL 16
-- Habilita generacion de UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- 1) USUARIOS Y PRIVACIDAD
-- =========================

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  hashed_password  TEXT NOT NULL,
  display_name     TEXT,
  role             TEXT NOT NULL DEFAULT 'student'
                   CHECK (role IN ('student', 'admin')),
  disabled_at      TIMESTAMP,
  disabled_reason  TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at       TIMESTAMP,
  cohort           TEXT,  -- [Evolucion 006] marcador de cohorte del estudio (piloto-fase1, dev, control, etc.)

  -- Si disabled_at tiene valor, disabled_reason es obligatorio
  CONSTRAINT chk_users_disabled_reason
    CHECK (disabled_at IS NULL OR disabled_reason IS NOT NULL)
);

-- Versiones del documento de consentimiento informado (Ley 1581/2012)
-- Almacena el texto legal completo de cada version para auditoria
-- Debe definirse ANTES de consents porque consents.consent_version_id la referencia
CREATE TABLE consent_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'archived')),
  published_at  TIMESTAMP,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_consent_versions_active ON consent_versions(status)
                                         WHERE status = 'active';

CREATE TABLE consents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope               TEXT NOT NULL
                      CHECK (scope IN ('solo_uso','uso_mejora_anon')),
  accepted_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at          TIMESTAMP,
  consent_version_id  UUID NOT NULL REFERENCES consent_versions(id) ON DELETE RESTRICT,

  -- Un usuario solo puede tener un registro activo por version de consentimiento
  -- Re-aceptacion post-revocacion: UPDATE (SET revoked_at = NULL), no INSERT
  CONSTRAINT uq_consents_user_version
    UNIQUE (user_id, consent_version_id)
);

CREATE INDEX idx_consents_user_latest ON consents(user_id, accepted_at DESC);

CREATE TABLE preferences (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  save_history         BOOLEAN NOT NULL DEFAULT FALSE,
  ui_language          TEXT NOT NULL DEFAULT 'es',
  tts_voice            TEXT,
  accessibility        JSONB,
  checkin_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_chat_mode  TEXT NOT NULL DEFAULT 'chat'
                       CHECK (preferred_chat_mode IN ('chat', 'avatar'))
);

-- =========================
-- 2) SESIONES Y MENSAJES
-- =========================

CREATE TABLE sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at             TIMESTAMP,
  topic_hint           TEXT,
  meta                 JSONB,

  checkin_opt_in       BOOLEAN NOT NULL DEFAULT TRUE,
  checkin_payload      JSONB,
  checkin_completed_at TIMESTAMP,

  avatar_used          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_sessions_user_time ON sessions(user_id, started_at);

-- Evo 005b: Enforcement de sesion unica activa por usuario
CREATE UNIQUE INDEX uq_sessions_user_active ON sessions(user_id)
                                             WHERE ended_at IS NULL;

CREATE TABLE messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content            TEXT NOT NULL,
  content_sha256     TEXT,
  meta               JSONB,
  safety_flags       JSONB,
  tokens_prompt      INT,
  tokens_completion  INT,
  latency_ms         INT,
  asr_latency_ms     INT,  -- [Evolucion 006] latency split: ASR (Whisper)
  llm_latency_ms     INT,  -- [Evolucion 006] latency split: LLM (Gemini)
  tts_latency_ms     INT,  -- [Evolucion 006] latency split: TTS (Piper)
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_session_time ON messages(session_id, created_at);
CREATE INDEX idx_messages_latency      ON messages(latency_ms)
                                       WHERE role = 'assistant' AND latency_ms IS NOT NULL;
-- [Evolucion 006] indice parcial sobre cohort
CREATE INDEX idx_users_cohort          ON users(cohort) WHERE cohort IS NOT NULL;
-- (Opcional - habilitar post-MVP si volumen > 100K mensajes)
-- CREATE INDEX idx_messages_meta_gin   ON messages USING GIN (meta);
-- CREATE INDEX idx_messages_safety_gin ON messages USING GIN (safety_flags);

-- =========================
-- 3) REPORTES DE MENSAJES
-- =========================

CREATE TABLE message_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL
               CHECK (reason IN ('hallucination','harmful','privacy','low_empathy','other')),
  details      TEXT,
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','triaged','resolved','dismissed')),
  severity     INT
               CHECK (severity IS NULL OR (severity >= 1 AND severity <= 5)),
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP
);

CREATE UNIQUE INDEX uq_message_reports_msg_user ON message_reports(message_id, reporter_id);
CREATE INDEX idx_message_reports_status   ON message_reports(status);
CREATE INDEX idx_message_reports_msg_time ON message_reports(message_id, created_at);
CREATE INDEX idx_message_reports_reporter ON message_reports(reporter_id);

-- =========================
-- 4) ADJUNTOS Y EVENTOS
-- =========================

CREATE TABLE attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('audio','image','doc')),
  path        TEXT NOT NULL,
  meta        JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attachments_message ON attachments(message_id);

CREATE TABLE safety_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'reviewed', 'resolved')),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_safety_events_user_time ON safety_events(user_id, created_at);
CREATE INDEX idx_safety_events_type      ON safety_events(event_type);
CREATE INDEX idx_safety_events_status    ON safety_events(status);

-- =========================
-- 5) AUTENTICACION
-- =========================

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prt_user_created   ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX idx_prt_token_active   ON password_reset_tokens(token_hash)
                                    WHERE used_at IS NULL;

-- =========================
-- 6) AUDITORIA (INMUTABLE)
-- =========================

CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    UUID,
  detail       JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Los audit_logs son INMUTABLES: no se eliminan, no se actualizan.
-- ON DELETE SET NULL preserva el log si el admin es eliminado.

CREATE INDEX idx_audit_logs_admin_time  ON audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_time ON audit_logs(action, created_at DESC);

-- =========================
-- 7) INVESTIGACION
-- =========================

CREATE TABLE survey_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  instrument      TEXT NOT NULL
                  CHECK (instrument IN ('sus', 'empathy_rubric', 'wellbeing_pre', 'wellbeing_post')),
  phase           TEXT NOT NULL
                  CHECK (phase IN ('pre', 'post')),
  score           NUMERIC(5,2),
  raw_data        JSONB,
  administered_at TIMESTAMP NOT NULL,
  imported_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  imported_by     UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Un usuario solo puede tener una respuesta por instrumento y fase
  CONSTRAINT uq_survey_user_instrument_phase
    UNIQUE (user_id, instrument, phase)
);

CREATE INDEX idx_survey_instrument_phase ON survey_responses(instrument, phase);
CREATE INDEX idx_survey_user             ON survey_responses(user_id)
                                         WHERE user_id IS NOT NULL;

-- =========================
-- 8) CONFIGURACION DEL SISTEMA
-- =========================

-- Configuracion global de la aplicacion (parametros ajustables por admin)
-- Usa TEXT PK en lugar de UUID porque las claves son identificadores semanticos
-- conocidos en codigo (ej: 'consent_current_version', 'sos_hotline_numbers')
CREATE TABLE system_config (
  key          TEXT PRIMARY KEY,
  value        JSONB NOT NULL,
  description  TEXT,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 14) EMPATHY RATINGS [Evolucion 006]
-- =========================
-- Calificaciones de empatia por evaluador entrenado (rater) sobre mensajes
-- del asistente. Sustituye la fuente del criterio "empatia >= 4/5 en 80%".
-- Permite multiples raters por mensaje para inter-rater reliability.
CREATE TABLE empathy_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  rater_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  score       INT NOT NULL CHECK (score BETWEEN 1 AND 5),
  criteria    JSONB,  -- ej: {"empathic_tone":true,"validation":true,"hallucination":false}
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_empathy_ratings_message_rater UNIQUE (message_id, rater_id)
);

CREATE INDEX idx_empathy_ratings_message ON empathy_ratings(message_id);
CREATE INDEX idx_empathy_ratings_rater   ON empathy_ratings(rater_id);
