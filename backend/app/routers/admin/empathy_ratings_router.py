"""Admin Empathy Ratings router — Fase 8.1 Capability 3 (research-analytics-backend).

Endpoints (all under ``/api/v1/admin/empathy-ratings``):
- GET  ``/queue?limit=&cohort=``  — Sampling of unrated assistant messages (D-07)
- POST ``/``                      — Create a rating (writes audit_log, D-12)
- GET  ``/stats?cohort=``         — Aggregate stats used by Tab E (D-06)

All endpoints require admin role.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_admin
from app.models.user import User
from app.schemas.admin import (
    EmpathyQueueItem,
    EmpathyRatingCreate,
    EmpathyRatingItem,
)
from app.services.admin.empathy_service import AdminEmpathyService

router = APIRouter(prefix="/admin/empathy-ratings", tags=["admin"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


@router.get("/queue", response_model=list[EmpathyQueueItem])
async def get_queue(
    limit: int = Query(default=20, ge=1, le=100),
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[EmpathyQueueItem]:
    service = AdminEmpathyService(db)
    items = await service.get_queue(
        rater_id=current_user.id, cohort=cohort, limit=limit
    )
    return [EmpathyQueueItem(**item) for item in items]


@router.post(
    "",
    response_model=EmpathyRatingItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_rating(
    body: EmpathyRatingCreate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmpathyRatingItem:
    service = AdminEmpathyService(db)
    try:
        rating = await service.create_rating(
            rater_id=current_user.id,
            message_id=body.message_id,
            score=body.score,
            criteria=body.criteria,
            ip=_client_ip(request),
        )
    except ValueError as e:
        msg = str(e)
        if msg == "ALREADY_RATED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya calificaste este mensaje",
            )
        if msg == "INVALID_SCORE":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Score fuera de rango (1-5)",
            )
        raise

    return EmpathyRatingItem.model_validate(rating)


@router.get("/stats")
async def get_stats(
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AdminEmpathyService(db)
    return await service.get_stats(cohort=cohort)
