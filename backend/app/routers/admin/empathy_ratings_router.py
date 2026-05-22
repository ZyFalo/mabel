"""Admin Empathy Ratings router — Fase 8.1 Capability 3 (research-analytics-backend).

Endpoints (all under ``/api/v1/admin/empathy-ratings``):
- GET   ``/queue?limit=&cohort=``  — Sampling of unrated assistant messages (D-07)
- GET   ``/rated?cohort=``         — All ratings of the cohort (cross-rater)
- POST  ``/``                       — Create a rating (writes audit_log, D-12)
- PATCH ``/{rating_id}``           — Update an existing rating (only owner)
- GET   ``/stats?cohort=``         — Aggregate stats used by Tab E (D-06)

All endpoints require admin role.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_admin
from app.models.user import User
from app.schemas.admin import (
    EmpathyQueueItem,
    EmpathyQueueResponse,
    EmpathyRatedItem,
    EmpathyRatedResponse,
    EmpathyRatingCreate,
    EmpathyRatingItem,
    EmpathyRatingUpdate,
)
from app.services.admin.empathy_service import AdminEmpathyService

router = APIRouter(prefix="/admin/empathy-ratings", tags=["admin"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


@router.get("/queue", response_model=EmpathyQueueResponse)
async def get_queue(
    limit: int = Query(default=20, ge=1, le=100),
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmpathyQueueResponse:
    """Return the rater's pending queue along with the true `total_pending`.

    The wrapper shape lets the UI render an honest "mostrando N de M" counter
    and hide the "Cargar más" button once the loaded batch covers every
    pending message (see frontend EmpathyRatings.tsx).
    """
    service = AdminEmpathyService(db)
    result = await service.get_queue(
        rater_id=current_user.id, cohort=cohort, limit=limit
    )
    return EmpathyQueueResponse(
        items=[EmpathyQueueItem(**item) for item in result["items"]],
        total_pending=result["total_pending"],
    )


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


@router.get("/rated", response_model=EmpathyRatedResponse)
async def list_rated(
    cohort: str | None = Query(default=None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmpathyRatedResponse:
    """Return all ratings for assistant messages of the cohort, cross-rater.

    Backs the "Calificadas" tab of the empathy ratings UI. Includes ratings
    authored by other admins (with the `is_mine` flag set accordingly) so
    the panel can render inter-rater reliability context. Edits remain
    restricted to the rating owner — see PATCH below.
    """
    service = AdminEmpathyService(db)
    result = await service.list_rated(rater_id=current_user.id, cohort=cohort)
    return EmpathyRatedResponse(
        items=[EmpathyRatedItem(**item) for item in result["items"]],
        total=result["total"],
    )


@router.patch("/{rating_id}", response_model=EmpathyRatingItem)
async def update_rating(
    rating_id: uuid.UUID,
    body: EmpathyRatingUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmpathyRatingItem:
    """Update score and/or criteria of an existing rating.

    Only the rater that originally created the rating can edit it (HTTP 403
    otherwise). Sets `updated_at = now()` and writes an `empathy_rate_updated`
    entry to audit_logs with a diff of the previous values.
    """
    service = AdminEmpathyService(db)
    try:
        rating = await service.update_rating(
            rating_id=rating_id,
            rater_id=current_user.id,
            score=body.score,
            criteria=body.criteria,
            ip=_client_ip(request),
        )
    except ValueError as e:
        msg = str(e)
        if msg == "RATING_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Calificación no encontrada",
            )
        if msg == "FORBIDDEN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el autor de la calificación puede editarla",
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
