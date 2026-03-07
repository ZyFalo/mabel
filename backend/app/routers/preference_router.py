from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_role
from app.models.user import User
from app.repositories.preference_repository import PreferenceRepository
from app.schemas.preferences import PreferencesResponse, UpdatePreferencesRequest
from app.services.preference_service import PreferenceService

router = APIRouter(prefix="/preferences", tags=["preferences"])


def _get_preference_service(db: AsyncSession = Depends(get_db)) -> PreferenceService:
    return PreferenceService(PreferenceRepository(db))


@router.get("/me", response_model=PreferencesResponse)
async def get_my_preferences(
    current_user: User = Depends(require_role("student")),
    service: PreferenceService = Depends(_get_preference_service),
):
    preference = await service.get_preferences(current_user.id)
    if not preference:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preferencias no encontradas",
        )
    return preference


@router.put("", response_model=PreferencesResponse)
async def upsert_preferences(
    request: UpdatePreferencesRequest,
    current_user: User = Depends(require_role("student")),
    service: PreferenceService = Depends(_get_preference_service),
):
    return await service.upsert_preferences(current_user.id, request)
