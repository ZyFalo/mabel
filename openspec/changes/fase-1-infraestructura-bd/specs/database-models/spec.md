## ADDED Requirements

### Requirement: SQLAlchemy base configuration
The project SHALL use SQLAlchemy 2.0+ with async mode and a declarative base class. All tables use UUID PKs via pgcrypto `gen_random_uuid()` except `system_config` which uses TEXT PK, and `preferences` which uses `user_id` UUID as PK (1:1 with users).

#### Scenario: Base model with UUID
- **WHEN** any model inherits from the base class
- **THEN** it SHALL have an `id` column of type UUID with server_default `gen_random_uuid()` from pgcrypto
- **THEN** exceptions: `system_config` (TEXT PK `key`), `preferences` (UUID PK `user_id` referencing `users.id`)

### Requirement: Users model (9 columns)
The `users` model SHALL represent the `users` table with exactly 9 columns.

Columns: `id` (UUID PK), `email` (TEXT NOT NULL UNIQUE), `hashed_password` (TEXT NOT NULL), `display_name` (TEXT nullable), `role` (TEXT NOT NULL DEFAULT 'student'), `disabled_at` (TIMESTAMP nullable), `disabled_reason` (TEXT nullable), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP), `deleted_at` (TIMESTAMP nullable).

#### Scenario: Role constraint
- **WHEN** a user record is created
- **THEN** `role` SHALL accept only `'student'` or `'admin'` via CHECK constraint
- **THEN** the default SHALL be `'student'`

#### Scenario: Email uniqueness
- **WHEN** a user with an existing email tries to register
- **THEN** the UNIQUE constraint on `email` SHALL prevent the duplicate

#### Scenario: Disable constraint (chk_users_disabled_reason)
- **WHEN** `disabled_at` is set (not NULL)
- **THEN** `disabled_reason` MUST also be not NULL
- **THEN** CHECK: `disabled_at IS NULL OR disabled_reason IS NOT NULL`

### Requirement: Consent versions model (8 columns)
The `consent_versions` model SHALL represent the `consent_versions` table with exactly 8 columns.

Columns: `id` (UUID PK), `version` (TEXT NOT NULL UNIQUE), `title` (TEXT NOT NULL), `body` (TEXT NOT NULL), `status` (TEXT NOT NULL DEFAULT 'draft'), `published_at` (TIMESTAMP nullable), `created_by` (UUID nullable FK → users.id ON DELETE SET NULL), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: Status lifecycle
- **WHEN** a consent version is created
- **THEN** `status` SHALL accept only `'draft'`, `'active'`, or `'archived'` via CHECK

#### Scenario: Version uniqueness
- **WHEN** a new consent version with an existing version string is created
- **THEN** the UNIQUE constraint on `version` SHALL prevent the duplicate

#### Scenario: Created by FK
- **WHEN** the admin user who created a consent version is deleted
- **THEN** `created_by` SHALL be set to NULL (ON DELETE SET NULL)

### Requirement: Consents model (6 columns)
The `consents` model SHALL represent the `consents` table with exactly 6 columns.

Columns: `id` (UUID PK), `user_id` (UUID NOT NULL FK → users.id ON DELETE CASCADE), `scope` (TEXT NOT NULL), `accepted_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP), `revoked_at` (TIMESTAMP nullable), `consent_version_id` (UUID NOT NULL FK → consent_versions.id ON DELETE RESTRICT).

#### Scenario: Scope constraint
- **WHEN** a consent record is created
- **THEN** `scope` SHALL accept only `'solo_uso'` or `'uso_mejora_anon'`

#### Scenario: User-version uniqueness (uq_consents_user_version)
- **WHEN** a user attempts to create a duplicate consent for the same consent_version
- **THEN** the UNIQUE constraint on `(user_id, consent_version_id)` SHALL prevent it

#### Scenario: Consent version FK is RESTRICT
- **WHEN** an attempt is made to delete a consent_version that is referenced by consents
- **THEN** the deletion SHALL be RESTRICTED (blocked)

### Requirement: Preferences model (7 columns, user_id as PK)
The `preferences` model SHALL represent the `preferences` table with exactly 7 columns. This is a 1:1 table — `user_id` IS the primary key (no separate `id` column).

Columns: `user_id` (UUID PRIMARY KEY FK → users.id ON DELETE CASCADE), `save_history` (BOOLEAN NOT NULL DEFAULT FALSE), `ui_language` (TEXT NOT NULL DEFAULT 'es'), `tts_voice` (TEXT nullable), `accessibility` (JSONB nullable), `checkin_enabled` (BOOLEAN NOT NULL DEFAULT TRUE), `preferred_chat_mode` (TEXT NOT NULL DEFAULT 'chat').

#### Scenario: Chat mode constraint
- **WHEN** `preferred_chat_mode` is set
- **THEN** it SHALL accept only `'chat'` or `'avatar'`

#### Scenario: One preference per user
- **WHEN** a user is created and preferences are set
- **THEN** `user_id` as PK ensures exactly one preferences row per user
- **THEN** deleting the user cascades to delete their preferences

### Requirement: Sessions model (10 columns)
The `sessions` model SHALL represent the `sessions` table with exactly 10 columns.

Columns: `id` (UUID PK), `user_id` (UUID NOT NULL FK → users.id ON DELETE CASCADE), `started_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP), `ended_at` (TIMESTAMP nullable), `topic_hint` (TEXT nullable), `meta` (JSONB nullable), `checkin_opt_in` (BOOLEAN NOT NULL DEFAULT TRUE), `checkin_payload` (JSONB nullable), `checkin_completed_at` (TIMESTAMP nullable), `avatar_used` (BOOLEAN NOT NULL DEFAULT FALSE).

#### Scenario: User cascade
- **WHEN** a user is deleted
- **THEN** all their sessions SHALL be deleted via ON DELETE CASCADE

#### Scenario: Active session uniqueness (uq_sessions_user_active)
- **WHEN** a user tries to create a new session while another is still active (ended_at IS NULL)
- **THEN** the UNIQUE partial index `uq_sessions_user_active` on `(user_id) WHERE ended_at IS NULL` SHALL prevent it

### Requirement: Messages model (11 columns)
The `messages` model SHALL represent the `messages` table with exactly 11 columns.

Columns: `id` (UUID PK), `session_id` (UUID NOT NULL FK → sessions.id ON DELETE CASCADE), `role` (TEXT NOT NULL), `content` (TEXT NOT NULL), `content_sha256` (TEXT nullable), `meta` (JSONB nullable), `safety_flags` (JSONB nullable), `tokens_prompt` (INT nullable), `tokens_completion` (INT nullable), `latency_ms` (INT nullable), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: Role constraint
- **WHEN** a message is created
- **THEN** `role` SHALL accept only `'system'`, `'user'`, or `'assistant'`

#### Scenario: Session cascade
- **WHEN** a session is deleted
- **THEN** all its messages SHALL be deleted via ON DELETE CASCADE

### Requirement: Message reports model (9 columns)
The `message_reports` model SHALL represent the `message_reports` table with exactly 9 columns.

Columns: `id` (UUID PK), `message_id` (UUID NOT NULL FK → messages.id ON DELETE CASCADE), `reporter_id` (UUID NOT NULL FK → users.id ON DELETE CASCADE), `reason` (TEXT NOT NULL), `details` (TEXT nullable), `status` (TEXT NOT NULL DEFAULT 'open'), `severity` (INT nullable), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP), `updated_at` (TIMESTAMP nullable).

#### Scenario: Reason constraint
- **WHEN** a report is created
- **THEN** `reason` SHALL accept only `'hallucination'`, `'harmful'`, `'privacy'`, `'low_empathy'`, or `'other'`

#### Scenario: Status constraint
- **WHEN** a report status is set
- **THEN** `status` SHALL accept only `'open'`, `'triaged'`, `'resolved'`, or `'dismissed'`

#### Scenario: Severity constraint
- **WHEN** severity is provided
- **THEN** it SHALL be between 1 and 5 inclusive, or NULL
- **THEN** CHECK: `severity IS NULL OR (severity >= 1 AND severity <= 5)`

#### Scenario: Unique per message-reporter (uq_message_reports_msg_user)
- **WHEN** the same reporter tries to report the same message twice
- **THEN** the UNIQUE INDEX on `(message_id, reporter_id)` SHALL prevent the duplicate

### Requirement: Attachments model (6 columns)
The `attachments` model SHALL represent the `attachments` table with exactly 6 columns.

Columns: `id` (UUID PK), `message_id` (UUID NOT NULL FK → messages.id ON DELETE CASCADE), `kind` (TEXT NOT NULL), `path` (TEXT NOT NULL), `meta` (JSONB nullable), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: Kind constraint
- **WHEN** an attachment is created
- **THEN** `kind` SHALL accept only `'audio'`, `'image'`, or `'doc'`

### Requirement: Safety events model (7 columns)
The `safety_events` model SHALL represent the `safety_events` table with exactly 7 columns.

Columns: `id` (UUID PK), `user_id` (UUID **nullable** FK → users.id ON DELETE SET NULL), `session_id` (UUID nullable FK → sessions.id ON DELETE SET NULL), `event_type` (TEXT NOT NULL — no CHECK constraint), `payload` (JSONB nullable), `status` (TEXT NOT NULL DEFAULT 'active'), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: User SET NULL on delete (D-14, Evo 005c)
- **WHEN** a user is deleted
- **THEN** `safety_events.user_id` SHALL be set to NULL (not deleted), preserving anonymous event records

#### Scenario: Session SET NULL on delete
- **WHEN** a session is deleted
- **THEN** `safety_events.session_id` SHALL be set to NULL

#### Scenario: Status constraint
- **WHEN** a safety event is created
- **THEN** `status` SHALL accept only `'active'`, `'reviewed'`, or `'resolved'`

#### Scenario: event_type has NO CHECK
- **WHEN** a safety event is created
- **THEN** `event_type` is free-text (TEXT NOT NULL) with no CHECK constraint in the DDL

### Requirement: Password reset tokens model (6 columns)
The `password_reset_tokens` model SHALL represent the `password_reset_tokens` table with exactly 6 columns.

Columns: `id` (UUID PK), `user_id` (UUID NOT NULL FK → users.id ON DELETE CASCADE), `token_hash` (TEXT NOT NULL UNIQUE), `expires_at` (TIMESTAMP NOT NULL), `used_at` (TIMESTAMP nullable), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: Token hash uniqueness
- **WHEN** a duplicate token_hash is inserted
- **THEN** the UNIQUE constraint on `token_hash` SHALL prevent it

#### Scenario: Partial index on active tokens (idx_prt_token_active)
- **WHEN** looking up an active (unused) token
- **THEN** the partial index on `(token_hash) WHERE used_at IS NULL` SHALL optimize the query

### Requirement: Audit logs model (8 columns)
The `audit_logs` model SHALL represent the `audit_logs` table with exactly 8 columns. This table is IMMUTABLE (append-only).

Columns: `id` (UUID PK), `admin_id` (UUID nullable FK → users.id ON DELETE SET NULL), `action` (TEXT NOT NULL), `target_type` (TEXT nullable), `target_id` (UUID nullable), `detail` (JSONB nullable), `ip_address` (TEXT nullable), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: Admin SET NULL on delete
- **WHEN** an admin user is deleted
- **THEN** `audit_logs.admin_id` SHALL be set to NULL, preserving the log record

### Requirement: Survey responses model (9 columns)
The `survey_responses` model SHALL represent the `survey_responses` table with exactly 9 columns.

Columns: `id` (UUID PK), `user_id` (UUID nullable FK → users.id ON DELETE SET NULL), `instrument` (TEXT NOT NULL), `phase` (TEXT NOT NULL), `score` (NUMERIC(5,2) nullable), `raw_data` (JSONB nullable), `administered_at` (TIMESTAMP NOT NULL), `imported_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP), `imported_by` (UUID nullable FK → users.id ON DELETE SET NULL).

#### Scenario: Instrument constraint
- **WHEN** a survey response is created
- **THEN** `instrument` SHALL accept only `'sus'`, `'empathy_rubric'`, `'wellbeing_pre'`, or `'wellbeing_post'`

#### Scenario: Phase constraint
- **WHEN** a survey response is created
- **THEN** `phase` SHALL accept only `'pre'` or `'post'`

#### Scenario: Unique per user-instrument-phase (uq_survey_user_instrument_phase)
- **WHEN** a user tries to submit duplicate survey for same instrument and phase
- **THEN** the UNIQUE constraint on `(user_id, instrument, phase)` SHALL prevent it

#### Scenario: User SET NULL on delete
- **WHEN** a user is deleted
- **THEN** `survey_responses.user_id` SHALL be set to NULL, preserving anonymous research data

#### Scenario: Imported by SET NULL on delete
- **WHEN** the admin who imported a survey response is deleted
- **THEN** `survey_responses.imported_by` SHALL be set to NULL

### Requirement: System config model (6 columns)
The `system_config` model SHALL represent the `system_config` table with exactly 6 columns. Uses TEXT primary key (not UUID).

Columns: `key` (TEXT PRIMARY KEY), `value` (JSONB NOT NULL), `description` (TEXT nullable), `updated_by` (UUID nullable FK → users.id ON DELETE SET NULL), `updated_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP), `created_at` (TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP).

#### Scenario: TEXT primary key
- **WHEN** a system config record is created
- **THEN** the `key` column SHALL be the primary key (TEXT type, not UUID)

#### Scenario: Updated by SET NULL on delete
- **WHEN** the admin who last updated a config value is deleted
- **THEN** `system_config.updated_by` SHALL be set to NULL

### Requirement: All 20 explicit indices from DDL
The models SHALL define all 20 explicit indices (excluding PK indices).

#### Scenario: All named indices exist after migration
- **WHEN** the migration is applied
- **THEN** the following 20 indices SHALL exist:
  1. `idx_consent_versions_active` ON consent_versions(status) WHERE status = 'active'
  2. `idx_consents_user_latest` ON consents(user_id, accepted_at DESC)
  3. `uq_sessions_user_active` ON sessions(user_id) WHERE ended_at IS NULL (UNIQUE, Evo 005b)
  4. `idx_sessions_user_time` ON sessions(user_id, started_at)
  5. `idx_messages_session_time` ON messages(session_id, created_at)
  6. `idx_messages_latency` ON messages(latency_ms) WHERE role = 'assistant' AND latency_ms IS NOT NULL
  7. `uq_message_reports_msg_user` ON message_reports(message_id, reporter_id) (UNIQUE)
  8. `idx_message_reports_status` ON message_reports(status)
  9. `idx_message_reports_msg_time` ON message_reports(message_id, created_at)
  10. `idx_message_reports_reporter` ON message_reports(reporter_id)
  11. `idx_attachments_message` ON attachments(message_id)
  12. `idx_safety_events_user_time` ON safety_events(user_id, created_at)
  13. `idx_safety_events_type` ON safety_events(event_type)
  14. `idx_safety_events_status` ON safety_events(status)
  15. `idx_prt_user_created` ON password_reset_tokens(user_id, created_at DESC)
  16. `idx_prt_token_active` ON password_reset_tokens(token_hash) WHERE used_at IS NULL
  17. `idx_audit_logs_admin_time` ON audit_logs(admin_id, created_at DESC)
  18. `idx_audit_logs_action_time` ON audit_logs(action, created_at DESC)
  19. `idx_survey_instrument_phase` ON survey_responses(instrument, phase)
  20. `idx_survey_user` ON survey_responses(user_id) WHERE user_id IS NOT NULL

### Requirement: All 7 UNIQUE constraints
The models SHALL define all 7 UNIQUE constraints.

#### Scenario: UNIQUE constraints exist
- **WHEN** the migration is applied
- **THEN** the following 7 UNIQUE constraints SHALL exist:
  1. `users.email` (inline UNIQUE)
  2. `consent_versions.version` (inline UNIQUE)
  3. `uq_consents_user_version` ON consents(user_id, consent_version_id)
  4. `password_reset_tokens.token_hash` (inline UNIQUE)
  5. `uq_message_reports_msg_user` ON message_reports(message_id, reporter_id)
  6. `uq_survey_user_instrument_phase` ON survey_responses(user_id, instrument, phase)
  7. `uq_sessions_user_active` ON sessions(user_id) WHERE ended_at IS NULL (partial, Evo 005b)
