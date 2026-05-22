import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consent import Consent


class ConsentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_user_and_version(
        self, user_id: uuid.UUID, consent_version_id: uuid.UUID
    ) -> Consent | None:
        result = await self.db.execute(
            select(Consent).where(
                Consent.user_id == user_id,
                Consent.consent_version_id == consent_version_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_latest_by_user(self, user_id: uuid.UUID) -> Consent | None:
        result = await self.db.execute(
            select(Consent)
            .where(Consent.user_id == user_id)
            .order_by(Consent.accepted_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def create(
        self, user_id: uuid.UUID, consent_version_id: uuid.UUID, scope: str
    ) -> Consent:
        """Insert a new consent row. Does NOT commit (per D-12).

        The caller (`ConsentService`) bundles this with the matching
        `audit_log_action` and commits both atomically — so if the audit
        write fails, the consent never persists either, and we preserve the
        invariant that every consent change has its audit trail.
        """
        consent = Consent(
            user_id=user_id, consent_version_id=consent_version_id, scope=scope
        )
        self.db.add(consent)
        await self.db.flush()
        await self.db.refresh(consent)
        return consent

    async def update(self, consent: Consent, **kwargs: object) -> Consent:
        """Update consent fields in place. Does NOT commit (per D-12)."""
        for key, value in kwargs.items():
            setattr(consent, key, value)
        await self.db.flush()
        await self.db.refresh(consent)
        return consent
