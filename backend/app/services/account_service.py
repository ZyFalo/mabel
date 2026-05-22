import csv
import io
import uuid

import bcrypt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consent import Consent
from app.models.consent_version import ConsentVersion
from app.models.message import Message
from app.models.message_report import MessageReport
from app.models.preference import Preference
from app.models.session import Session
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.audit_service import audit_log_action


class AccountService:
    def __init__(self, user_repo: UserRepository, db: AsyncSession) -> None:
        self.user_repo = user_repo
        self.db = db

    async def delete_account(
        self,
        user_id: uuid.UUID,
        confirmation: str,
        ip: str | None = None,
    ) -> None:
        if confirmation != "ELIMINAR":
            raise ValueError("INVALID_CONFIRMATION")

        # Snapshot the email BEFORE the row disappears so the audit log
        # preserves enough context for the admin panel timeline. The FK
        # `audit_logs.actor_id` is ON DELETE SET NULL, so the log survives
        # the user's hard deletion (Evo 005b pattern).
        user = await self.user_repo.get_by_id(user_id)
        if user is None:
            raise ValueError("USER_NOT_FOUND")
        email_snapshot = user.email

        # Write the audit log BEFORE the delete so actor_id is still a valid
        # FK at insert time; once we commit, the user_repo.delete cascade
        # nulls the audit_logs.actor_id automatically.
        await audit_log_action(
            self.db,
            actor_id=user_id,
            actor_role="student",
            action="user_delete",
            target_type="user",
            target_id=user_id,
            details={"email": email_snapshot},
            ip=ip,
        )

        deleted = await self.user_repo.delete(user_id)
        if not deleted:
            raise ValueError("USER_NOT_FOUND")

    async def change_password(
        self, user: User, current_password: str, new_password: str
    ) -> None:
        if not bcrypt.checkpw(current_password.encode(), user.hashed_password.encode()):
            raise ValueError("WRONG_PASSWORD")
        if current_password == new_password:
            raise ValueError("SAME_PASSWORD")
        hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt(rounds=12)).decode()
        await self.user_repo.update_password(user.id, hashed)

    async def export_data(self, user_id: uuid.UUID, fmt: str) -> dict | str:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError("USER_NOT_FOUND")

        # Account data
        account = {
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }

        # Consent data
        consent_data = None
        result = await self.db.execute(
            select(Consent, ConsentVersion.version)
            .join(ConsentVersion, Consent.consent_version_id == ConsentVersion.id)
            .where(Consent.user_id == user_id)
            .order_by(Consent.accepted_at.desc())
            .limit(1)
        )
        row = result.first()
        if row:
            consent_obj, version_str = row
            consent_data = {
                "scope": consent_obj.scope,
                "accepted_at": consent_obj.accepted_at.isoformat() if consent_obj.accepted_at else None,
                "revoked_at": consent_obj.revoked_at.isoformat() if consent_obj.revoked_at else None,
                "version": version_str,
            }

        # Preferences data
        prefs_data = None
        pref_result = await self.db.execute(
            select(Preference).where(Preference.user_id == user_id)
        )
        pref = pref_result.scalar_one_or_none()
        if pref:
            prefs_data = {
                "save_history": pref.save_history,
                "ui_language": pref.ui_language,
                "tts_voice": pref.tts_voice,
                "accessibility": pref.accessibility,
                "checkin_enabled": pref.checkin_enabled,
                "preferred_chat_mode": pref.preferred_chat_mode,
            }

        # Usage statistics (counts only, no content)
        sessions_count = await self.db.execute(
            select(func.count()).select_from(Session).where(Session.user_id == user_id)
        )
        total_sessions = sessions_count.scalar() or 0

        messages_count = await self.db.execute(
            select(func.count())
            .select_from(Message)
            .join(Session, Message.session_id == Session.id)
            .where(Session.user_id == user_id)
        )
        total_messages = messages_count.scalar() or 0

        reports_count = await self.db.execute(
            select(func.count())
            .select_from(MessageReport)
            .where(MessageReport.reporter_id == user_id)
        )
        total_reports = reports_count.scalar() or 0

        usage_stats = {
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "total_reports": total_reports,
        }

        data = {
            "account": account,
            "consent": consent_data,
            "preferences": prefs_data,
            "usage_stats": usage_stats,
        }

        if fmt == "csv":
            return self._to_csv(data)
        return data

    @staticmethod
    def _to_csv(data: dict) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["key", "value"])

        def flatten(obj: dict | None, prefix: str = "") -> None:
            if obj is None:
                return
            for k, v in obj.items():
                full_key = f"{prefix}.{k}" if prefix else k
                if isinstance(v, dict):
                    flatten(v, full_key)
                else:
                    writer.writerow([full_key, str(v) if v is not None else ""])

        for section_key, section_val in data.items():
            if isinstance(section_val, dict):
                flatten(section_val, section_key)
            else:
                writer.writerow([section_key, str(section_val) if section_val is not None else ""])

        return output.getvalue()
