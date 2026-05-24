from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.password_reset_repository import PasswordResetRepository
from app.repositories.user_repository import UserRepository
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenValidationResponse,
    UserResponse,
)
from app.services.account_service import AccountService
from app.services.audit_service import audit_log_action
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(UserRepository(db), PasswordResetRepository(db))


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    http_request: Request,
    service: AuthService = Depends(_get_auth_service),
):
    # AuthService.register is atomic post-code-review: it persists the user
    # AND the `user_register` audit row in a single transaction (D-12). The
    # router no longer issues a second commit — that pattern previously
    # left orphan users in `users` whenever the audit write failed.
    try:
        user = await service.register(
            request.email,
            request.password,
            request.display_name,
            ip=http_request.client.host if http_request.client else None,
        )
    except ValueError as e:
        if str(e) == "DUPLICATE_EMAIL":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email ya esta registrado")
        raise
    return user


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    service: AuthService = Depends(_get_auth_service),
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else None
    try:
        response = await service.login(body.email, body.password, body.remember_me)
    except ValueError as e:
        msg = str(e)
        if msg == "INVALID_CREDENTIALS":
            # Evolucion 007: audit failed credential attempts so the admin
            # panel surfaces brute-force patterns. actor_id is None (no
            # trusted identity); actor_role='system' indicates the event was
            # not driven by an authenticated user. NEVER include password
            # or hash in details (D-03).
            await audit_log_action(
                db,
                actor_id=None,
                actor_role="system",
                action="user_login_failed",
                target_type="user",
                details={"email": body.email},
                ip=ip,
            )
            await db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales invalidas")
        if msg.startswith("DISABLED:"):
            reason = msg.split(":", 1)[1]
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Cuenta deshabilitada: {reason}")
        raise

    # D-09 + Evolucion 007: audit successful logins.
    # `login` (admin role) is preserved verbatim for admin sessions to keep
    # the legacy admin panel filter `action=login` working; for students we
    # use the explicit `user_login` action and `actor_role='student'` so the
    # /admin/logs panel can scope by role.
    if response.user.role == "admin":
        await audit_log_action(
            db,
            actor_id=response.user.id,
            actor_role="admin",
            action="login",
            target_type="user",
            target_id=response.user.id,
            details={"role": response.user.role, "remember_me": body.remember_me},
            ip=ip,
        )
    else:
        await audit_log_action(
            db,
            actor_id=response.user.id,
            actor_role="student",
            action="user_login",
            target_type="user",
            target_id=response.user.id,
            details={"role": response.user.role, "remember_me": body.remember_me},
            ip=ip,
        )
    await db.commit()

    return response


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    request: ForgotPasswordRequest,
    http_request: Request,
    service: AuthService = Depends(_get_auth_service),
    db: AsyncSession = Depends(get_db),
):
    # Service returns (response, user_id_or_None). The response is identical
    # whether or not the email exists (anti-enumeration, D-03); the user_id
    # is used here only to attribute the audit log to the right actor when
    # we have one. No log is written when the email is unknown so we don't
    # store noise for typos/probes.
    response, real_user_id = await service.forgot_password(request.email)
    ip = http_request.client.host if http_request.client else None
    if real_user_id is not None:
        await audit_log_action(
            db,
            actor_id=real_user_id,
            actor_role="student",
            action="password_reset_requested",
            target_type="user",
            target_id=real_user_id,
            details={"email": request.email},
            ip=ip,
        )
        await db.commit()
    return response


@router.get("/reset-password/{token}", response_model=TokenValidationResponse)
async def validate_reset_token(token: str, service: AuthService = Depends(_get_auth_service)):
    return await service.validate_reset_token(token)


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    http_request: Request,
    service: AuthService = Depends(_get_auth_service),
    db: AsyncSession = Depends(get_db),
):
    try:
        user_id = await service.reset_password(request)
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

    await audit_log_action(
        db,
        actor_id=user_id,
        actor_role="student",
        action="password_reset_completed",
        target_type="user",
        target_id=user_id,
        ip=http_request.client.host if http_request.client else None,
    )
    await db.commit()
    return {"message": "Contrasena actualizada exitosamente"}


@router.put("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = AccountService(UserRepository(db), db)
    try:
        await service.change_password(current_user, request.current_password, request.new_password)
        # Audit trail Ley 1581 art. 25 (registro de operaciones sobre data
        # personal). El servicio NO emite — se hace aquí para mantener D-12
        # atomicidad: el commit del audit va junto al UPDATE del password.
        await audit_log_action(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            action="password_changed",
            target_type="user",
            target_id=current_user.id,
            ip=http_request.client.host if http_request.client else None,
        )
        await db.commit()
        return {"message": "Contrasena actualizada exitosamente"}
    except ValueError as e:
        msg = str(e)
        if msg == "WRONG_PASSWORD":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Contrasena actual incorrecta",
            )
        if msg == "SAME_PASSWORD":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La nueva contrasena debe ser diferente a la actual",
            )
        raise
