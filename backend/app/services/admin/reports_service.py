"""Admin Reports service — Capability 3 (admin-reports-safety).

Business rules:
- D-03: NEVER serialize `messages.content`. Items only carry metadata.
- D-07: paginated responses `{items, total, page, page_size}`.
- D-08: CSV exports anonymize id-like columns via `sha256(value)[:16]`.
- D-12: action + audit log committed atomically; on error nothing persists.
- State machine for reports:
    open      -> triaged | dismissed
    triaged   -> resolved | dismissed
    Anything else SHALL raise INVALID_TRANSITION (409).

    Rationale: trivial reports (spam, duplicates, false positives) can be
    dismissed without requiring an explicit triage step — that reduces
    friction without sacrificing rigor, because RESOLVING (which implies
    a corrective action was taken) still demands prior triage.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message_report import MessageReport
from app.repositories.message_report_repository import MessageReportRepository
from app.schemas.admin import ReportAdminItem, ReportNoteEntry
from app.services.audit_service import audit_log_action

# Matches one note entry as written by message_report_repository.update_status:
#   `[2026-05-22T18:30:00Z] resolved: short text`
# Group 1 = timestamp, group 2 = new_status, group 3 = note body.
_NOTE_ENTRY_RE = re.compile(
    r"^\[(?P<at>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\]\s+"
    r"(?P<status>open|triaged|resolved|dismissed):\s*(?P<notes>.*)$",
)


def _split_details(details: str | None) -> tuple[str | None, list[ReportNoteEntry]]:
    """Split the `details` blob into (reporter_context, admin_notes_history).

    Convention used by `message_report_repository.update_status`:
      - The reporter's original free-text context (if any) is written by
        `report_service.report_message` BEFORE any admin touches the row,
        so it lives as plain text WITHOUT the `[timestamp] status:` prefix.
      - Each admin transition APPENDS a line in the form
        `[ISO_timestamp] <new_status>: <notes>`.

    Therefore: lines matching the admin pattern → `notes_history`. Any
    remaining non-matching lines → joined back into `reporter_context`.
    This prevents the admin UI from mis-attributing the student's words
    as an admin note (which the previous unified parser caused).
    """
    if not details:
        return None, []
    reporter_lines: list[str] = []
    admin_entries: list[ReportNoteEntry] = []
    for raw_line in details.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        match = _NOTE_ENTRY_RE.match(line)
        if match:
            try:
                ts = datetime.strptime(match.group("at"), "%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                ts = None
            admin_entries.append(
                ReportNoteEntry(
                    at=ts,
                    status=match.group("status"),
                    notes=match.group("notes") or None,
                )
            )
        else:
            reporter_lines.append(line)
    reporter_context = "\n".join(reporter_lines) if reporter_lines else None
    return reporter_context, admin_entries


def _derive_triaged_at(report: MessageReport) -> datetime | None:
    """Approximate `triaged_at` from `updated_at`.

    The table has no dedicated `triaged_at` column. We treat `updated_at` as
    the triage timestamp ONLY when the report went through triage — i.e. its
    current status is `triaged` or `resolved`. Reports dismissed straight from
    `open` (allowed by the state machine since the open→dismissed shortcut)
    never went through triage, so we must NOT report `updated_at` as
    `triaged_at` for them — that would inflate the "tiempo promedio hasta
    triaje" indicator.
    """
    if report.status in ("triaged", "resolved"):
        return report.updated_at
    return None

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "open": {"triaged", "dismissed"},
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
    reporter_context, notes_history = _split_details(report.details)
    return ReportAdminItem(
        id=report.id,
        message_id=report.message_id,
        reporter_id=report.reporter_id,
        reporter_id_truncated=_truncate_id(report.reporter_id, 8),
        reason=report.reason,
        severity=report.severity,
        status=report.status,
        created_at=report.created_at,
        triaged_at=_derive_triaged_at(report),
        reporter_context=reporter_context,
        notes_history=notes_history,
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
            actor_id=admin_id,
            actor_role="admin",
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
            actor_id=admin_id,
            actor_role="admin",
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
            triaged_at = _derive_triaged_at(r)
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
