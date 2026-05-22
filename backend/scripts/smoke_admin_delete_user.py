"""E2E smoke test for individual DELETE /api/v1/admin/users/{user_id}.

Exercises every guardrail surface of AdminUsersService.delete_user:

- 404 (USER_NOT_FOUND) on a missing uuid
- 403 (CANNOT_DELETE_ADMIN) on an admin account
- 409 (USER_NOT_DISABLED) on an active student
- 200 + hard-delete + audit row on a disabled student

Cleans its fixtures and is safe to re-run.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select

from app.core.database import async_session
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.admin.users_service import AdminUsersService, mask_email


async def main() -> int:
    suffix = uuid.uuid4().hex[:8]
    async with async_session() as session:
        admin = User(
            email=f"smoke2-admin-{suffix}@example.com",
            hashed_password="x" * 60,
            display_name="Smoke2 Admin",
            role="admin",
        )
        disabled = User(
            email=f"smoke2-disabled-{suffix}@example.com",
            hashed_password="x" * 60,
            display_name="Smoke2 Disabled",
            role="student",
            disabled_at=datetime.now(UTC),
            disabled_reason="smoke fixture - individual delete",
        )
        active = User(
            email=f"smoke2-active-{suffix}@example.com",
            hashed_password="x" * 60,
            display_name="Smoke2 Active",
            role="student",
        )
        session.add_all([admin, disabled, active])
        await session.commit()
        for u in (admin, disabled, active):
            await session.refresh(u)

        service = AdminUsersService(session)
        disabled_email_masked = mask_email(disabled.email)

        # 1) USER_NOT_FOUND
        try:
            await service.delete_user(uuid.uuid4(), admin_id=admin.id, ip="127.0.0.1")
        except ValueError as e:
            assert str(e) == "USER_NOT_FOUND", str(e)
            print("[OK] USER_NOT_FOUND")
        else:
            raise AssertionError("expected USER_NOT_FOUND")

        # 2) CANNOT_DELETE_ADMIN
        try:
            await service.delete_user(admin.id, admin_id=admin.id, ip="127.0.0.1")
        except ValueError as e:
            assert str(e) == "CANNOT_DELETE_ADMIN", str(e)
            print("[OK] CANNOT_DELETE_ADMIN")
        else:
            raise AssertionError("expected CANNOT_DELETE_ADMIN")

        # 3) USER_NOT_DISABLED
        try:
            await service.delete_user(active.id, admin_id=admin.id, ip="127.0.0.1")
        except ValueError as e:
            assert str(e) == "USER_NOT_DISABLED", str(e)
            print("[OK] USER_NOT_DISABLED")
        else:
            raise AssertionError("expected USER_NOT_DISABLED")

        # 4) Happy path
        await service.delete_user(disabled.id, admin_id=admin.id, ip="127.0.0.1")

        gone = await session.execute(select(User).where(User.id == disabled.id))
        assert gone.scalar_one_or_none() is None, "disabled user not deleted"

        rows = await session.execute(
            select(AuditLog)
            .where(AuditLog.action == "delete_user")
            .where(AuditLog.target_id == disabled.id)
        )
        audit_rows = list(rows.scalars().all())
        assert len(audit_rows) == 1
        row = audit_rows[0]
        assert row.actor_id == admin.id
        assert row.actor_role == "admin"
        assert row.detail["email_masked"] == disabled_email_masked
        assert row.detail.get("bulk") is None  # not a bulk call
        print("[OK] delete happy path + audit row")

        # Cleanup
        await session.execute(delete(User).where(User.id.in_([active.id, admin.id])))
        await session.commit()
        print("[OK] smoke_admin_delete_user passed")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
