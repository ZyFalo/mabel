"""[Evolucion 007] audit_logs: admin_id -> actor_id + actor_role.

Revision ID: 008_audit_actor
Revises: 007_timestamptz
Create Date: 2026-05-22

Audit log was admin-only originally. Once we started recording student-
side actions (register, login, login_failed, delete, consent grant/revoke,
password reset request/complete), the `admin_id` column was a misnomer —
it would have to be NULL for any student-originated row and would
deceptively suggest "only admins are recorded". This migration:

1. Renames `admin_id` -> `actor_id` (same UUID FK, ON DELETE SET NULL).
2. Adds `actor_role` TEXT NOT NULL DEFAULT 'admin' with CHECK constraint
   restricting it to {admin, student, system}. Default 'admin' preserves
   semantics for the existing rows (which were all admin-originated).
3. Replaces `idx_audit_logs_admin_time` with `idx_audit_logs_actor_time`
   (rename), and adds `idx_audit_logs_role_time` for the new "filter by
   role" UI in the Logs admin panel.

Idempotency: same pattern as 007 — guards on `information_schema` so this
runs cleanly on pre-prod databases already at the target shape.
"""

from __future__ import annotations

from alembic import op

revision = "008_audit_actor"
down_revision = "007_timestamptz"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Rename admin_id -> actor_id (only if the old name still exists).
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'audit_logs'
                   AND column_name = 'admin_id'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'audit_logs'
                   AND column_name = 'actor_id'
            ) THEN
                ALTER TABLE audit_logs RENAME COLUMN admin_id TO actor_id;
            END IF;
        END $$;
        """
    )

    # 1b. Rename the auto-generated FK constraint so its name reflects the
    #     new column. Postgres does NOT auto-rename constraints on RENAME
    #     COLUMN, so without this step we end up with the column `actor_id`
    #     pointing at a constraint still named `audit_logs_admin_id_fkey`.
    #     That divergence (a) breaks any future migration that references
    #     `audit_logs_actor_id_fkey` by name, and (b) makes
    #     `alembic revision --autogenerate` emit a noisy drop+recreate to
    #     normalize the name. Idempotent via `pg_constraint` lookup.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                 WHERE conname = 'audit_logs_admin_id_fkey'
                   AND conrelid = 'audit_logs'::regclass
            ) AND NOT EXISTS (
                SELECT 1 FROM pg_constraint
                 WHERE conname = 'audit_logs_actor_id_fkey'
                   AND conrelid = 'audit_logs'::regclass
            ) THEN
                ALTER TABLE audit_logs
                  RENAME CONSTRAINT audit_logs_admin_id_fkey
                                 TO audit_logs_actor_id_fkey;
            END IF;
        END $$;
        """
    )

    # 2. Add actor_role column. The temporary DEFAULT 'admin' is used as a
    #    backfill mechanism (existing rows were all admin-originated; that's
    #    the correct historic label). We DROP the default right after so
    #    future INSERTs that forget to set actor_role fail loudly with a
    #    NOT NULL violation instead of silently mislabeling student/system
    #    rows as admin.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'audit_logs'
                   AND column_name = 'actor_role'
            ) THEN
                ALTER TABLE audit_logs
                  ADD COLUMN actor_role TEXT NOT NULL DEFAULT 'admin';
            END IF;
        END $$;
        """
    )

    # 2b. Drop the backfill DEFAULT after the column exists (idempotent on
    #     databases that were force-updated locally and never had a default).
    op.execute("ALTER TABLE audit_logs ALTER COLUMN actor_role DROP DEFAULT")

    # 3. Add CHECK constraint (skip if already present).
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                 WHERE conname = 'chk_audit_logs_actor_role'
            ) THEN
                ALTER TABLE audit_logs
                  ADD CONSTRAINT chk_audit_logs_actor_role
                  CHECK (actor_role IN ('admin', 'student', 'system'));
            END IF;
        END $$;
        """
    )

    # 4. Drop the legacy admin_time index, create actor_time + role_time.
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_admin_time")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time "
        "ON audit_logs(actor_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_role_time "
        "ON audit_logs(actor_role, created_at DESC)"
    )


def downgrade() -> None:
    # Drop new indices, drop CHECK + actor_role column, rename actor_id back.
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_role_time")
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_actor_time")
    op.execute(
        "ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS chk_audit_logs_actor_role"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'audit_logs'
                   AND column_name = 'actor_role'
            ) THEN
                ALTER TABLE audit_logs DROP COLUMN actor_role;
            END IF;
        END $$;
        """
    )
    # Rename the FK constraint back BEFORE the column rename so we end up
    # with the legacy `audit_logs_admin_id_fkey` paired with `admin_id`,
    # matching the pre-007 shape.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                 WHERE conname = 'audit_logs_actor_id_fkey'
                   AND conrelid = 'audit_logs'::regclass
            ) AND NOT EXISTS (
                SELECT 1 FROM pg_constraint
                 WHERE conname = 'audit_logs_admin_id_fkey'
                   AND conrelid = 'audit_logs'::regclass
            ) THEN
                ALTER TABLE audit_logs
                  RENAME CONSTRAINT audit_logs_actor_id_fkey
                                 TO audit_logs_admin_id_fkey;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'audit_logs'
                   AND column_name = 'actor_id'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'audit_logs'
                   AND column_name = 'admin_id'
            ) THEN
                ALTER TABLE audit_logs RENAME COLUMN actor_id TO admin_id;
            END IF;
        END $$;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_time "
        "ON audit_logs(admin_id, created_at DESC)"
    )
