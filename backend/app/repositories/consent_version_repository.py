import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consent_version import ConsentVersion


class ConsentVersionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active(self) -> ConsentVersion | None:
        result = await self.db.execute(
            select(ConsentVersion).where(ConsentVersion.status == "active")
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, version_id: uuid.UUID) -> ConsentVersion | None:
        result = await self.db.execute(
            select(ConsentVersion).where(ConsentVersion.id == version_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> list[ConsentVersion]:
        result = await self.db.execute(
            select(ConsentVersion).order_by(ConsentVersion.created_at.desc())
        )
        return list(result.scalars().all())
