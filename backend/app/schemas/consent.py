import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class ScopeEnum(str, Enum):
    solo_uso = "solo_uso"
    uso_mejora_anon = "uso_mejora_anon"


class ConsentActionEnum(str, Enum):
    re_accept = "re-accept"
    reduce_scope = "reduce-scope"
    revoke = "revoke"


class AcceptConsentRequest(BaseModel):
    consent_version_id: uuid.UUID
    scope: ScopeEnum


class PatchConsentRequest(BaseModel):
    action: ConsentActionEnum
    scope: ScopeEnum | None = None


class ConsentStatusResponse(BaseModel):
    status: str  # "ok" | "no_consent" | "revoked" | "new_version_required"
    current_version: str | None = None
    new_version: str | None = None
    scope: str | None = None


class ConsentVersionResponse(BaseModel):
    id: uuid.UUID
    version: str
    title: str
    body: str
    status: str
    published_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConsentResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    scope: str
    accepted_at: datetime
    revoked_at: datetime | None
    consent_version_id: uuid.UUID

    model_config = {"from_attributes": True}
