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
from app.repositories.system_config_repository import SystemConfigRepository
from app.schemas.admin import (
    ConfigUpdateRequest,
    ConsentVersionCreate,
    ConsentVersionItem,
    GeminiTestResponse,
    LLMInfoResponse,
    ServicesHealthResponse,
    SystemConfigItem,
)
from app.services.admin.config_service import AdminConfigService
from app.services.audit_service import audit_log_action

# Keys protected by the research study lock (Fase 8.1, D-04).
STUDY_LOCKED_KEYS = frozenset(
    {"safety_keywords", "sos_severity_threshold", "guardrails_enabled"}
)

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

    # Study lock middleware (Fase 8.1, D-04). The `study_lock_enabled` key is
    # itself exempt — admins must always be able to toggle the lock off.
    override_header = request.headers.get("X-Study-Lock-Override", "").lower() == "true"
    if key in STUDY_LOCKED_KEYS:
        config_repo = SystemConfigRepository(db)
        lock_row = await config_repo.get_row("study_lock_enabled")
        lock_value = lock_row.value if lock_row is not None else False
        if isinstance(lock_value, str):
            lock_value = lock_value.lower() == "true"
        if bool(lock_value) and not override_header:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"STUDY_LOCK_ENABLED:{key}",
            )

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

    audit_details: dict = {
        "key": key,
        "old_value": old_value,
        "new_value": body.value,
    }
    if key in STUDY_LOCKED_KEYS and override_header:
        audit_details["override"] = True

    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="admin",
        action="change_config",
        target_type="system_config",
        target_id=None,
        details=audit_details,
        ip=_client_ip(request),
    )
    await db.commit()
    await db.refresh(row)
    # F1 LLM switch: no requiere invalidación de cache de proceso —
    # `get_llm_provider()` lee la key per-request via
    # SystemConfigRepository, así que el próximo turno ya usa el valor
    # actualizado (resuelve el problema multi-worker que tendría un
    # cache global). CR-03 review 2026-05-25.
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
        actor_id=current_user.id,
        actor_role="admin",
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
        actor_id=current_user.id,
        actor_role="admin",
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


@router.delete(
    "/admin/consent-versions/{version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_admin_consent_version_draft(
    version_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hard-delete a draft consent_version.

    Only drafts can be deleted. Trying to delete an active or archived
    version returns HTTP 409 — both are legal artifacts that must
    persist (active because users are bound by it; archived because
    auditors need to know what text was in force in the past).

    The audit_log row is emitted BEFORE the delete commit so the
    `target_id` still resolves at the moment of writing; after commit
    that id will be dangling, which is acceptable for an
    intentionally-discarded draft.
    """
    service = AdminConfigService(db)
    try:
        snapshot = await service.delete_consent_version_draft(version_id)
    except ValueError as e:
        msg = str(e)
        if msg == "VERSION_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Version de consentimiento no encontrada",
            ) from e
        if msg == "NOT_DRAFT":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Solo se pueden eliminar borradores. Las versiones activas o "
                    "archivadas son parte del registro legal y no se pueden borrar."
                ),
            ) from e
        if msg == "HAS_REFERENCES":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No se puede eliminar este borrador porque otro admin lo "
                    "publicó mientras tanto y ya hay usuarios que lo aceptaron."
                ),
            ) from e
        raise

    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="admin",
        action="change_config",
        target_type="consent_version",
        target_id=snapshot.id,
        details={
            "operation": "delete_draft",
            "version": snapshot.version,
            "title": snapshot.title,
        },
        ip=_client_ip(request),
    )
    await db.commit()
    # 204 No Content — no body returned.


@router.get("/admin/services-health", response_model=ServicesHealthResponse)
async def get_admin_services_health(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ServicesHealthResponse:
    """Real-time snapshot of backend dependency health for #05.

    Replaces the previous frontend-only mock that hardcoded "Configurado"
    for TTS / ASR regardless of whether the binary or model was actually
    present. Probes DB, LLM (via cached last_test), Piper, faster-whisper
    and uptime. No audit log — pure metadata read with no side effects.
    """
    service = AdminConfigService(db)
    return ServicesHealthResponse(**await service.get_services_health())


@router.get("/admin/llm-info", response_model=LLMInfoResponse)
async def get_admin_llm_info(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LLMInfoResponse:
    """Read-only snapshot of the LLM configuration for /admin/config #04.

    Returns provider / endpoint / model / api_key (masked) / timeout +
    last_test info. Every field except last_test is sourced from process
    settings (`.env`) — to change them, edit `.env` and restart the
    backend. The API key is NEVER returned raw, only masked.

    No audit log: this is a pure read of non-sensitive metadata (the
    one sensitive field, the API key, is masked at the service layer).
    """
    service = AdminConfigService(db)
    info = await service.get_llm_info()
    return LLMInfoResponse(**info)


@router.post("/admin/config/gemini/test", response_model=GeminiTestResponse)
async def test_admin_gemini(
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> GeminiTestResponse:
    """Run an LLM connectivity ping and persist the result.

    D-12 compliance: `gemini_ping` flushes the `llm_last_test` UPSERT
    inside a SAVEPOINT but does NOT commit. This router writes the
    audit_log row and then performs the SINGLE commit that persists
    both the UPSERT and the audit log atomically. Before 2026-05-23
    the service was committing the UPSERT separately, which split the
    audit trail (Ley 1581 risk) — see docs/ADMIN_PANEL.md §11.ter F1.
    """
    service = AdminConfigService(db)
    result = await service.gemini_ping()

    # Audit only metadata — never the prompt or response.
    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="admin",
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
    # F8: response carries `last_test` so the frontend can hydrate the
    # chip without a second GET /admin/llm-info call. The service
    # returns the same payload it persisted, so client and BD stay in
    # sync after a single roundtrip.
    return GeminiTestResponse(
        ok=result["ok"],
        latency_ms=result["latency_ms"],
        model=result["model"],
        error=result["error"],
        last_test=result.get("last_test"),
    )
