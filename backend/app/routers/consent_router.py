from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_role
from app.models.user import User
from app.repositories.consent_repository import ConsentRepository
from app.repositories.consent_version_repository import ConsentVersionRepository
from app.schemas.consent import (
    AcceptConsentRequest,
    ConsentResponse,
    ConsentStatusResponse,
    ConsentVersionResponse,
    PatchConsentRequest,
)
from app.services.consent_service import ConsentService

router = APIRouter(tags=["consent"])


def _get_consent_service(db: AsyncSession = Depends(get_db)) -> ConsentService:
    return ConsentService(ConsentRepository(db), ConsentVersionRepository(db))


@router.get("/consent-versions/active", response_model=ConsentVersionResponse)
async def get_active_consent_version(
    _: User = Depends(get_current_user),
    service: ConsentService = Depends(_get_consent_service),
):
    version = await service.get_active_version()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay version de consentimiento activa",
        )
    return version


@router.post(
    "/consents",
    response_model=ConsentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def accept_consent(
    request: AcceptConsentRequest,
    current_user: User = Depends(require_role("student")),
    service: ConsentService = Depends(_get_consent_service),
):
    try:
        return await service.accept_consent(
            user_id=current_user.id,
            consent_version_id=request.consent_version_id,
            scope=request.scope.value,
        )
    except ValueError as e:
        msg = str(e)
        if msg == "INVALID_VERSION":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Version de consentimiento no encontrada o no esta activa",
            )
        if msg == "DUPLICATE_CONSENT":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un registro para esta version. Usa PATCH para re-aceptar.",
            )
        raise


@router.patch("/consents/current", response_model=ConsentResponse)
async def patch_consent(
    request: PatchConsentRequest,
    current_user: User = Depends(require_role("student")),
    service: ConsentService = Depends(_get_consent_service),
):
    try:
        return await service.patch_consent(
            user_id=current_user.id,
            action=request.action.value,
            scope=request.scope.value if request.scope else None,
        )
    except ValueError as e:
        msg = str(e)
        if msg == "NO_ACTIVE_VERSION":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No hay version de consentimiento activa",
            )
        if msg == "NO_CONSENT_FOR_VERSION":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No existe consentimiento para la version activa. Usa POST para aceptar.",
            )
        if msg == "ALREADY_ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El consentimiento ya esta activo",
            )
        if msg == "SCOPE_REQUIRED":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="El scope es requerido para re-aceptar",
            )
        if msg == "ALREADY_SOLO_USO":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El scope ya es solo_uso",
            )
        if msg == "CONSENT_REVOKED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No se puede reducir scope de un consentimiento revocado",
            )
        if msg == "ALREADY_REVOKED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El consentimiento ya esta revocado",
            )
        if msg == "UNSUPPORTED_ACTION":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Accion no soportada",
            )
        raise


@router.get("/users/me/consent-status", response_model=ConsentStatusResponse)
async def get_consent_status(
    current_user: User = Depends(get_current_user),
    service: ConsentService = Depends(_get_consent_service),
):
    return await service.get_consent_status(current_user.id)
