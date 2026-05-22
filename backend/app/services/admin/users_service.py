"""Admin Users service — Capability 2 (admin-users).

Implements list/detail/disable user operations for the admin panel.

Privacy/audit rules:
- Emails are masked to `f"{first_char}***@{domain}"` (D-04)
- `messages.content` is NEVER serialized in admin responses (D-03)
- `view_user` and `disable_user` actions write an `audit_logs` row inside
  the same transaction as the action (D-12).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from typing import Sequence

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consent import Consent
from app.models.consent_version import ConsentVersion
from app.models.message import Message
from app.models.message_report import MessageReport
from app.models.preference import Preference
from app.models.safety_event import SafetyEvent
from app.models.session import Session as SessionModel
from app.models.user import User
from app.schemas.admin import UserAdminDetail, UserAdminListItem
from app.services.audit_service import audit_log_action


def mask_email(email: str | None) -> str:
    """Mask an email to `{first_char}***@{domain}` (D-04)."""
    if not email or "@" not in email:
        return "***@***"
    local, _, domain = email.partition("@")
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


class AdminUsersService:
    """Service for admin operations on the `users` table.

    Notes on consent_status computation:
      For each user we derive one of {ok, no_consent, revoked, new_version_required}
      using the same semantics as `ConsentService.get_consent_status`.
      The list endpoint currently performs per-user lookups; this is acceptable
      for the pilot (30 users) but should be optimized via a DISTINCT ON join.
      TODO(perf): replace per-user consent lookup with a single
      `DISTINCT ON (user_id) ... ORDER BY user_id, accepted_at DESC` query.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ----- internal helpers -------------------------------------------------

    async def _get_active_version(self) -> ConsentVersion | None:
        result = await self.db.execute(
            select(ConsentVersion).where(ConsentVersion.status == "active")
        )
        return result.scalar_one_or_none()

    async def _get_latest_consent(self, user_id: uuid.UUID) -> Consent | None:
        result = await self.db.execute(
            select(Consent)
            .where(Consent.user_id == user_id)
            .order_by(Consent.accepted_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    def _derive_consent_status(
        self,
        latest: Consent | None,
        active_version_id: uuid.UUID | None,
    ) -> str:
        if active_version_id is None:
            return "no_consent"
        if latest is None:
            return "no_consent"
        if latest.revoked_at is not None:
            return "revoked"
        if latest.consent_version_id != active_version_id:
            return "new_version_required"
        return "ok"

    async def _get_session_stats(
        self, user_id: uuid.UUID
    ) -> tuple[int, datetime | None]:
        result = await self.db.execute(
            select(
                func.count(SessionModel.id),
                func.max(SessionModel.started_at),
            ).where(SessionModel.user_id == user_id)
        )
        row = result.one()
        return int(row[0] or 0), row[1]

    # ----- list -------------------------------------------------------------

    async def list_users(
        self,
        q: str | None = None,
        status: str | None = None,  # "active" | "disabled"
        consent_status: str | None = None,  # "ok"|"no_consent"|"revoked"|"new_version_required"
        created_from: date | None = None,
        created_to: date | None = None,
        cohort: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[UserAdminListItem], int]:
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        active_version = await self._get_active_version()
        active_version_id = active_version.id if active_version else None

        # Base filters that can be expressed in SQL.
        conditions = []
        if q:
            like = f"%{q.lower()}%"
            conditions.append(
                or_(
                    func.lower(User.email).like(like),
                    func.lower(func.coalesce(User.display_name, "")).like(like),
                )
            )
        if status == "active":
            conditions.append(User.disabled_at.is_(None))
        elif status == "disabled":
            conditions.append(User.disabled_at.is_not(None))
        if created_from is not None:
            conditions.append(
                User.created_at >= datetime.combine(created_from, time.min, tzinfo=timezone.utc)
            )
        if created_to is not None:
            conditions.append(
                User.created_at <= datetime.combine(created_to, time.max, tzinfo=timezone.utc)
            )
        if cohort is not None:
            conditions.append(User.cohort == cohort)

        where_clause = and_(*conditions) if conditions else None

        # NOTE: consent_status filter is applied in Python after deriving status
        # per-user. For the pilot dataset (30 users) this is fine. With a larger
        # dataset we should push this filter to SQL via a DISTINCT ON join.
        if consent_status is None:
            # Fast path: SQL-side pagination + count.
            count_stmt = select(func.count()).select_from(User)
            list_stmt = select(User)
            if where_clause is not None:
                count_stmt = count_stmt.where(where_clause)
                list_stmt = list_stmt.where(where_clause)
            list_stmt = (
                list_stmt.order_by(User.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            total = int((await self.db.execute(count_stmt)).scalar_one())
            users_result = await self.db.execute(list_stmt)
            users: Sequence[User] = users_result.scalars().all()
        else:
            # Slow path: fetch all matching users, derive status, then paginate
            # in Python. Acceptable for pilot scale.
            list_stmt = select(User)
            if where_clause is not None:
                list_stmt = list_stmt.where(where_clause)
            list_stmt = list_stmt.order_by(User.created_at.desc())
            users_result = await self.db.execute(list_stmt)
            all_users = list(users_result.scalars().all())

            filtered: list[User] = []
            for u in all_users:
                latest = await self._get_latest_consent(u.id)
                if (
                    self._derive_consent_status(latest, active_version_id)
                    == consent_status
                ):
                    filtered.append(u)

            total = len(filtered)
            start = (page - 1) * page_size
            end = start + page_size
            users = filtered[start:end]

        items: list[UserAdminListItem] = []
        for u in users:
            latest = await self._get_latest_consent(u.id)
            cs = self._derive_consent_status(latest, active_version_id)
            total_sessions, last_session_at = await self._get_session_stats(u.id)
            items.append(
                UserAdminListItem(
                    id=u.id,
                    email_masked=mask_email(u.email),
                    display_name=u.display_name or "",
                    role=u.role,
                    created_at=u.created_at,
                    last_session_at=last_session_at,
                    consent_status=cs,
                    total_sessions=total_sessions,
                    disabled_at=u.disabled_at,
                    cohort=u.cohort,
                )
            )

        return items, total

    # ----- detail -----------------------------------------------------------

    async def get_user_detail(
        self,
        user_id: uuid.UUID,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> UserAdminDetail | None:
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is None:
            return None

        # Consent
        active_version = await self._get_active_version()
        active_version_id = active_version.id if active_version else None
        latest_consent = await self._get_latest_consent(user.id)
        cs = self._derive_consent_status(latest_consent, active_version_id)

        consent_version_label: str | None = None
        if latest_consent is not None:
            version_result = await self.db.execute(
                select(ConsentVersion).where(
                    ConsentVersion.id == latest_consent.consent_version_id
                )
            )
            version = version_result.scalar_one_or_none()
            if version is not None:
                consent_version_label = version.version

        # Preferences
        pref_result = await self.db.execute(
            select(Preference).where(Preference.user_id == user.id)
        )
        pref = pref_result.scalar_one_or_none()

        save_history: bool | None = None
        tts_enabled: bool | None = None
        voice: str | None = None
        if pref is not None:
            save_history = pref.save_history
            voice = pref.tts_voice
            tts_enabled = pref.tts_voice is not None

        # Statistics
        total_sessions, last_session_at = await self._get_session_stats(user.id)

        # Total messages across user's sessions.
        msg_count_result = await self.db.execute(
            select(func.count(Message.id))
            .select_from(Message)
            .join(SessionModel, Message.session_id == SessionModel.id)
            .where(SessionModel.user_id == user.id)
        )
        total_messages = int(msg_count_result.scalar_one() or 0)

        # Reports filed by this user.
        reports_count_result = await self.db.execute(
            select(func.count(MessageReport.id)).where(
                MessageReport.reporter_id == user.id
            )
        )
        total_reports_filed = int(reports_count_result.scalar_one() or 0)

        # Safety events linked to this user.
        safety_count_result = await self.db.execute(
            select(func.count(SafetyEvent.id)).where(SafetyEvent.user_id == user.id)
        )
        total_safety_events = int(safety_count_result.scalar_one() or 0)

        detail = UserAdminDetail(
            id=user.id,
            email_masked=mask_email(user.email),
            display_name=user.display_name or "",
            role=user.role,
            created_at=user.created_at,
            disabled_at=user.disabled_at,
            disabled_reason=user.disabled_reason,
            cohort=user.cohort,
            consent_status=cs,
            consent_version=consent_version_label,
            consent_accepted_at=latest_consent.accepted_at if latest_consent else None,
            consent_revoked_at=latest_consent.revoked_at if latest_consent else None,
            save_history=save_history,
            tts_enabled=tts_enabled,
            asr_enabled=None,  # not tracked yet in preferences
            voice=voice,
            notifications_email=None,  # not tracked yet in preferences
            total_sessions=total_sessions,
            total_messages=total_messages,
            last_session_at=last_session_at,
            total_reports_filed=total_reports_filed,
            total_safety_events=total_safety_events,
        )

        # Audit log + commit so the access is recorded atomically (D-12).
        await audit_log_action(
            self.db,
            actor_id=admin_id,
            actor_role="admin",
            action="view_user",
            target_type="user",
            target_id=user.id,
            details=None,
            ip=ip,
        )
        await self.db.commit()

        return detail

    # ----- disable ----------------------------------------------------------

    async def disable_user(
        self,
        user_id: uuid.UUID,
        reason: str,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise ValueError("USER_NOT_FOUND")
        if user.role == "admin":
            raise ValueError("CANNOT_DISABLE_ADMIN")
        if user.disabled_at is not None:
            raise ValueError("ALREADY_DISABLED")

        user.disabled_at = datetime.now(timezone.utc)
        user.disabled_reason = reason

        # Audit log INSIDE the same transaction (D-12).
        await audit_log_action(
            self.db,
            actor_id=admin_id,
            actor_role="admin",
            action="disable_user",
            target_type="user",
            target_id=user.id,
            details={"reason": reason},
            ip=ip,
        )

        await self.db.commit()
        await self.db.refresh(user)
        return user

    # ----- enable -----------------------------------------------------------

    async def enable_user(
        self,
        user_id: uuid.UUID,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> User:
        """Re-enable a previously disabled user.

        Reverse of `disable_user`. Clears `disabled_at` and `disabled_reason`
        so the CHECK constraint `chk_users_disabled_reason` (which requires
        a reason whenever disabled_at is set) stays satisfied. Writes its
        own audit_log row so the timeline of disable/enable cycles is
        preserved.
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise ValueError("USER_NOT_FOUND")
        if user.disabled_at is None:
            raise ValueError("ALREADY_ENABLED")

        previous_reason = user.disabled_reason
        user.disabled_at = None
        user.disabled_reason = None

        await audit_log_action(
            self.db,
            actor_id=admin_id,
            actor_role="admin",
            action="enable_user",
            target_type="user",
            target_id=user.id,
            details={"previous_reason": previous_reason},
            ip=ip,
        )

        await self.db.commit()
        await self.db.refresh(user)
        return user

    # ----- delete -----------------------------------------------------------

    async def delete_user(
        self,
        user_id: uuid.UUID,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> None:
        """Hard-delete a previously disabled user.

        Guardrails:
        - 404 if the user does not exist.
        - 403 (`CANNOT_DELETE_ADMIN`) for admin accounts.
        - 409 (`USER_NOT_DISABLED`) if `disabled_at IS NULL` — deletion is
          gated on a prior disable so the operator never skips the
          deshabilitar/eliminar two-step flow used by the admin UI.

        The audit log is written BEFORE the DELETE so the row survives even
        if the DELETE fails (the surrounding commit is atomic). The FK
        `audit_logs.actor_id` is ON DELETE SET NULL (admin survives anyway),
        and `audit_logs.target_id` is a plain UUID column with no FK so it
        keeps the deleted user's id forever (Evo 005b pattern).
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise ValueError("USER_NOT_FOUND")
        if user.role == "admin":
            raise ValueError("CANNOT_DELETE_ADMIN")
        if user.disabled_at is None:
            raise ValueError("USER_NOT_DISABLED")

        # Snapshot identity BEFORE the row disappears.
        email_masked = mask_email(user.email)
        was_disabled_at = user.disabled_at
        disabled_reason = user.disabled_reason

        # Audit FIRST so the log row is guaranteed even if delete blows up
        # mid-transaction (the commit is atomic — rollback nukes both).
        await audit_log_action(
            self.db,
            actor_id=admin_id,
            actor_role="admin",
            action="delete_user",
            target_type="user",
            target_id=user.id,
            details={
                "email_masked": email_masked,
                "was_disabled_at": was_disabled_at.isoformat()
                if was_disabled_at
                else None,
                "disabled_reason": disabled_reason,
            },
            ip=ip,
        )
        await self.db.flush()
        await self.db.delete(user)
        await self.db.commit()

    # ----- bulk action ------------------------------------------------------

    async def bulk_action(
        self,
        user_ids: list[uuid.UUID],
        action: str,  # "disable" | "enable" | "delete"
        reason: str | None,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> dict:
        """Apply the same lifecycle action to many users in one transaction.

        All audit rows + state changes happen inside a single atomic commit:
        if anything raises mid-loop the whole batch is rolled back. Skips are
        bucketed per the API contract so the UI can render row-level reasons:
        - `skipped_admin`: admin role (never touched, regardless of action).
        - `skipped_already_state`: user already in the requested state
          (disable on already-disabled, enable on already-enabled). Empty
          for the `delete` action.
        - `skipped_must_disable_first`: active users when action='delete'.
          The contract is intentional: deletion is a two-step flow (disable
          THEN delete) so an active user cannot be removed in one click.
        - `not_found`: ids that did not resolve to any row.
        """
        if not user_ids:
            return {
                "action": action,
                "applied": 0,
                "skipped_admin": [],
                "skipped_already_state": [],
                "skipped_must_disable_first": [],
                "not_found": [],
            }

        result = await self.db.execute(select(User).where(User.id.in_(user_ids)))
        found: dict[uuid.UUID, User] = {u.id: u for u in result.scalars().all()}

        not_found = [uid for uid in user_ids if uid not in found]
        skipped_admin: list[uuid.UUID] = []
        skipped_already_state: list[uuid.UUID] = []
        skipped_must_disable_first: list[uuid.UUID] = []
        applied = 0
        # Match the file's existing style (`disable_user` uses the same).
        now = datetime.now(timezone.utc)  # noqa: UP017

        # Two passes: gather state changes + audit rows first so any
        # validation error short-circuits before we issue DELETEs, then
        # execute the deletes. This keeps the transaction atomic AND keeps
        # the audit-before-delete ordering required for the delete action.
        users_to_delete: list[User] = []

        for uid in user_ids:
            user = found.get(uid)
            if user is None:
                continue
            if user.role == "admin":
                skipped_admin.append(uid)
                continue

            if action == "disable":
                if user.disabled_at is not None:
                    skipped_already_state.append(uid)
                    continue
                user.disabled_at = now
                # Pydantic guarantees `reason` is non-None + min_length=10
                # when action='disable', but we still narrow for the type
                # checker and the CHECK constraint chk_users_disabled_reason.
                user.disabled_reason = reason or ""
                await audit_log_action(
                    self.db,
                    actor_id=admin_id,
                    actor_role="admin",
                    action="disable_user",
                    target_type="user",
                    target_id=user.id,
                    details={"reason": reason, "bulk": True},
                    ip=ip,
                )
                applied += 1

            elif action == "enable":
                if user.disabled_at is None:
                    skipped_already_state.append(uid)
                    continue
                previous_reason = user.disabled_reason
                user.disabled_at = None
                user.disabled_reason = None
                await audit_log_action(
                    self.db,
                    actor_id=admin_id,
                    actor_role="admin",
                    action="enable_user",
                    target_type="user",
                    target_id=user.id,
                    details={"previous_reason": previous_reason, "bulk": True},
                    ip=ip,
                )
                applied += 1

            elif action == "delete":
                if user.disabled_at is None:
                    # Two-step gate: caller must disable first.
                    skipped_must_disable_first.append(uid)
                    continue
                # Snapshot BEFORE we queue the delete so the audit row has a
                # stable copy of the identity even if the DELETE fails.
                email_masked = mask_email(user.email)
                was_disabled_at = user.disabled_at
                disabled_reason = user.disabled_reason
                await audit_log_action(
                    self.db,
                    actor_id=admin_id,
                    actor_role="admin",
                    action="delete_user",
                    target_type="user",
                    target_id=user.id,
                    details={
                        "email_masked": email_masked,
                        "was_disabled_at": was_disabled_at.isoformat()
                        if was_disabled_at
                        else None,
                        "disabled_reason": disabled_reason,
                        "bulk": True,
                    },
                    ip=ip,
                )
                users_to_delete.append(user)
                applied += 1

        # Flush audit rows + state changes, THEN issue deletes so the audit
        # rows are guaranteed to be in the same atomic commit as the deletes.
        await self.db.flush()
        for u in users_to_delete:
            await self.db.delete(u)

        await self.db.commit()

        return {
            "action": action,
            "applied": applied,
            "skipped_admin": skipped_admin,
            "skipped_already_state": skipped_already_state,
            "skipped_must_disable_first": skipped_must_disable_first,
            "not_found": not_found,
        }

    # ----- cohort assignment ------------------------------------------------

    async def set_cohort(
        self,
        user_id: uuid.UUID,
        cohort: str | None,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> User:
        """Set or clear `users.cohort`. Writes audit_logs + commits atomically (D-12)."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise ValueError("USER_NOT_FOUND")

        old_cohort = user.cohort
        user.cohort = cohort
        await self.db.flush()

        await audit_log_action(
            self.db,
            actor_id=admin_id,
            actor_role="admin",
            action="change_config",
            target_type="user_cohort",
            target_id=user.id,
            details={"old": old_cohort, "new": cohort},
            ip=ip,
        )

        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def set_cohort_bulk(
        self,
        user_ids: list[uuid.UUID],
        cohort: str | None,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> dict:
        """Assign or clear cohort for multiple users in a single transaction.

        Each user gets an individual `audit_logs` row (per D-12) so the
        change is traceable per-target. Missing users go into `not_found`;
        admins are silently skipped (the UI hides them from selection but we
        guard server-side too) and reported in `skipped_admin`.

        Returns:
            {
              updated: int,         # number of users whose cohort changed
              unchanged: int,       # cohort was already equal to target
              not_found: [uuid],
              skipped_admin: [uuid],
            }
        """
        if not user_ids:
            return {
                "updated": 0,
                "unchanged": 0,
                "not_found": [],
                "skipped_admin": [],
            }

        result = await self.db.execute(select(User).where(User.id.in_(user_ids)))
        found: dict[uuid.UUID, User] = {u.id: u for u in result.scalars().all()}

        not_found = [uid for uid in user_ids if uid not in found]
        skipped_admin: list[uuid.UUID] = []
        updated = 0
        unchanged = 0

        for uid in user_ids:
            user = found.get(uid)
            if user is None:
                continue
            if user.role == "admin":
                # The UI prevents this — never let an admin be tagged as a
                # study participant. Server-side guard for robustness.
                skipped_admin.append(uid)
                continue
            old_cohort = user.cohort
            if old_cohort == cohort:
                unchanged += 1
                continue
            user.cohort = cohort
            await audit_log_action(
                self.db,
                actor_id=admin_id,
                actor_role="admin",
                action="update_cohort",
                target_type="user_cohort",
                target_id=user.id,
                details={"old": old_cohort, "new": cohort, "bulk": True},
                ip=ip,
            )
            updated += 1

        await self.db.commit()
        return {
            "updated": updated,
            "unchanged": unchanged,
            "not_found": not_found,
            "skipped_admin": skipped_admin,
        }
