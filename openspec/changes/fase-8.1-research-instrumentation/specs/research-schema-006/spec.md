## ADDED Requirements

### Requirement: Migration 006 — research instrumentation

The backend SHALL provide Alembic migration `006_research_instrumentation` that performs these additive changes in one transaction:

1. `ALTER TABLE users ADD COLUMN cohort TEXT NULL`
2. `CREATE INDEX idx_users_cohort ON users (cohort) WHERE cohort IS NOT NULL`
3. `ALTER TABLE messages ADD COLUMN asr_latency_ms INT NULL, ADD COLUMN llm_latency_ms INT NULL, ADD COLUMN tts_latency_ms INT NULL`
4. `CREATE TABLE empathy_ratings`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE`
   - `rater_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
   - `score INT NOT NULL CHECK (score BETWEEN 1 AND 5)`
   - `criteria JSONB NULL`
   - `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
   - UNIQUE `(message_id, rater_id)`
   - Indexes: `idx_empathy_ratings_message (message_id)`, `idx_empathy_ratings_rater (rater_id)`
5. `INSERT INTO system_config (key, value, updated_at) VALUES ('study_lock_enabled', 'false'::jsonb, now()) ON CONFLICT (key) DO NOTHING`

Downgrade SHALL reverse each step in reverse order.

#### Scenario: Migration applies cleanly on existing DB

Given a database at Alembic revision `005c` (or current head)
When `alembic upgrade head` runs
Then the migration SHALL apply without errors
And `users.cohort`, `messages.asr_latency_ms`, `messages.llm_latency_ms`, `messages.tts_latency_ms`, table `empathy_ratings`, and key `study_lock_enabled` SHALL all exist

#### Scenario: Downgrade reverts cleanly

Given migration 006 is applied
When `alembic downgrade -1` runs
Then all 5 changes SHALL be reverted

### Requirement: SQLAlchemy models updated

The backend SHALL update SQLAlchemy ORM models:
- `User`: add `cohort: Mapped[str | None]`
- `Message`: add `asr_latency_ms`, `llm_latency_ms`, `tts_latency_ms` as `Mapped[int | None]`
- New file `app/models/empathy_rating.py` with class `EmpathyRating` matching the schema
- Update `app/models/__init__.py` to export `EmpathyRating`

#### Scenario: Models load

Given the migration is applied
When the FastAPI app imports models
Then `from app.models import EmpathyRating` SHALL succeed
And `User.cohort` SHALL be readable on a user instance

### Requirement: DDL source of truth updated

The file `db/schema_postgresql.sql` SHALL be updated to reflect:
- `users.cohort` column + index
- `messages` 3 new latency columns
- `empathy_ratings` table definition

#### Scenario: DDL drift check

Given the migration is applied to a fresh DB
When the resulting schema is dumped
Then it SHALL match `db/schema_postgresql.sql`
