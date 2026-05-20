"""Admin Reports router — Capability 3 (admin-reports-safety).

Endpoints:
- GET    /api/v1/admin/reports
- PATCH  /api/v1/admin/reports/{report_id}
- GET    /api/v1/admin/reports/export.csv

All endpoints require admin role. NEVER returns `messages.content` (D-03).
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_admin
from app.models.user import User
from app.schemas.admin import PaginatedResponse, ReportAdminItem, ReportStatusUpdate
from app.services.admin.reports_service import AdminReportsService

router = APIRouter(prefix="/admin/reports", tags=["admin"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


@router.get("", response_model=PaginatedResponse[ReportAdminItem])
async def list_admin_reports(
    reason: Literal["hallucination", "harmful", "privacy", "low_empathy", "other"] | None = Query(default=None),
    severity: int | None = Query(default=None, ge=1, le=5),
    status_filter: Literal["open", "triaged", "resolved", "dismissed"] | None = Query(default=None, alias="status"),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[ReportAdminItem]:
    service = AdminReportsService(db)
    items, total = await service.list_reports(
        reason=reason,
        severity=severity,
        status=status_filter,
        from_date=from_,
        to_date=to,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse[ReportAdminItem](
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/export.csv")
async def export_reports_csv(
    request: Request,
    reason: Literal["hallucination", "harmful", "privacy", "low_empathy", "other"] | None = Query(default=None),
    severity: int | None = Query(default=None, ge=1, le=5),
    status_filter: Literal["open", "triaged", "resolved", "dismissed"] | None = Query(default=None, alias="status"),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminReportsService(db)

    async def row_generator():
        async for row in service.export_csv_rows(
            reason=reason,
            severity=severity,
            status=status_filter,
            from_date=from_,
            to_date=to,
            admin_id=current_user.id,
            ip=_client_ip(request),
        ):
            buf = io.StringIO()
            csv.writer(buf).writerow(row)
            yield buf.getvalue()

    return StreamingResponse(
        row_generator(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="reports.csv"'},
    )


@router.patch("/{report_id}", response_model=ReportAdminItem)
async def patch_admin_report(
    report_id: uuid.UUID,
    body: ReportStatusUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ReportAdminItem:
    service = AdminReportsService(db)
    try:
        return await service.update_report_status(
            report_id=report_id,
            new_status=body.status,
            notes=body.notes,
            admin_id=current_user.id,
            ip=_client_ip(request),
        )
    except ValueError as e:
        msg = str(e)
        if msg == "REPORT_NOT_FOUND":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reporte no encontrado")
        if msg == "INVALID_TRANSITION":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Transicion de estado invalida",
            )
        raise
