"""E2E smoke test for the new admin user lifecycle endpoints.

Creates fixtures (disabled student, active student, admin), invokes the
bulk-action `delete` flow through the service layer (same code path the
HTTP endpoint hits), then asserts:

- the disabled student is hard-deleted
- the active student lands in `skipped_must_disable_first`
- the admin lands in `skipped_admin`
- `audit_logs` gains exactly one `delete_user` row for the deleted student
  with `actor_role='admin'` and the masked email captured in `details`
- the overall audit_logs row count grew by 1 (only the delete bookkeeping)

The script cleans up its fixtures afterwards so it is safe to re-run.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select

from app.core.database import async_session
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.admin.users_service import AdminUsersService, mask_email


async def _count_audit(session) -> int:
    r = await session.execute(select(func.count(AuditLog.id)))
    return int(r.scalar_one())


async def main() -> int:
    fixtures: list[uuid.UUID] = []
    suffix = uuid.uuid4().hex[:8]
    async with async_session() as session:
        # Fixtures ------------------------------------------------------------
        admin = User(
            email=f"smoke-admin-{suffix}@example.com",
            hashed_password="x" * 60,
            display_name="Smoke Admin",
            role="admin",
        )
        disabled_student = User(
            email=f"smoke-disabled-{suffix}@example.com",
            hashed_password="x" * 60,
            display_name="Smoke Disabled",
            role="student",
            disabled_at=datetime.now(UTC),
            disabled_reason="smoke fixture - disabled for delete test",
        )
        active_student = User(
            email=f"smoke-active-{suffix}@example.com",
            hashed_password="x" * 60,
            display_name="Smoke Active",
            role="student",
        )
        session.add_all([admin, disabled_student, active_student])
        await session.commit()
        for u in (admin, disabled_student, active_student):
            await session.refresh(u)
            fixtures.append(u.id)

        admin_id = admin.id
        disabled_id = disabled_student.id
        active_id = active_student.id
        disabled_email_masked = mask_email(disabled_student.email)

        before_count = await _count_audit(session)
        print(f"audit_logs count BEFORE: {before_count}")

        # Action --------------------------------------------------------------
        service = AdminUsersService(session)
        result = await service.bulk_action(
            user_ids=[disabled_id, active_id, admin_id],
            action="delete",
            reason=None,
            admin_id=admin_id,
            ip="127.0.0.1",
        )

        print("bulk_action result:", result)

        # Assertions ----------------------------------------------------------
        assert result["applied"] == 1, f"expected applied=1, got {result['applied']}"
        assert admin_id in result["skipped_admin"], "admin not skipped"
        assert active_id in result["skipped_must_disable_first"], (
            "active student should be in skipped_must_disable_first"
        )
        assert disabled_id not in result["skipped_must_disable_first"]
        assert not result["not_found"], result["not_found"]

        # Disabled student is gone
        gone = await session.execute(select(User).where(User.id == disabled_id))
        assert gone.scalar_one_or_none() is None, "disabled user not deleted"

        # Active student still there
        still = await session.execute(select(User).where(User.id == active_id))
        assert still.scalar_one_or_none() is not None, "active user disappeared"

        # Audit log row check
        audit = await session.execute(
            select(AuditLog)
            .where(AuditLog.action == "delete_user")
            .where(AuditLog.target_id == disabled_id)
            .order_by(AuditLog.created_at.desc())
        )
        rows = list(audit.scalars().all())
        assert len(rows) == 1, f"expected 1 delete_user audit row, got {len(rows)}"
        row = rows[0]
        assert row.actor_id == admin_id
        assert row.actor_role == "admin"
        assert row.detail is not None
        assert row.detail.get("email_masked") == disabled_email_masked, (
            f"email_masked mismatch: {row.detail.get('email_masked')} != {disabled_email_masked}"
        )
        assert row.detail.get("bulk") is True
        assert row.detail.get("disabled_reason") == (
            "smoke fixture - disabled for delete test"
        )
        assert row.ip_address == "127.0.0.1"

        after_count = await _count_audit(session)
        print(f"audit_logs count AFTER:  {after_count}")
        print(f"audit_logs delta:        {after_count - before_count} (expected 1)")
        assert after_count - before_count == 1, (
            f"expected exactly 1 new audit row, got {after_count - before_count}"
        )

        # Cleanup -------------------------------------------------------------
        await session.execute(
            delete(User).where(User.id.in_([active_id, admin_id]))
        )
        await session.commit()
        print("[OK] smoke_admin_bulk_action passed")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
