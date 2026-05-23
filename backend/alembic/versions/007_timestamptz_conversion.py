"""[Evolucion 006] TIMESTAMP -> TIMESTAMPTZ across the whole schema.

Revision ID: 007_timestamptz
Revises: 006_research_inst
Create Date: 2026-05-22

Why this migration exists
-------------------------
The initial migration (`08b6189ffc35`) and the seed/research migrations
created every temporal column as `sa.DateTime()`, which Postgres maps to
`TIMESTAMP WITHOUT TIME ZONE`. The backend, however, populates timestamps
with `datetime.now(UTC)` (aware) and compares them against aware values
returned by asyncpg. With naive columns asyncpg raises
"can't subtract offset-aware and offset-naive datetimes" for any range
query that crosses Python <-> Postgres (eg. metrics aggregations).

This migration converts every timestamp column in the public schema to
`TIMESTAMP WITH TIME ZONE`, interpreting existing naive values as UTC
(which is what the application has been writing all along — the data is
consistent with that interpretation).

Idempotency
-----------
Pre-prod databases have been kept in sync via local force-update, so the
columns may already be TIMESTAMPTZ. We guard each ALTER with an
`information_schema.columns` lookup so reruns are no-ops.
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "007_timestamptz"
down_revision = "006_research_inst"
branch_labels = None
depends_on = None


# (table, column) pairs to convert. Mirrors the union of timestamp columns
# in `db/schema_postgresql.sql` after Evolucion 006 — sourced from
# `information_schema.columns` against a freshly-migrated DB.
TIMESTAMP_COLUMNS: list[tuple[str, str]] = [
    ("attachments", "created_at"),
    ("audit_logs", "created_at"),
    ("consent_versions", "created_at"),
    ("consent_versions", "published_at"),
    ("consents", "accepted_at"),
    ("consents", "revoked_at"),
    ("empathy_ratings", "created_at"),
    ("message_reports", "created_at"),
    ("message_reports", "updated_at"),
    ("messages", "created_at"),
    ("password_reset_tokens", "created_at"),
    ("password_reset_tokens", "expires_at"),
    ("password_reset_tokens", "used_at"),
    ("safety_events", "created_at"),
    ("sessions", "checkin_completed_at"),
    ("sessions", "ended_at"),
    ("sessions", "started_at"),
    ("survey_responses", "administered_at"),
    ("survey_responses", "imported_at"),
    ("system_config", "created_at"),
    ("system_config", "updated_at"),
    ("users", "created_at"),
    ("users", "deleted_at"),
    ("users", "disabled_at"),
]


def _alter(table: str, column: str, to_tz: bool) -> None:
    """Convert one column between TIMESTAMP and TIMESTAMPTZ idempotently.

    Reads `information_schema.columns` first and skips the ALTER if the
    column is already in the target shape — lets us re-run on databases
    that were force-updated locally. The inner ALTER is wrapped in a
    `$body$ ... $body$` dollar-quoted string (the outer block is already
    dollar-quoted with `$$`, so we need a distinct tag to avoid the
    parser closing the outer block on the inner `'UTC'`).
    """
    target_type = "timestamp with time zone" if to_tz else "timestamp without time zone"
    new_sql_type = "TIMESTAMPTZ" if to_tz else "TIMESTAMP"
    using_clause = (
        f"{column} AT TIME ZONE 'UTC'" if to_tz else f"({column} AT TIME ZONE 'UTC')"
    )
    op.execute(
        f"""
        DO $outer$
        DECLARE
            current_type text;
        BEGIN
            SELECT data_type INTO current_type
              FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name   = '{table}'
               AND column_name  = '{column}';

            IF current_type IS NULL THEN
                RAISE NOTICE 'Skipping {table}.{column}: column not found';
            ELSIF current_type = '{target_type}' THEN
                RAISE NOTICE 'Skipping {table}.{column}: already {target_type}';
            ELSE
                EXECUTE $body$ALTER TABLE {table} ALTER COLUMN {column} TYPE {new_sql_type} USING {using_clause}$body$;
            END IF;
        END $outer$;
        """
    )


def upgrade() -> None:
    for table, column in TIMESTAMP_COLUMNS:
        _alter(table, column, to_tz=True)


def downgrade() -> None:
    # Revert in reverse order. Naive timestamps lose the offset; we keep
    # UTC wall-clock by stripping the offset via AT TIME ZONE 'UTC'.
    for table, column in reversed(TIMESTAMP_COLUMNS):
        _alter(table, column, to_tz=False)
