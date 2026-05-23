import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.core.database import get_db
from app.middleware.auth import require_consent
from app.models.user import User
from app.repositories.message_repository import MessageRepository
from app.repositories.preference_repository import PreferenceRepository
from app.repositories.safety_event_repository import SafetyEventRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.system_config_repository import SystemConfigRepository
from app.schemas.chat import (
    CreateSessionRequest,
    CreateSessionResponse,
    MessageResponse,
    SendMessageRequest,
    SessionDetailResponse,
    SessionRatingResponse,
    SessionRatingUpsertRequest,
    SessionResponse,
    UpdateSessionCheckin,
    UpdateSessionEnd,
)
from app.services.chat_service import ChatService
from app.services.guardrails_service import GuardrailsService
from app.services.llm import get_llm_provider

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_chat_service(db=Depends(get_db)) -> ChatService:
    config_repo = SystemConfigRepository(db)
    event_repo = SafetyEventRepository(db)
    guardrails = GuardrailsService(config_repo=config_repo, event_repo=event_repo)
    return ChatService(
        session_repo=SessionRepository(db),
        message_repo=MessageRepository(db),
        preference_repo=PreferenceRepository(db),
        llm=get_llm_provider(),
        guardrails=guardrails,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreateSessionResponse)
async def create_session(
    body: CreateSessionRequest | None = None,
    current_user: User = Depends(require_consent),
    service: ChatService = Depends(_get_chat_service),
):
    # Lazy session creation (2026-05-23): el body puede traer
    # `checkin_payload`. Si viene, la sesión nace con el check-in
    # ya completado en la misma transacción — atómico, sin window
    # donde queden sesiones "huérfanas" sin check-in.
    checkin_payload_dict: dict | None = None
    if body and body.checkin_payload is not None:
        # `model_dump(exclude_none=True)` evita persistir keys con None
        # — la BD ya guarda JSONB y un dict con valores None ensucia
        # los downstream consumers (prompts.py, metrics).
        checkin_payload_dict = body.checkin_payload.model_dump(exclude_none=True)
    session, previous_closed = await service.create_session(
        user_id=current_user.id,
        topic_hint=body.topic_hint if body else None,
        checkin_payload=checkin_payload_dict,
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
    body: UpdateSessionCheckin | UpdateSessionEnd,
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


@router.post("/{session_id}/greeting")
async def generate_greeting(
    session_id: uuid.UUID,
    current_user: User = Depends(require_consent),
    service: ChatService = Depends(_get_chat_service),
):
    try:
        result = await service.generate_greeting(session_id, current_user.id)
    except ValueError as e:
        msg = str(e)
        if "NOT_FOUND" in msg:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if result is None:
        return {"greeting": None}
    return {"greeting": result}


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


# --- Session rating (corazones, 1-5) ---


@router.get("/{session_id}/rating", response_model=SessionRatingResponse | None)
async def get_session_rating(
    session_id: uuid.UUID,
    current_user: User = Depends(require_consent),
    db=Depends(get_db),
):
    """Devuelve la calificacion del usuario actual para esta sesion,
    o None si nunca la calificó. Permite que el componente HeartRating
    del frontend hidrate el estado al montar el header del chat.
    """
    from sqlalchemy import select

    from app.models.session import Session as SessionModel
    from app.models.session_rating import SessionRating

    # Verificar propiedad de la sesion (el rating es self-rating)
    session_row = (
        await db.execute(select(SessionModel).where(SessionModel.id == session_id))
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    if session_row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    rating_row = (
        await db.execute(
            select(SessionRating).where(
                SessionRating.session_id == session_id,
                SessionRating.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if rating_row is None:
        return None
    return SessionRatingResponse.model_validate(rating_row)


@router.put("/{session_id}/rating", response_model=SessionRatingResponse)
async def upsert_session_rating(
    session_id: uuid.UUID,
    body: SessionRatingUpsertRequest,
    request: Request,
    current_user: User = Depends(require_consent),
    db=Depends(get_db),
):
    """Crea o actualiza la calificacion del estudiante para una sesion.

    Idempotente via UNIQUE(session_id, user_id) — el segundo PUT
    cambia el valor sin duplicar filas. Funciona en sesiones activas
    y finalizadas (decision UX: el estudiante puede ajustar su
    calificacion al releer la conversacion en cualquier momento).

    D-12 compliance (code-review #3, 2026-05-23): la mutacion +
    audit_log_action + commit suceden en UNA sola transaccion. El
    audit guarda action='session_rated' con details que incluye el
    valor anterior (si existia) y el nuevo, permitiendo al admin
    responder "quien cambio su calificacion" en la UI de AuditLogs.
    """
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models.session import Session as SessionModel
    from app.models.session_rating import SessionRating
    from app.services.audit_service import audit_log_action

    # Verificar propiedad
    session_row = (
        await db.execute(select(SessionModel).where(SessionModel.id == session_id))
    ).scalar_one_or_none()
    if session_row is None:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    if session_row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    existing = (
        await db.execute(
            select(SessionRating).where(
                SessionRating.session_id == session_id,
                SessionRating.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    now = datetime.now(UTC)
    previous_value: int | None = None
    if existing is None:
        rating_row = SessionRating(
            session_id=session_id,
            user_id=current_user.id,
            rating=body.rating,
        )
        db.add(rating_row)
    else:
        previous_value = existing.rating
        existing.rating = body.rating
        existing.updated_at = now
        rating_row = existing

    # Solo emitimos audit si el valor realmente cambia, para no
    # ensuciar el log con re-puts del mismo numero (los UI clients
    # pueden disparar PUT al click incluso si el valor no cambio).
    if previous_value != body.rating:
        await audit_log_action(
            db,
            actor_id=current_user.id,
            actor_role="student",
            action="session_rated",
            target_type="session",
            target_id=session_id,
            details={
                "rating": body.rating,
                "previous_rating": previous_value,
            },
            ip=(request.client.host if request.client else None),
        )

    await db.commit()
    await db.refresh(rating_row)
    return SessionRatingResponse.model_validate(rating_row)
