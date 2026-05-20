"""Admin Audit Logs router — Capability 5 (admin-config-audit).

Endpoints:
- GET /api/v1/admin/logs
- GET /api/v1/admin/logs/export.csv

Append-only by design — no PATCH or DELETE.

Privacy/audit rules:
- Admin emails are masked to `{first_char}***@{domain}` (D-04) in the API.
- CSV anonymizes `admin_id` and `target_id` via `sha256(value)[:16]` (D-08).
- The CSV export action is itself audited (`action="export_data"`,
  `details.resource="logs"`).
"""

from __future__ import annotations

import csv
import hashlib
import io
import uuid
from datetime import UTC, date, datetime, time

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_admin
from app.models.user import User
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.admin import AuditLogItem, PaginatedResponse
from app.services.audit_service import audit_log_action

router = APIRouter(prefix="/admin/logs", tags=["admin"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


def _sha16(value) -> str:
    if value is None:
        return ""
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]


def _mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    local, _, domain = email.partition("@")
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


def _to_datetime_start(value: date | None) -> datetime | None:
    if value is None:
        return None
    return datetime.combine(value, time.min, tzinfo=UTC)


def _to_datetime_end(value: date | None) -> datetime | None:
    if value is None:
        return None
    return datetime.combine(value, time.max, tzinfo=UTC)


async def _resolve_admin_emails(db: AsyncSession, admin_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Batch lookup admin emails for masking (single query, no N+1)."""
    if not admin_ids:
        return {}
    result = await db.execute(select(User.id, User.email).where(User.id.in_(admin_ids)))
    return {row.id: row.email for row in result}


@router.get("", response_model=PaginatedResponse[AuditLogItem])
async def list_admin_logs(
    admin_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[AuditLogItem]:
    repo = AuditLogRepository(db)
    items, total = await repo.list_with_filters(
        admin_id=admin_id,
        action=action,
        from_date=_to_datetime_start(from_),
        to_date=_to_datetime_end(to),
        page=page,
        page_size=page_size,
    )

    # Batch-resolve admin emails for masking (single SELECT).
    admin_ids = {row.admin_id for row in items if row.admin_id is not None}
    email_map = await _resolve_admin_emails(db, admin_ids)

    out: list[AuditLogItem] = []
    for row in items:
        email = email_map.get(row.admin_id) if row.admin_id else None
        out.append(
            AuditLogItem(
                id=row.id,
                admin_id=row.admin_id,
                admin_email_masked=_mask_email(email),
                action=row.action,
                target_type=row.target_type,
                target_id=str(row.target_id) if row.target_id else None,
                details=row.detail,
                ip=row.ip_address,
                created_at=row.created_at,
            )
        )
    return PaginatedResponse[AuditLogItem](items=out, total=total, page=page, page_size=page_size)


@router.get("/export.csv")
async def export_admin_logs_csv(
    request: Request,
    admin_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Audit the export action BEFORE streaming so it persists even if the
    # client disconnects mid-stream.
    await audit_log_action(
        db,
        admin_id=current_user.id,
        action="export_data",
        target_type="audit_logs",
        target_id=None,
        details={
            "resource": "logs",
            "filters": {
                "admin_id": str(admin_id) if admin_id else None,
                "action": action,
                "from": from_.isoformat() if from_ else None,
                "to": to.isoformat() if to else None,
            },
        },
        ip=_client_ip(request),
    )
    await db.commit()

    repo = AuditLogRepository(db)
    from_dt = _to_datetime_start(from_)
    to_dt = _to_datetime_end(to)

    async def row_generator():
        # Header row.
        header_buf = io.StringIO()
        csv.writer(header_buf).writerow(
            ["id", "admin_id_hash", "action", "target_type", "target_id_hash", "created_at", "ip"]
        )
        yield header_buf.getvalue()

        page = 1
        page_size = 200
        while True:
            items, _total = await repo.list_with_filters(
                admin_id=admin_id,
                action=action,
                from_date=from_dt,
                to_date=to_dt,
                page=page,
                page_size=page_size,
            )
            if not items:
                break
            for row in items:
                buf = io.StringIO()
                csv.writer(buf).writerow(
                    [
                        str(row.id),
                        _sha16(row.admin_id),
                        row.action,
                        row.target_type or "",
                        _sha16(row.target_id),
                        row.created_at.isoformat(),
                        row.ip_address or "",
                    ]
                )
                yield buf.getvalue()
            if len(items) < page_size:
                break
            page += 1

    return StreamingResponse(
        row_generator(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'},
    )
