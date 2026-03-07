import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.preference import Preference


class PreferenceRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_user_id(self, user_id: uuid.UUID) -> Preference | None:
        result = await self.db.execute(select(Preference).where(Preference.user_id == user_id))
        return result.scalar_one_or_none()
