import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# --- Session schemas ---


class CreateSessionRequest(BaseModel):
    topic_hint: str | None = None


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
    mood: int = Field(ge=0, le=10)
    sleep: float | None = Field(default=None, ge=0, le=24)
    focus: Literal["Academico", "Social", "Familiar", "Salud", "Economico", "Otro"] | None = None
    note: str | None = Field(default=None, max_length=500)


class UpdateSessionCheckin(BaseModel):
    checkin_payload: CheckinPayload


class UpdateSessionEnd(BaseModel):
    action: Literal["end"]


# --- Message schemas ---


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


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
