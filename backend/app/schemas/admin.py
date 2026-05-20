import uuid
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard envelope for admin list endpoints (D-07)."""

    items: list[T]
    total: int
    page: int
    page_size: int


class UserAdminListItem(BaseModel):
    """Row used in #28 Users table. Email is masked (D-04)."""

    id: uuid.UUID
    email_masked: str
    display_name: str
    role: str
    created_at: datetime
    last_session_at: datetime | None = None
    consent_status: str
    total_sessions: int = 0
    disabled_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class UserAdminDetail(BaseModel):
    """Full detail for #29 User detail page."""

    # Identity
    id: uuid.UUID
    email_masked: str
    display_name: str
    role: str
    created_at: datetime
    disabled_at: datetime | None = None
    disabled_reason: str | None = None

    # Consent
    consent_status: str
    consent_version: str | None = None
    consent_accepted_at: datetime | None = None
    consent_revoked_at: datetime | None = None

    # Preferences flags (no content) — admin sees flags only
    save_history: bool | None = None
    tts_enabled: bool | None = None
    asr_enabled: bool | None = None
    voice: str | None = None
    notifications_email: bool | None = None

    # Statistics
    total_sessions: int = 0
    total_messages: int = 0
    last_session_at: datetime | None = None
    total_reports_filed: int = 0
    total_safety_events: int = 0

    model_config = ConfigDict(from_attributes=True)


class ReportAdminItem(BaseModel):
    """Row used in #26 Reports table. Never includes message content (D-03)."""

    id: uuid.UUID
    message_id: uuid.UUID
    reporter_id_truncated: str
    reason: str
    severity: int | None = None
    status: str
    created_at: datetime
    triaged_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SafetyEventAdminItem(BaseModel):
    """Row used in #25 Safety events table. session_id is truncated, payload excludes content (D-03)."""

    id: uuid.UUID
    event_type: str
    session_id_truncated: str | None = None
    severity: int | None = None
    status: str
    created_at: datetime
    payload: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class AuditLogItem(BaseModel):
    """Row used in #31 Audit logs table."""

    id: uuid.UUID
    admin_id: uuid.UUID | None = None
    admin_email_masked: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    details: dict | None = None
    ip: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DisableUserRequest(BaseModel):
    """Payload for PATCH /admin/users/:id/disable. Reason mandatory (audited)."""

    reason: str = Field(min_length=10)
