import uuid
from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class BulkCohortRequest(BaseModel):
    """Payload for PATCH /admin/users/cohort/bulk.

    `cohort=None` clears the cohort for every listed user. `user_ids` must be
    non-empty. Backend silently skips admins (the UI does too) and reports
    them in `skipped_admin`.
    """

    user_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    cohort: str | None = Field(default=None, max_length=64)


class BulkCohortResponse(BaseModel):
    """Summary returned by the bulk cohort endpoint."""

    updated: int
    unchanged: int
    not_found: list[uuid.UUID] = []
    skipped_admin: list[uuid.UUID] = []


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
    # `consent_scope` was missing from the response shape until
    # 2026-05-23: the frontend at UserDetail.tsx already read it (via
    # `formatScope(user.consent.scope)`) but the field never arrived,
    # so the "Alcance" cell always rendered "—" even when the user
    # had a clear scope choice in BD.
    consent_scope: str | None = None
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


class ReportNoteEntry(BaseModel):
    """One audited entry parsed from `message_reports.details`.

    The `details` column stores newline-separated entries in the format
    `[ISO_timestamp] <new_status>: <notes>` (see message_report_repository).
    We parse it back into structured rows for the admin UI's note history.
    """

    at: datetime | None = None
    status: str | None = None
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ReportAdminItem(BaseModel):
    """Row used in #26 Reports table. Never includes message content (D-03)."""

    id: uuid.UUID
    message_id: uuid.UUID
    # Full reporter UUID — needed so the admin UI can deep-link to
    # /admin/users/<id> (justified: an admin already has access to user
    # detail pages, this just removes a redundant lookup). The truncated
    # form below is kept so the table cell can keep its anonymized look.
    reporter_id: uuid.UUID
    reporter_id_truncated: str
    reason: str
    severity: int | None = None
    status: str
    created_at: datetime
    triaged_at: datetime | None = None
    # Original free-text context entered by the reporting student at filing
    # time. Comes from `message_reports.details` BEFORE any admin transition
    # appends notes. Surfaced separately from `notes_history` so the admin
    # UI does not mis-attribute the student's words as an admin note.
    reporter_context: str | None = None
    # Chronological notes added by admins on each status transition.
    notes_history: list[ReportNoteEntry] = []

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
    """Row used in #31 Audit logs table.

    Evolucion 007: `admin_id`/`admin_email_masked` renamed to `actor_id`/
    `actor_email_masked` and `actor_role` exposed so the admin panel can
    distinguish admin actions from student-originated ones (register,
    consent, delete, etc.) and the rare `system` events (failed logins,
    cronjobs).
    """

    id: uuid.UUID
    actor_id: uuid.UUID | None = None
    actor_role: str
    actor_email_masked: str | None = None
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


class BulkUserActionRequest(BaseModel):
    """Payload for POST /admin/users/bulk-action.

    Drives the three bulk lifecycle operations from the admin Users table:
    `disable`, `enable`, and `delete`. The service layer enforces additional
    invariants (admin protection, must-be-disabled-before-delete) and reports
    skips back via :class:`BulkUserActionResponse`; this schema just enforces
    the surface contract (size bounds + reason requirement when disabling).
    """

    user_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    action: Literal["disable", "enable", "delete"]
    reason: str | None = Field(default=None, min_length=10, max_length=500)

    @model_validator(mode="after")
    def _require_reason_for_disable(self) -> "BulkUserActionRequest":
        # `disable` is audited per-target with the supplied reason; allowing
        # an empty reason here would let an admin bypass the same constraint
        # the single-user `/disable` endpoint enforces (DisableUserRequest).
        if self.action == "disable" and (self.reason is None or not self.reason.strip()):
            raise ValueError(
                "reason es requerido para action='disable' (min 10 caracteres)"
            )
        return self


class BulkUserActionResponse(BaseModel):
    """Summary returned by POST /admin/users/bulk-action.

    `applied` counts users that effectively received the action; the three
    `skipped_*` lists give the UI enough context to render a per-row reason
    for non-application. `skipped_must_disable_first` is only populated when
    `action='delete'` (it is empty otherwise).
    """

    action: Literal["disable", "enable", "delete"]
    applied: int
    skipped_admin: list[uuid.UUID] = []
    skipped_already_state: list[uuid.UUID] = []
    skipped_must_disable_first: list[uuid.UUID] = []
    not_found: list[uuid.UUID] = []


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


class EmpathyQueueResponse(BaseModel):
    """Wrapper returned by GET /admin/empathy-ratings/queue.

    `items` is bounded by `limit`; `total_pending` is the unbounded count of
    assistant messages the active rater still has to evaluate. The UI uses
    the gap between the two to render an honest "mostrando N de M" counter
    and hide the "Cargar más" button when N >= M.
    """

    items: list[EmpathyQueueItem]
    total_pending: int

    model_config = ConfigDict(from_attributes=True)


class EmpathyRatingItem(BaseModel):
    """Persisted rating returned by POST /admin/empathy-ratings."""

    id: uuid.UUID
    message_id: uuid.UUID
    rater_id: uuid.UUID | None = None
    score: int
    criteria: dict | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class EmpathyRatingUpdate(BaseModel):
    """Payload for PATCH /admin/empathy-ratings/{rating_id}.

    Both fields are optional — the rater can change score, criteria, or both.
    """

    score: int | None = Field(default=None, ge=1, le=5)
    criteria: dict | None = None


class EmpathyRatedItem(BaseModel):
    """Item rendered by the 'Calificadas' tab of the empathy ratings UI.

    Bundles the rating itself with the message + preceding context (same shape
    as `EmpathyQueueItem`) plus the rater's identity and an `is_mine` flag so
    the UI can grey-out edits on other raters' ratings.
    """

    # Rating
    rating_id: uuid.UUID
    score: int
    criteria: dict | None = None
    created_at: datetime
    updated_at: datetime | None = None

    # Rater
    rater_id: uuid.UUID | None = None
    rater_email_masked: str | None = None
    is_mine: bool

    # Message context (same as EmpathyQueueItem)
    message_id: uuid.UUID
    session_id: uuid.UUID
    content: str
    message_created_at: datetime
    session_started_at: datetime | None = None
    preceding_user_message: str | None = None

    model_config = ConfigDict(from_attributes=True)


class EmpathyRatedResponse(BaseModel):
    """Wrapper for GET /admin/empathy-ratings/rated."""

    items: list[EmpathyRatedItem]
    total: int

    model_config = ConfigDict(from_attributes=True)
