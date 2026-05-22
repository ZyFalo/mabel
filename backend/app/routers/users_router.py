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
    format: ExportFormatEnum = ExportFormatEnum.json,
    current_user: User = Depends(require_role("student")),
    service: AccountService = Depends(_get_account_service),
):
    data = await service.export_data(current_user.id, format.value)
    if format == ExportFormatEnum.csv:
        return PlainTextResponse(
            content=data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=mabel-datos.csv"},
        )
    return data
