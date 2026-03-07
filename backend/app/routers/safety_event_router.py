from fastapi import APIRouter, Depends, status

from app.core.database import get_db
from app.middleware.auth import require_consent
from app.models.user import User
from app.repositories.safety_event_repository import SafetyEventRepository
from app.schemas.guardrails import CreateSafetyEventRequest, SafetyEventResponse

router = APIRouter(prefix="/safety-events", tags=["safety-events"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SafetyEventResponse)
async def create_safety_event(
    body: CreateSafetyEventRequest,
    current_user: User = Depends(require_consent),
    db=Depends(get_db),
):
    repo = SafetyEventRepository(db)
    event = await repo.create(
        user_id=current_user.id,
        session_id=body.session_id,
        event_type=body.event_type,
        payload=body.payload,
    )
    await db.commit()
    return SafetyEventResponse.model_validate(event)
