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
            admin_id=admin_id,
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
            admin_id=admin_id,
            action="disable_user",
            target_type="user",
            target_id=user.id,
            details={"reason": reason},
            ip=ip,
        )

        await self.db.commit()
        await self.db.refresh(user)
        return user

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
            admin_id=admin_id,
            action="change_config",
            target_type="user_cohort",
            target_id=user.id,
            details={"old": old_cohort, "new": cohort},
            ip=ip,
        )

        await self.db.commit()
        await self.db.refresh(user)
        return user
