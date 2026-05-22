"""Admin Metrics router — Capability 4 (admin-metrics).

Endpoints:
- GET /api/v1/admin/dashboard
- GET /api/v1/admin/metrics/usage
- GET /api/v1/admin/metrics/wellbeing
- GET /api/v1/admin/metrics/technical
- GET /api/v1/admin/metrics/safety
- GET /api/v1/admin/metrics/study
- GET /api/v1/admin/metrics/export.csv?tab=...

All endpoints require admin role (D-13). NEVER returns messages.content (D-03).
CSV exports anonymize id-like columns via SHA-256 truncated (D-08) and emit an
`export_data` audit log (per spec).
"""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_admin
from app.models.user import User
from app.services.admin.metrics_service import AdminMetricsService
from app.services.audit_service import audit_log_action

router = APIRouter(tags=["admin"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


@router.get("/admin/dashboard")
async def get_dashboard(
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AdminMetricsService(db)
    return await service.dashboard_kpis(cohort=cohort)


@router.get("/admin/metrics/usage")
async def get_metrics_usage(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AdminMetricsService(db)
    return await service.metrics_usage(from_date, to_date, cohort=cohort)


@router.get("/admin/metrics/wellbeing")
async def get_metrics_wellbeing(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AdminMetricsService(db)
    return await service.metrics_wellbeing(from_date, to_date, cohort=cohort)


@router.get("/admin/metrics/technical")
async def get_metrics_technical(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AdminMetricsService(db)
    return await service.metrics_technical(from_date, to_date, cohort=cohort)


@router.get("/admin/metrics/safety")
async def get_metrics_safety(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AdminMetricsService(db)
    return await service.metrics_safety(from_date, to_date, cohort=cohort)


@router.get("/admin/metrics/study")
async def get_metrics_study(
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AdminMetricsService(db)
    return await service.metrics_study(cohort=cohort)


@router.get("/admin/metrics/export.csv")
async def export_metrics_csv(
    request: Request,
    tab: Literal["usage", "wellbeing", "technical", "safety", "study"] = Query(...),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminMetricsService(db)

    # Audit log BEFORE streaming (so it persists even if client disconnects mid-stream).
    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="admin",
        action="export_data",
        target_type="metrics",
        target_id=None,
        details={
            "tab": tab,
            "from": from_date.isoformat() if from_date else None,
            "to": to_date.isoformat() if to_date else None,
            "cohort": cohort,
        },
        ip=_client_ip(request),
    )
    await db.commit()

    async def row_generator():
        async for row in service.export_csv(
            tab=tab, from_date=from_date, to_date=to_date, cohort=cohort
        ):
            buf = io.StringIO()
            csv.writer(buf).writerow(row)
            yield buf.getvalue()

    return StreamingResponse(
        row_generator(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="metrics_{tab}.csv"',
        },
    )
