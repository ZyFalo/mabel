## ADDED Requirements

### Requirement: Alembic configuration
Alembic SHALL be configured within the `backend/` directory with async support and connection to PostgreSQL via the `DATABASE_URL` environment variable.

#### Scenario: Alembic initialization
- **WHEN** Alembic is initialized
- **THEN** `backend/alembic.ini` and `backend/alembic/` directory SHALL exist
- **THEN** `env.py` SHALL import all SQLAlchemy models and use async engine

#### Scenario: Environment variable for database URL
- **WHEN** Alembic runs a migration
- **THEN** it SHALL read `DATABASE_URL` from the `.env` file or environment
- **THEN** the URL format SHALL be `postgresql+asyncpg://user:password@host:port/database` (e.g., `postgresql+asyncpg://williampena:0416@localhost:5432/mabel_ia`)

### Requirement: Initial migration creates complete schema
The first migration SHALL create all 13 tables with all constraints, indices, and extensions.

#### Scenario: pgcrypto extension
- **WHEN** the initial migration runs
- **THEN** it SHALL execute `CREATE EXTENSION IF NOT EXISTS pgcrypto` before creating tables

#### Scenario: All 13 tables created
- **WHEN** the initial migration is applied
- **THEN** the following tables SHALL exist: `users`, `consent_versions`, `consents`, `preferences`, `sessions`, `messages`, `message_reports`, `attachments`, `safety_events`, `password_reset_tokens`, `audit_logs`, `survey_responses`, `system_config`

#### Scenario: 13 CHECK constraints applied
- **WHEN** the migration completes
- **THEN** all 13 CHECK constraints from the DDL SHALL be active:
  1. `users.role` IN ('student', 'admin')
  2. `users.chk_users_disabled_reason` (disabled_at IS NULL OR disabled_reason IS NOT NULL)
  3. `consent_versions.status` IN ('draft', 'active', 'archived')
  4. `consents.scope` IN ('solo_uso', 'uso_mejora_anon')
  5. `preferences.preferred_chat_mode` IN ('chat', 'avatar')
  6. `messages.role` IN ('system', 'user', 'assistant')
  7. `message_reports.reason` IN ('hallucination', 'harmful', 'privacy', 'low_empathy', 'other')
  8. `message_reports.status` IN ('open', 'triaged', 'resolved', 'dismissed')
  9. `message_reports.severity` IS NULL OR (severity >= 1 AND severity <= 5)
  10. `attachments.kind` IN ('audio', 'image', 'doc')
  11. `safety_events.status` IN ('active', 'reviewed', 'resolved')
  12. `survey_responses.instrument` IN ('sus', 'empathy_rubric', 'wellbeing_pre', 'wellbeing_post')
  13. `survey_responses.phase` IN ('pre', 'post')

#### Scenario: 16 Foreign keys with correct ON DELETE behavior
- **WHEN** the migration completes
- **THEN** CASCADE FKs (8) SHALL exist for: `consents.user_id`, `preferences.user_id` (PK+FK), `sessions.user_id`, `messages.session_id`, `message_reports.message_id`, `message_reports.reporter_id`, `attachments.message_id`, `password_reset_tokens.user_id`
- **THEN** SET NULL FKs (7) SHALL exist for: `consent_versions.created_by`, `safety_events.user_id`, `safety_events.session_id`, `audit_logs.admin_id`, `survey_responses.user_id`, `survey_responses.imported_by`, `system_config.updated_by`
- **THEN** RESTRICT FK (1) SHALL exist for: `consents.consent_version_id`

#### Scenario: 20 explicit indices created
- **WHEN** the migration completes
- **THEN** all 20 explicit indices SHALL exist (see database-models spec for full list)
- **THEN** 4 partial indices SHALL have correct WHERE clauses: `idx_consent_versions_active`, `idx_messages_latency`, `idx_prt_token_active`, `idx_survey_user`
- **THEN** 1 partial UNIQUE index SHALL exist: `uq_sessions_user_active` WHERE ended_at IS NULL

#### Scenario: 7 UNIQUE constraints created
- **WHEN** the migration completes
- **THEN** all 7 UNIQUE constraints SHALL exist (see database-models spec for full list)

#### Scenario: Migration is reversible
- **WHEN** the migration is downgraded
- **THEN** all 13 tables SHALL be dropped in correct dependency order
- **THEN** the pgcrypto extension SHALL remain (not dropped, as other projects may use it)

### Requirement: Database creation script
A helper script SHALL exist to create the `mabel_ia` database if it doesn't exist.

#### Scenario: First-time setup
- **WHEN** a developer runs the setup script
- **THEN** the `mabel_ia` database SHALL be created in the local PostgreSQL instance
- **THEN** the pgcrypto extension SHALL be enabled in the new database
