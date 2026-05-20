"""Admin Config router — Capability 5 (admin-config-audit).

Endpoints:
- GET   /api/v1/admin/config
- PATCH /api/v1/admin/config/{key}
- POST  /api/v1/admin/consent-versions
- POST  /api/v1/admin/consent-versions/{version_id}/publish
- POST  /api/v1/admin/config/gemini/test

All endpoints require admin role (D-13). Each mutation writes an audit_logs
row inside the same transaction and the router performs ONE commit at the
end (D-12).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_admin
from app.models.user import User
from app.schemas.admin import (
    ConfigUpdateRequest,
    ConsentVersionCreate,
    ConsentVersionItem,
    GeminiTestResponse,
    SystemConfigItem,
)
from app.services.admin.config_service import AdminConfigService
from app.services.audit_service import audit_log_action

router = APIRouter(tags=["admin"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


@router.get("/admin/config", response_model=list[SystemConfigItem])
async def list_admin_config(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[SystemConfigItem]:
    service = AdminConfigService(db)
    rows = await service.list_config()
    return [
        SystemConfigItem(key=r.key, value=r.value, updated_at=r.updated_at) for r in rows
    ]


@router.patch("/admin/config/{key}", response_model=SystemConfigItem)
async def patch_admin_config(
    key: str,
    body: ConfigUpdateRequest,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SystemConfigItem:
    service = AdminConfigService(db)

    # Read current value (for the audit log) first; returns 404 if unknown.
    try:
        old_value = await service.get_current_value(key)
    except ValueError as e:
        if str(e) == "KEY_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Clave de configuracion no encontrada",
            )
        raise

    # Validate + update (no commit).
    try:
        row = await service.update_config(key, body.value)
    except ValueError as e:
        msg = str(e)
        if msg == "KEY_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Clave de configuracion no encontrada",
            )
        if msg.startswith("INVALID_VALUE:"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=msg.split(":", 1)[1].strip(),
            )
        raise

    await audit_log_action(
        db,
        admin_id=current_user.id,
        action="change_config",
        target_type="system_config",
        target_id=None,
        details={"key": key, "old_value": old_value, "new_value": body.value},
        ip=_client_ip(request),
    )
    await db.commit()
    await db.refresh(row)
    return SystemConfigItem(key=row.key, value=row.value, updated_at=row.updated_at)


@router.get(
    "/admin/consent-versions",
    response_model=list[ConsentVersionItem],
)
async def list_admin_consent_versions(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ConsentVersionItem]:
    from app.repositories.consent_version_repository import ConsentVersionRepository

    repo = ConsentVersionRepository(db)
    rows = await repo.list_all()
    return [ConsentVersionItem.model_validate(r) for r in rows]


@router.post(
    "/admin/consent-versions",
    response_model=ConsentVersionItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_admin_consent_version(
    body: ConsentVersionCreate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ConsentVersionItem:
    service = AdminConfigService(db)
    row = await service.create_consent_version(body.version, body.title, body.body)

    await audit_log_action(
        db,
        admin_id=current_user.id,
        action="change_config",
        target_type="consent_version",
        target_id=row.id,
        details={
            "operation": "create",
            "version": body.version,
            "title": body.title,
            "status": "draft",
        },
        ip=_client_ip(request),
    )
    await db.commit()
    await db.refresh(row)
    return ConsentVersionItem.model_validate(row)


@router.post(
    "/admin/consent-versions/{version_id}/publish",
    response_model=ConsentVersionItem,
)
async def publish_admin_consent_version(
    version_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ConsentVersionItem:
    service = AdminConfigService(db)
    try:
        row = await service.publish_consent_version(version_id)
    except ValueError as e:
        msg = str(e)
        if msg == "VERSION_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Version de consentimiento no encontrada",
            )
        if msg == "ALREADY_ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="La version ya esta activa",
            )
        raise

    await audit_log_action(
        db,
        admin_id=current_user.id,
        action="change_config",
        target_type="consent_version",
        target_id=row.id,
        details={
            "operation": "publish",
            "version": row.version,
            "new_status": "active",
        },
        ip=_client_ip(request),
    )
    await db.commit()
    await db.refresh(row)
    return ConsentVersionItem.model_validate(row)


@router.post("/admin/config/gemini/test", response_model=GeminiTestResponse)
async def test_admin_gemini(
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> GeminiTestResponse:
    service = AdminConfigService(db)
    result = await service.gemini_ping()

    # Audit only metadata — never the prompt or response.
    await audit_log_action(
        db,
        admin_id=current_user.id,
        action="change_config",
        target_type="gemini_test",
        target_id=None,
        details={
            "ok": result["ok"],
            "latency_ms": result["latency_ms"],
            "model": result["model"],
            "error": result["error"],
        },
        ip=_client_ip(request),
    )
    await db.commit()
    return GeminiTestResponse(**result)
