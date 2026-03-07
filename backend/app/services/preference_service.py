import uuid

from app.models.preference import Preference
from app.repositories.preference_repository import PreferenceRepository
from app.schemas.preferences import UpdatePreferencesRequest


class PreferenceService:
    def __init__(self, repo: PreferenceRepository) -> None:
        self.repo = repo

    async def get_preferences(self, user_id: uuid.UUID) -> Preference | None:
        return await self.repo.get_by_user_id(user_id)

    async def upsert_preferences(
        self, user_id: uuid.UUID, data: UpdatePreferencesRequest
    ) -> Preference:
        fields = {k: v for k, v in data.model_dump().items() if v is not None}

        existing = await self.repo.get_by_user_id(user_id)
        if existing:
            if fields:
                return await self.repo.update(existing, **fields)
            return existing

        return await self.repo.create(user_id, **fields)
