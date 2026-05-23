import uuid
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.audit_log_repository import AuditLogRepository

# Allowed actions across all actor roles.
# Validation of (actor_role + action) coherence is intentionally NOT enforced
# at the application layer: the CHECK constraint on `audit_logs.actor_role`
# in PostgreSQL is the single source of truth for legal role values, and the
# action vocabulary is shared so cross-role evolutions (e.g. a future
# 'system' cronjob that runs 'export_data') don't require code changes here.
#
# Evolucion 007: extended from admin-only to include student-originated
# actions (register, login, account delete, consent grant/revoke, password
# reset flow) and a reserved 'system' bucket for non-user-driven actions
# (failed login attempts, future cronjobs).
ALLOWED_ACTIONS = frozenset(
    {
        # --- admin ---
        "login",
        "view_user",
        "disable_user",
        "enable_user",
        "delete_user",
        "update_cohort",
        "change_config",
        "review_report",
        "review_safety_event",
        "export_data",
        "empathy_rate",
        "empathy_rate_updated",
        "update_system_config",
        # --- student ---
        "user_register",
        "user_login",
        "user_login_failed",
        "user_delete",
        "consent_granted",
        "consent_revoked",
        "password_reset_requested",
        "password_reset_completed",
        # --- system ---
        # (reserved for future cronjobs / non-user-driven events)
    }
)


async def audit_log_action(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    actor_role: Literal["admin", "student", "system"],
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

    Kwargs-only signature (after the `*`) forces every caller to be
    explicit about `actor_role`, which makes the audit feed honest about
    whether an action was driven by an admin, a student, or the system.
    There is intentionally NO default for `actor_role`: the previous
    `= "admin"` silently mislabeled new student/system call sites that
    forgot the kwarg (matched by the corresponding DROP DEFAULT in
    migration 008 and the missing `server_default` on the model).
    """
    repo = AuditLogRepository(db)
    await repo.create(
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
        ip=ip,
    )
