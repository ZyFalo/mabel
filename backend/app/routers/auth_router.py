from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.password_reset_repository import PasswordResetRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenValidationResponse,
    UserResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(UserRepository(db), PasswordResetRepository(db))


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, service: AuthService = Depends(_get_auth_service)):
    try:
        return await service.register(request.email, request.password, request.display_name)
    except ValueError as e:
        if str(e) == "DUPLICATE_EMAIL":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email ya esta registrado")
        raise


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, service: AuthService = Depends(_get_auth_service)):
    try:
        return await service.login(request.email, request.password, request.remember_me)
    except ValueError as e:
        msg = str(e)
        if msg == "INVALID_CREDENTIALS":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales invalidas")
        if msg.startswith("DISABLED:"):
            reason = msg.split(":", 1)[1]
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Cuenta deshabilitada: {reason}")
        raise


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    request: ForgotPasswordRequest, service: AuthService = Depends(_get_auth_service)
):
    return await service.forgot_password(request.email)


@router.get("/reset-password/{token}", response_model=TokenValidationResponse)
async def validate_reset_token(token: str, service: AuthService = Depends(_get_auth_service)):
    return await service.validate_reset_token(token)


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest, service: AuthService = Depends(_get_auth_service)
):
    try:
        await service.reset_password(request)
        return {"message": "Contrasena actualizada exitosamente"}
    except ValueError as e:
        msg = str(e)
        if msg == "INVALID_TOKEN":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token invalido")
        if msg == "EXPIRED_TOKEN":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este enlace ha expirado. Solicita uno nuevo.",
            )
        raise
