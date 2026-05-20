import uuid
from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

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
    cohort: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SetCohortRequest(BaseModel):
    """Payload for PATCH /admin/users/:id/cohort. None clears the cohort."""

    cohort: str | None = Field(default=None, max_length=64)


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
    cohort: str | None = None

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


class ReportStatusUpdate(BaseModel):
    """Payload for PATCH /admin/reports/:id. Enforced transitions in service layer."""

    status: Literal["triaged", "resolved", "dismissed"]
    notes: str | None = None


class SafetyEventStatusUpdate(BaseModel):
    """Payload for PATCH /admin/safety-events/:id. Enforced transitions in service layer."""

    status: Literal["reviewed", "resolved"]
    notes: str | None = None


# --- Capability 5: admin-config-audit ---


class SystemConfigItem(BaseModel):
    """Row used in #30 Admin Config page. Value is opaque JSON shape per key."""

    key: str
    value: Any
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConfigUpdateRequest(BaseModel):
    """Payload for PATCH /admin/config/:key. Shape validated server-side per key."""

    value: Any


class ConsentVersionCreate(BaseModel):
    """Payload for POST /admin/consent-versions. New row starts as `draft`."""

    version: str = Field(min_length=1)
    title: str = Field(min_length=1)
    body: str = Field(min_length=10)


class ConsentVersionItem(BaseModel):
    id: uuid.UUID
    version: str
    title: str
    body: str
    status: str
    published_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GeminiTestResponse(BaseModel):
    """Response for POST /admin/config/gemini/test."""

    ok: bool
    latency_ms: int
    model: str
    error: str | None = None


# --- Capability 3 (Fase 8.1): research-analytics-backend ---


class EmpathyRatingCreate(BaseModel):
    """Payload for POST /admin/empathy-ratings.

    `criteria` is a free-form checklist (e.g. `{empathic_tone: true, ...}`).
    Score is constrained 1..5 by Pydantic (matches DB CHECK).
    """

    message_id: uuid.UUID
    score: int = Field(ge=1, le=5)
    criteria: dict | None = None


class EmpathyQueueItem(BaseModel):
    """Item rendered by the Empathy Ratings rating queue UI."""

    message_id: uuid.UUID
    session_id: uuid.UUID
    content: str
    created_at: datetime
    session_started_at: datetime | None = None
    # S-02: preceding user message for rater context (may be None for the
    # very first turn or system messages).
    preceding_user_message: str | None = None

    model_config = ConfigDict(from_attributes=True)


class EmpathyRatingItem(BaseModel):
    """Persisted rating returned by POST /admin/empathy-ratings."""

    id: uuid.UUID
    message_id: uuid.UUID
    rater_id: uuid.UUID | None = None
    score: int
    criteria: dict | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
