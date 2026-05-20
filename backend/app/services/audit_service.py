import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.audit_log_repository import AuditLogRepository

# Allowed actions per spec admin-foundation Requirement: Audit log utility
# Extended in Fase 8.1 with `empathy_rate` (research-analytics).
ALLOWED_ACTIONS = frozenset(
    {
        "login",
        "view_user",
        "disable_user",
        "change_config",
        "review_report",
        "review_safety_event",
        "export_data",
        "empathy_rate",
    }
)


async def audit_log_action(
    db: AsyncSession,
    admin_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    details: dict | None = None,
    ip: str | None = None,
) -> None:
    """Append an audit log row inside the caller's transaction.

    Per D-12 (atomicity), this utility does NOT commit. The caller is
    responsible for the surrounding commit, so the log is rolled back
    together with any failed action.
    """
    repo = AuditLogRepository(db)
    await repo.create(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
        ip=ip,
    )
