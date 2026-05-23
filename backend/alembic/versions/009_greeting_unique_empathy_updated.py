"""[Evolucion 008] greeting UNIQUE INDEX + empathy_ratings.updated_at.

Revision ID: 009_greeting_empathy
Revises: 008_audit_actor
Create Date: 2026-05-22

Two related Fase 8.1 fixes bundled into one revision because both come
from the same admin-panel pass:

1. Partial UNIQUE INDEX `uq_messages_session_greeting` on
   `messages(session_id) WHERE role='assistant' AND meta->>'greeting'`.
   React StrictMode double-invokes `useEffect`, so the client fires
   `/sessions/:id/greeting` twice; the Python `if existing: return None`
   guard is not atomic, both requests stream the LLM, and the second one
   would otherwise INSERT a duplicate greeting. The partial index makes
   the second INSERT raise `IntegrityError`, which `ChatService` handles
   by rolling back AND attributing the consumed tokens to the survivor.

2. `empathy_ratings.updated_at TIMESTAMPTZ NULL` — populated by
   `PATCH /admin/empathy-ratings/{id}` so the UI can render
   "Calificado el X (editado el Y)". NULL means the rating was never
   edited (the original `created_at` is the sole source of truth).

Pre-flight clean-up: before creating the partial UNIQUE INDEX we de-dup
any pre-existing greeting duplicates (4 sessions detected on local
pre-prod). We preserve the EARLIEST row per session and delete the rest;
`messages.id` cascades through `attachments` / `safety_events` correctly.
"""

from __future__ import annotations

from alembic import op

revision = "009_greeting_empathy"
down_revision = "008_audit_actor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. empathy_ratings.updated_at (nullable; NULL == never edited).
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'empathy_ratings'
                   AND column_name = 'updated_at'
            ) THEN
                ALTER TABLE empathy_ratings
                  ADD COLUMN updated_at TIMESTAMPTZ NULL;
            END IF;
        END $$;
        """
    )

    # 2. Drop duplicate greetings (keep earliest per session) so the
    #    UNIQUE INDEX can be created. Safe to re-run — if no dupes exist,
    #    the DELETE is a no-op.
    #
    #    Both the DELETE preflight and the partial UNIQUE INDEX use
    #    *text equality* (`meta->>'greeting' = 'true'`) rather than a
    #    `(meta->>'greeting')::boolean = true` cast: `meta` is free-form
    #    JSONB, so any future row that puts a non-boolean string under
    #    `greeting` (manual fixture, ops SQL, future migration) would
    #    make the cast raise `invalid input syntax for type boolean`
    #    and break every subsequent assistant INSERT. Text equality
    #    matches what `MessageRepository.find_greeting` queries and
    #    what `chat_service.generate_greeting` writes (Python `True` ->
    #    JSONB boolean -> text `'true'`), and never raises on rogue
    #    payloads — they just don't satisfy the predicate.
    op.execute(
        """
        DELETE FROM messages
         WHERE id IN (
            SELECT id FROM (
              SELECT id,
                     ROW_NUMBER() OVER (
                       PARTITION BY session_id
                       ORDER BY created_at ASC, id ASC
                     ) AS rn
                FROM messages
               WHERE role = 'assistant'
                 AND meta->>'greeting' = 'true'
            ) ranked
           WHERE ranked.rn > 1
         );
        """
    )

    # 3. Partial UNIQUE INDEX (idempotent via IF NOT EXISTS). Text
    #    equality predicate matches the repo's `find_greeting` SELECT so
    #    the planner can use this index as a single-row probe.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_session_greeting
            ON messages(session_id)
         WHERE role = 'assistant'
           AND meta->>'greeting' = 'true';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_messages_session_greeting")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'empathy_ratings'
                   AND column_name = 'updated_at'
            ) THEN
                ALTER TABLE empathy_ratings DROP COLUMN updated_at;
            END IF;
        END $$;
        """
    )
