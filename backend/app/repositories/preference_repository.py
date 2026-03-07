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

    async def create(self, user_id: uuid.UUID, **kwargs: object) -> Preference:
        preference = Preference(user_id=user_id, **kwargs)
        self.db.add(preference)
        await self.db.commit()
        await self.db.refresh(preference)
        return preference

    async def update(self, preference: Preference, **kwargs: object) -> Preference:
        for key, value in kwargs.items():
            setattr(preference, key, value)
        await self.db.commit()
        await self.db.refresh(preference)
        return preference
