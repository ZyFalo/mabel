"""Force-update audit_logs schema to Evolucion 007.

Renames `admin_id` to `actor_id`, adds `actor_role` with CHECK constraint,
renames the actor index, and adds an index on `actor_role`. Idempotent: each
step is gated by an introspection check so re-runs are safe.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Ensure backend/ is importable.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from sqlalchemy import text  # noqa: E402

from app.core.database import async_session  # noqa: E402


async def _column_exists(conn, table: str, column: str) -> bool:
    result = await conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.first() is not None


async def _index_exists(conn, name: str) -> bool:
    result = await conn.execute(
        text("SELECT 1 FROM pg_indexes WHERE indexname = :n"),
        {"n": name},
    )
    return result.first() is not None


async def main() -> None:
    async with async_session() as session:
        async with session.begin():
            conn = await session.connection()

            # 1) rename admin_id -> actor_id (idempotent)
            has_actor = await _column_exists(conn, "audit_logs", "actor_id")
            has_admin = await _column_exists(conn, "audit_logs", "admin_id")
            if has_admin and not has_actor:
                await conn.execute(
                    text("ALTER TABLE audit_logs RENAME COLUMN admin_id TO actor_id")
                )
                print("renamed admin_id -> actor_id")
            elif has_actor:
                print("actor_id already present (skip rename)")
            else:
                raise RuntimeError("audit_logs has neither admin_id nor actor_id")

            # 2) add actor_role with CHECK + default (idempotent)
            has_role = await _column_exists(conn, "audit_logs", "actor_role")
            if not has_role:
                await conn.execute(
                    text(
                        "ALTER TABLE audit_logs ADD COLUMN actor_role TEXT NOT NULL "
                        "DEFAULT 'admin' "
                        "CHECK (actor_role IN ('admin', 'student', 'system'))"
                    )
                )
                print("added actor_role column with CHECK constraint")
            else:
                print("actor_role already present (skip add)")

            # 3) rename old actor-by-time index (idempotent)
            old_idx = await _index_exists(conn, "idx_audit_logs_admin_time")
            new_idx = await _index_exists(conn, "idx_audit_logs_actor_time")
            if old_idx and not new_idx:
                await conn.execute(
                    text(
                        "ALTER INDEX idx_audit_logs_admin_time "
                        "RENAME TO idx_audit_logs_actor_time"
                    )
                )
                print("renamed idx_audit_logs_admin_time -> idx_audit_logs_actor_time")
            elif new_idx:
                print("idx_audit_logs_actor_time already present (skip rename)")

            # 4) add role-by-time index (idempotent)
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_audit_logs_role_time "
                    "ON audit_logs(actor_role, created_at DESC)"
                )
            )
            print("ensured idx_audit_logs_role_time exists")

        # Verification (outside the txn) — print final layout.
        async with session.begin():
            conn = await session.connection()
            cols = await conn.execute(
                text(
                    "SELECT column_name, data_type, is_nullable, column_default "
                    "FROM information_schema.columns "
                    "WHERE table_name = 'audit_logs' ORDER BY ordinal_position"
                )
            )
            print("\nFinal audit_logs columns:")
            for row in cols:
                print(f"  - {row.column_name:12s} {row.data_type:25s} "
                      f"nullable={row.is_nullable} default={row.column_default}")

            idx = await conn.execute(
                text(
                    "SELECT indexname FROM pg_indexes "
                    "WHERE tablename = 'audit_logs' ORDER BY indexname"
                )
            )
            print("\naudit_logs indexes:")
            for row in idx:
                print(f"  - {row.indexname}")


if __name__ == "__main__":
    asyncio.run(main())
