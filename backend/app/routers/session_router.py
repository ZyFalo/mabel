import uuid
from typing import Union

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_consent
from app.models.user import User
from app.repositories.message_repository import MessageRepository
from app.repositories.preference_repository import PreferenceRepository
from app.repositories.session_repository import SessionRepository
from app.schemas.chat import (
    CreateSessionRequest,
    CreateSessionResponse,
    MessageResponse,
    SendMessageRequest,
    SessionDetailResponse,
    SessionResponse,
    UpdateSessionCheckin,
    UpdateSessionEnd,
)
from app.services.chat_service import ChatService
from app.services.llm.gemini_adapter import GeminiAdapter

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_chat_service(db=Depends(get_db)) -> ChatService:
    return ChatService(
        session_repo=SessionRepository(db),
        message_repo=MessageRepository(db),
        preference_repo=PreferenceRepository(db),
        llm=GeminiAdapter(),
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreateSessionResponse)
async def create_session(
    body: CreateSessionRequest | None = None,
    current_user: User = Depends(require_consent),
    service: ChatService = Depends(_get_chat_service),
):
    session, previous_closed = await service.create_session(
        user_id=current_user.id,
        topic_hint=body.topic_hint if body else None,
    )
    return CreateSessionResponse(
        id=session.id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        topic_hint=session.topic_hint,
        checkin_opt_in=session.checkin_opt_in,
        checkin_completed_at=session.checkin_completed_at,
        avatar_used=session.avatar_used,
        previous_session_closed=previous_closed,
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    current_user: User = Depends(require_consent),
    service: ChatService = Depends(_get_chat_service),
):
    return await service.list_sessions(current_user.id)


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: uuid.UUID,
    current_user: User = Depends(require_consent),
    service: ChatService = Depends(_get_chat_service),
):
    try:
        session = await service.get_session(session_id, current_user.id)
    except ValueError as e:
        if "NOT_FOUND" in str(e):
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return SessionDetailResponse.model_validate(session)


@router.patch("/{session_id}", response_model=SessionDetailResponse)
async def update_session(
    session_id: uuid.UUID,
    body: Union[UpdateSessionCheckin, UpdateSessionEnd],
    current_user: User = Depends(require_consent),
    service: ChatService = Depends(_get_chat_service),
):
    try:
        if isinstance(body, UpdateSessionEnd):
            session = await service.end_session(session_id, current_user.id)
        else:
            session = await service.update_checkin(
                session_id, current_user.id, body.checkin_payload.model_dump()
            )
    except ValueError as e:
        msg = str(e)
        if "NOT_FOUND" in msg:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        if "ACCESS_DENIED" in msg:
            raise HTTPException(status_code=403, detail="Acceso denegado")
        if "SESSION_ENDED" in msg:
            raise HTTPException(status_code=409, detail="Sesion finalizada")
        if "CHECKIN_ALREADY" in msg:
            raise HTTPException(status_code=409, detail="Check-in ya completado")
        raise
    return SessionDetailResponse.model_validate(session)


# --- Nested message endpoints ---


@router.post("/{session_id}/messages")
async def send_message(
    session_id: uuid.UUID,
    body: SendMessageRequest,
    current_user: User = Depends(require_consent),
    service: ChatService = Depends(_get_chat_service),
):
    try:
        stream = service.send_message(session_id, current_user.id, body.content)
    except ValueError as e:
        msg = str(e)
        if "NOT_FOUND" in msg:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        if "ACCESS_DENIED" in msg:
            raise HTTPException(status_code=403, detail="Acceso denegado")
        if "SESSION_ENDED" in msg:
            raise HTTPException(status_code=409, detail="Sesion finalizada")
        raise

    async def sse_generator():
        async for chunk in stream:
            yield f"data: {chunk}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.get("/{session_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    session_id: uuid.UUID,
    current_user: User = Depends(require_consent),
    service: ChatService = Depends(_get_chat_service),
):
    try:
        return await service.list_messages(session_id, current_user.id)
    except ValueError as e:
        msg = str(e)
        if "NOT_FOUND" in msg:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        raise HTTPException(status_code=403, detail="Acceso denegado")
