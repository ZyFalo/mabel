from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_role
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import UserResponse
from app.schemas.preferences import DeleteAccountRequest, ExportFormatEnum
from app.services.account_service import AccountService
from app.services.audit_service import audit_log_action

router = APIRouter(prefix="/users", tags=["users"])


def _get_account_service(db: AsyncSession = Depends(get_db)) -> AccountService:
    return AccountService(UserRepository(db), db)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.delete("/me")
async def delete_account(
    request: DeleteAccountRequest,
    http_request: Request,
    current_user: User = Depends(require_role("student")),
    service: AccountService = Depends(_get_account_service),
):
    ip = http_request.client.host if http_request.client else None
    try:
        await service.delete_account(current_user.id, request.confirmation, ip=ip)
    except ValueError as e:
        msg = str(e)
        if msg == "INVALID_CONFIRMATION":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debes escribir ELIMINAR para confirmar",
            )
        raise
    return {"message": "Cuenta eliminada exitosamente"}


@router.get("/me/export")
async def export_data(
    http_request: Request,
    format: ExportFormatEnum = ExportFormatEnum.json,
    current_user: User = Depends(require_role("student")),
    service: AccountService = Depends(_get_account_service),
    db: AsyncSession = Depends(get_db),
):
    data = await service.export_data(current_user.id, format.value)
    # Audit trail Ley 1581 art. 25 (registro de operaciones de acceso a
    # data personal). Se emite DESPUÉS del fetch (si export_data raise
    # antes, no se loguea — coherente: solo se audita lo exitoso).
    # target_type="user" para mantener consistencia con el vocabulario
    # del resto del codebase (account_service.py:51 usa el mismo string
    # para el self-delete). El matiz "self" vs export admin va en
    # details.resource — no en target_type.
    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="student",  # require_role('student') ya lo garantiza; explícito > Mapped[str]
        action="export_data",
        target_type="user",
        target_id=current_user.id,
        details={"resource": "self", "format": format.value},
        ip=http_request.client.host if http_request.client else None,
    )
    await db.commit()
    if format == ExportFormatEnum.csv:
        return PlainTextResponse(
            content=data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=mabel-datos.csv"},
        )
    return data
