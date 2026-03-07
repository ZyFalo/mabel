import uuid
from enum import Enum
from typing import Literal

from pydantic import BaseModel, field_validator


class UpdatePreferencesRequest(BaseModel):
    save_history: bool | None = None
    ui_language: str | None = None
    tts_voice: str | None = None
    accessibility: dict | None = None
    checkin_enabled: bool | None = None
    preferred_chat_mode: Literal["chat", "avatar"] | None = None


class PreferencesResponse(BaseModel):
    user_id: uuid.UUID
    save_history: bool
    ui_language: str
    tts_voice: str | None
    accessibility: dict | None
    checkin_enabled: bool
    preferred_chat_mode: str

    model_config = {"from_attributes": True}


class DeleteAccountRequest(BaseModel):
    confirmation: str

    @field_validator("confirmation")
    @classmethod
    def validate_confirmation(cls, v: str) -> str:
        if v != "ELIMINAR":
            raise ValueError("Debes escribir ELIMINAR para confirmar")
        return v


class ExportFormatEnum(str, Enum):
    json = "json"
    csv = "csv"
