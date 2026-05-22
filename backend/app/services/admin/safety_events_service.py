"""Admin Safety Events service — Capability 3 (admin-reports-safety).

Business rules:
- D-03: NEVER include `messages.content`. Items carry metadata + sanitized payload.
- D-07: paginated `{items, total, page, page_size}`.
- D-08: CSV anonymizes id-like columns via `sha256(value)[:16]`.
- D-12: action + audit log committed atomically.
- State machine for safety events:
    active   -> reviewed
    reviewed -> resolved
    Anything else SHALL raise INVALID_TRANSITION (409).
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.safety_event import SafetyEvent
from app.repositories.safety_event_repository import SafetyEventRepository
from app.schemas.admin import SafetyEventAdminItem
from app.services.audit_service import audit_log_action

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "active": {"reviewed"},
    "reviewed": {"resolved"},
    "resolved": set(),
}

# Keys we refuse to leak even if a buggy caller stored them in payload.
_FORBIDDEN_PAYLOAD_KEYS = frozenset({"content", "message", "text", "raw_message"})


def _hash16(value: object) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]


def _truncate_id(value: uuid.UUID | None, length: int = 8) -> str | None:
    if value is None:
        return None
    return str(value)[:length]


def _extract_severity(payload: dict | None) -> int | None:
    if not payload:
        return None
    sev = payload.get("severity")
    if sev is None:
        return None
    try:
        return int(sev)
    except (TypeError, ValueError):
        return None


def _sanitize_payload(payload: dict | None) -> dict | None:
    """Remove any forbidden keys defensively (D-03)."""
    if not payload:
        return payload
    return {k: v for k, v in payload.items() if k not in _FORBIDDEN_PAYLOAD_KEYS}


def _to_item(event: SafetyEvent) -> SafetyEventAdminItem:
    return SafetyEventAdminItem(
        id=event.id,
        event_type=event.event_type,
        session_id_truncated=_truncate_id(event.session_id, 8),
        severity=_extract_severity(event.payload),
        status=event.status,
        created_at=event.created_at,
        payload=_sanitize_payload(event.payload),
    )


class AdminSafetyEventsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = SafetyEventRepository(db)

    async def list_events(
        self,
        event_type: str | None,
        severity: int | None,
        status: str | None,
        from_date: date | None,
        to_date: date | None,
        page: int,
        page_size: int,
    ) -> tuple[list[SafetyEventAdminItem], int]:
        events, total = await self.repo.list_with_filters(
            event_type=event_type,
            severity=severity,
            status=status,
            from_date=from_date,
            to_date=to_date,
            page=page,
            page_size=page_size,
        )
        return [_to_item(e) for e in events], total

    async def update_event_status(
        self,
        event_id: uuid.UUID,
        new_status: str,
        notes: str | None,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> SafetyEventAdminItem:
        event = await self.repo.get_by_id(event_id)
        if event is None:
            raise ValueError("SAFETY_EVENT_NOT_FOUND")

        allowed = _ALLOWED_TRANSITIONS.get(event.status, set())
        if new_status not in allowed:
            raise ValueError("INVALID_TRANSITION")

        updated = await self.repo.update_status(
            event_id=event_id,
            new_status=new_status,
            notes=notes,
        )
        assert updated is not None

        await audit_log_action(
            self.db,
            actor_id=admin_id,
            actor_role="admin",
            action="review_safety_event",
            target_type="safety_event",
            target_id=updated.id,
            details={
                "status": new_status,
                "notes": notes,
                "previous_status": event.status if event.status != new_status else None,
            },
            ip=ip,
        )
        await self.db.commit()
        await self.db.refresh(updated)
        return _to_item(updated)

    async def export_csv_rows(
        self,
        event_type: str | None,
        severity: int | None,
        status: str | None,
        from_date: date | None,
        to_date: date | None,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ):
        """Yield anonymized CSV rows. Audit log + commit BEFORE streaming."""
        events, _ = await self.repo.list_with_filters(
            event_type=event_type,
            severity=severity,
            status=status,
            from_date=from_date,
            to_date=to_date,
            page=1,
            page_size=100,
        )

        await audit_log_action(
            self.db,
            actor_id=admin_id,
            actor_role="admin",
            action="export_data",
            target_type="safety_event",
            target_id=None,
            details={
                "resource": "safety_events",
                "filters": {
                    "event_type": event_type,
                    "severity": severity,
                    "status": status,
                    "from": from_date.isoformat() if from_date else None,
                    "to": to_date.isoformat() if to_date else None,
                },
                "rows": len(events),
            },
            ip=ip,
        )
        await self.db.commit()

        yield [
            "id",
            "event_type",
            "session_id_hash",
            "user_id_hash",
            "severity",
            "status",
            "created_at",
        ]
        for e in events:
            sev = _extract_severity(e.payload)
            yield [
                str(e.id),
                _hash16(e.session_id) if e.session_id is not None else "",
                _hash16(e.user_id) if e.user_id is not None else "",
                e.event_type,
                "" if sev is None else str(sev),
                e.status,
                e.created_at.isoformat() if e.created_at else "",
            ]
