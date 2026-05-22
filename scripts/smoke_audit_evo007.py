"""Smoke test for Evolucion 007: register a fresh user via the FastAPI ASGI
transport (async) and check that an audit_logs row with
(action='user_register', actor_role='student') was inserted.
Also probes a failed login (system bucket) and tallies actor_role counts.
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

import httpx  # noqa: E402
from httpx import ASGITransport  # noqa: E402
from sqlalchemy import select, text  # noqa: E402

from app.core.database import async_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402


async def cleanup_email(email: str) -> None:
    async with async_session() as session:
        async with session.begin():
            await session.execute(
                text("DELETE FROM users WHERE email = :e"), {"e": email}
            )


async def get_audit_rows_for_user(user_id: uuid.UUID) -> list[AuditLog]:
    async with async_session() as session:
        result = await session.execute(
            select(AuditLog).where(AuditLog.actor_id == user_id).order_by(AuditLog.created_at)
        )
        return list(result.scalars().all())


async def role_breakdown() -> list[tuple[str, int]]:
    async with async_session() as session:
        result = await session.execute(
            text(
                "SELECT actor_role, COUNT(*) AS n FROM audit_logs "
                "GROUP BY actor_role ORDER BY actor_role"
            )
        )
        return [(row.actor_role, row.n) for row in result]


async def main() -> None:
    unique = uuid.uuid4().hex[:8]
    email = f"smoke-evo007-{unique}@est.umb.edu.co"
    password = "ClaveSegura123!"

    print("\n=== Smoke test Evolucion 007 ===")
    print(f"Email: {email}")

    await cleanup_email(email)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": password,
                "display_name": "Smoke Test User",
            },
        )
        print(f"POST /auth/register -> {resp.status_code}")
        assert resp.status_code == 201, resp.text
        user_payload = resp.json()
        user_id = uuid.UUID(user_payload["id"])
        print(f"New user id: {user_id}")

    rows = await get_audit_rows_for_user(user_id)
    print(f"\nAudit rows for this user: {len(rows)}")
    for r in rows:
        print(
            f"  - action={r.action!r:24s} actor_role={r.actor_role!r:10s} "
            f"target_type={r.target_type!r} target_id={r.target_id} "
            f"created_at={r.created_at}"
        )

    matching = [r for r in rows if r.action == "user_register" and r.actor_role == "student"]
    assert matching, "expected at least one audit row with action='user_register' actor_role='student'"
    print(f"OK: found {len(matching)} 'user_register' row(s).")

    print("\nNow probing a failed login to exercise the 'system' bucket...")
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WRONG-on-purpose", "remember_me": False},
        )
        print(f"POST /auth/login (wrong pw) -> {resp.status_code}")
        assert resp.status_code == 401

    print("\nactor_role breakdown across audit_logs:")
    for role, n in await role_breakdown():
        print(f"  - {role:10s} {n}")

    # Cleanup: drop the test user. ON DELETE SET NULL preserves the audit
    # row with actor_id=NULL.
    await cleanup_email(email)
    print(f"\nCleanup: removed user {email}; audit rows retained with actor_id=NULL.")


if __name__ == "__main__":
    asyncio.run(main())
