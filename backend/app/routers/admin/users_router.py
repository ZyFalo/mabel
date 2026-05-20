"""Admin Users router — Capability 2 (admin-users).

Endpoints:
- GET    /api/v1/admin/users
- GET    /api/v1/admin/users/{user_id}
- PATCH  /api/v1/admin/users/{user_id}/disable

All endpoints require admin role (`require_admin`).
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_admin
from app.models.user import User
from app.schemas.admin import (
    DisableUserRequest,
    PaginatedResponse,
    SetCohortRequest,
    UserAdminDetail,
    UserAdminListItem,
)
from app.services.admin.users_service import AdminUsersService

router = APIRouter(prefix="/admin/users", tags=["admin"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


@router.get("", response_model=PaginatedResponse[UserAdminListItem])
async def list_admin_users(
    q: str | None = Query(default=None),
    status_filter: Literal["active", "disabled"] | None = Query(default=None, alias="status"),
    consent_status: Literal["ok", "no_consent", "revoked", "new_version_required"]
    | None = Query(default=None),
    created_from: date | None = Query(default=None),
    created_to: date | None = Query(default=None),
    cohort: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[UserAdminListItem]:
    service = AdminUsersService(db)
    items, total = await service.list_users(
        q=q,
        status=status_filter,
        consent_status=consent_status,
        created_from=created_from,
        created_to=created_to,
        cohort=cohort,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse[UserAdminListItem](
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{user_id}", response_model=UserAdminDetail)
async def get_admin_user_detail(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserAdminDetail:
    service = AdminUsersService(db)
    detail = await service.get_user_detail(
        user_id=user_id,
        admin_id=current_user.id,
        ip=_client_ip(request),
    )
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
        )
    return detail


@router.patch("/{user_id}/disable")
async def disable_admin_user(
    user_id: uuid.UUID,
    body: DisableUserRequest,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    service = AdminUsersService(db)
    try:
        await service.disable_user(
            user_id=user_id,
            reason=body.reason,
            admin_id=current_user.id,
            ip=_client_ip(request),
        )
    except ValueError as e:
        msg = str(e)
        if msg == "USER_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
            )
        if msg == "CANNOT_DISABLE_ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No se puede deshabilitar a un administrador",
            )
        if msg == "ALREADY_DISABLED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El usuario ya esta deshabilitado",
            )
        raise

    return {"status": "disabled", "user_id": str(user_id)}


@router.patch("/{user_id}/cohort")
async def set_user_cohort(
    user_id: uuid.UUID,
    body: SetCohortRequest,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Assign or clear a user's research cohort. Admin-only (Fase 8.1)."""
    service = AdminUsersService(db)
    try:
        user = await service.set_cohort(
            user_id=user_id,
            cohort=body.cohort,
            admin_id=current_user.id,
            ip=_client_ip(request),
        )
    except ValueError as e:
        if str(e) == "USER_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
            )
        raise

    return {"id": str(user.id), "cohort": user.cohort}
