import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# --- Session schemas ---


class CreateSessionRequest(BaseModel):
    """Payload para POST /sessions.

    `checkin_payload` es opcional: si viene, la sesión nace con el
    check-in ya completado y `checkin_completed_at` marcado en la
    misma transacción (lazy session creation pattern). Esto permite
    que el frontend retrase la creación de sesión hasta que haya una
    acción real (submit del check-in o primer mensaje), evitando
    sesiones "huérfanas" creadas por simple navegación.
    """

    topic_hint: str | None = None
    checkin_payload: "CheckinPayload | None" = None


class SessionResponse(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None = None
    topic_hint: str | None = None
    checkin_opt_in: bool
    checkin_completed_at: datetime | None = None
    avatar_used: bool

    model_config = {"from_attributes": True}


class CreateSessionResponse(SessionResponse):
    previous_session_closed: bool = False


class SessionDetailResponse(SessionResponse):
    checkin_payload: dict | None = None
    meta: dict | None = None


# --- Check-in schemas ---


class CheckinPayload(BaseModel):
    """Payload del check-in inicial.

    Reformulado 2026-05-23 para soportar los 7 campos opcionales
    propuestos por research-analytics agent:
      - mood (0-10): ánimo (5 caritas en UI, mapeado a 0/2/5/8/10)
      - energy (1-4): recursos para el día
      - stress (1-4): qué tan abrumada/o
      - sleep_quality (string): calidad subjetiva de sueño
      - sleep (0-24): horas exactas opcional
      - loneliness (1-4): conexión social
      - focus (list o string): multi-select; string admitido por compat legacy
      - focus_other (max 80): texto libre cuando focus incluye 'Otro'
      - note (max 500): texto libre adicional

    TODOS los campos son opcionales — el frontend permite enviar
    payload parcial. La pre-2026-05-23 versión obligaba `mood`, esto
    cambió porque ahora todo el formulario es opcional.

    Focos válidos ampliados: Pareja y Futuro añadidos (cubren clusters
    prevalentes en universitarios colombianos sin caer en 'Otro').
    """

    mood: int | None = Field(default=None, ge=0, le=10)
    energy: int | None = Field(default=None, ge=1, le=4)
    stress: int | None = Field(default=None, ge=1, le=4)
    sleep_quality: Literal["mal", "regular", "bien", "muy_bien"] | None = None
    sleep: float | None = Field(default=None, ge=0, le=24)
    loneliness: int | None = Field(default=None, ge=1, le=4)
    # `focus` admite tanto lista (multi-select actual) como string
    # (formato legacy). Validamos los valores conocidos pero NO
    # rechazamos otros para no romper sesiones antiguas.
    focus: (
        list[Literal["Academico", "Social", "Familiar", "Pareja", "Salud", "Economico", "Futuro", "Otro"]]
        | Literal["Academico", "Social", "Familiar", "Pareja", "Salud", "Economico", "Futuro", "Otro"]
        | None
    ) = None
    focus_other: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=500)


class UpdateSessionCheckin(BaseModel):
    checkin_payload: CheckinPayload


class UpdateSessionEnd(BaseModel):
    action: Literal["end"]


# --- Message schemas ---


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    # Si el mensaje viene del modo voz, el backend ajusta el system
    # prompt para responder breve y conversacional — evita markdown,
    # emojis y respuestas largas que suenan robóticas en TTS.
    voice_mode: bool = Field(default=False)


class MessageResponse(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    safety_flags: dict | None = None

    model_config = {"from_attributes": True}


# --- Report schemas ---


class CreateReportRequest(BaseModel):
    reason: Literal["hallucination", "harmful", "privacy", "low_empathy", "other"]
    severity: int | None = Field(default=None, ge=1, le=5)
    details: str | None = Field(default=None, max_length=1000)


class ReportResponse(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    reason: str
    severity: int | None = None
    details: str | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportCheckResponse(BaseModel):
    already_reported: bool


# --- Session rating (corazones, 1-5) ---


class SessionRatingUpsertRequest(BaseModel):
    """Payload para PUT /sessions/:id/rating. `rating` debe estar en
    [1, 5]; el backend además impone UNIQUE(session_id, user_id) así
    que llamar este endpoint dos veces actualiza el valor, no duplica."""

    rating: int = Field(ge=1, le=5)


class SessionRatingResponse(BaseModel):
    rating: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
