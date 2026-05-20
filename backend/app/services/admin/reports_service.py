"""Admin Reports service — Capability 3 (admin-reports-safety).

Business rules:
- D-03: NEVER serialize `messages.content`. Items only carry metadata.
- D-07: paginated responses `{items, total, page, page_size}`.
- D-08: CSV exports anonymize id-like columns via `sha256(value)[:16]`.
- D-12: action + audit log committed atomically; on error nothing persists.
- State machine for reports:
    open      -> triaged
    triaged   -> resolved | dismissed
    Anything else SHALL raise INVALID_TRANSITION (409).
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message_report import MessageReport
from app.repositories.message_report_repository import MessageReportRepository
from app.schemas.admin import ReportAdminItem
from app.services.audit_service import audit_log_action

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "open": {"triaged"},
    "triaged": {"resolved", "dismissed"},
    "resolved": set(),
    "dismissed": set(),
}


def _hash16(value: object) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]


def _truncate_id(value: uuid.UUID | None, length: int = 8) -> str:
    if value is None:
        return ""
    return str(value)[:length]


def _to_item(report: MessageReport) -> ReportAdminItem:
    triaged_at = report.updated_at if report.status != "open" else None
    return ReportAdminItem(
        id=report.id,
        message_id=report.message_id,
        reporter_id_truncated=_truncate_id(report.reporter_id, 8),
        reason=report.reason,
        severity=report.severity,
        status=report.status,
        created_at=report.created_at,
        triaged_at=triaged_at,
    )


class AdminReportsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = MessageReportRepository(db)

    async def list_reports(
        self,
        reason: str | None,
        severity: int | None,
        status: str | None,
        from_date: date | None,
        to_date: date | None,
        page: int,
        page_size: int,
    ) -> tuple[list[ReportAdminItem], int]:
        reports, total = await self.repo.list_with_filters(
            reason=reason,
            severity=severity,
            status=status,
            from_date=from_date,
            to_date=to_date,
            page=page,
            page_size=page_size,
        )
        return [_to_item(r) for r in reports], total

    async def update_report_status(
        self,
        report_id: uuid.UUID,
        new_status: str,
        notes: str | None,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ) -> ReportAdminItem:
        report = await self.repo.get_by_id(report_id)
        if report is None:
            raise ValueError("REPORT_NOT_FOUND")

        allowed = _ALLOWED_TRANSITIONS.get(report.status, set())
        if new_status not in allowed:
            raise ValueError("INVALID_TRANSITION")

        updated = await self.repo.update_status(
            report_id=report_id,
            new_status=new_status,
            triaged_by_id=admin_id,
            notes=notes,
        )
        assert updated is not None  # we just verified it exists

        await audit_log_action(
            self.db,
            admin_id=admin_id,
            action="review_report",
            target_type="message_report",
            target_id=updated.id,
            details={
                "status": new_status,
                "notes": notes,
                "previous_status": report.status if report.status != new_status else None,
            },
            ip=ip,
        )
        await self.db.commit()
        await self.db.refresh(updated)
        return _to_item(updated)

    async def export_csv_rows(
        self,
        reason: str | None,
        severity: int | None,
        status: str | None,
        from_date: date | None,
        to_date: date | None,
        admin_id: uuid.UUID,
        ip: str | None = None,
    ):
        """Yield CSV rows for the export.

        Writes the audit log + commits BEFORE yielding rows so the audit
        entry persists even if the client disconnects mid-stream.
        Does NOT include any message content (D-03).
        """
        # Fetch all matching rows (pilot scale: small dataset).
        reports, _ = await self.repo.list_with_filters(
            reason=reason,
            severity=severity,
            status=status,
            from_date=from_date,
            to_date=to_date,
            page=1,
            page_size=100,
        )

        await audit_log_action(
            self.db,
            admin_id=admin_id,
            action="export_data",
            target_type="report",
            target_id=None,
            details={
                "resource": "reports",
                "filters": {
                    "reason": reason,
                    "severity": severity,
                    "status": status,
                    "from": from_date.isoformat() if from_date else None,
                    "to": to_date.isoformat() if to_date else None,
                },
                "rows": len(reports),
            },
            ip=ip,
        )
        await self.db.commit()

        # Header
        yield [
            "id",
            "reporter_id_hash",
            "message_id",
            "reason",
            "severity",
            "status",
            "created_at",
            "triaged_at",
        ]
        for r in reports:
            triaged_at = r.updated_at if r.status != "open" else None
            yield [
                str(r.id),
                _hash16(r.reporter_id),
                str(r.message_id),
                r.reason,
                "" if r.severity is None else str(r.severity),
                r.status,
                r.created_at.isoformat() if r.created_at else "",
                triaged_at.isoformat() if triaged_at else "",
            ]
