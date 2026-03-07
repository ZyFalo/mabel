import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CreateSafetyEventRequest(BaseModel):
    event_type: Literal["risk_detected", "redirect_shown", "user_report"]
    payload: dict
    session_id: uuid.UUID | None = None


class SafetyEventResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    payload: dict | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SosConfigResponse(BaseModel):
    hotline_numbers: list[dict]
    guardrails_enabled: bool
