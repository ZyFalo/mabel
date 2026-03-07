import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings
from app.repositories.password_reset_repository import PasswordResetRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    ForgotPasswordResponse,
    LoginResponse,
    ResetPasswordRequest,
    TokenValidationResponse,
    UserResponse,
)


JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
JWT_EXPIRY_REMEMBER_DAYS = 7


class AuthService:
    def __init__(
        self,
        user_repo: UserRepository,
        password_reset_repo: PasswordResetRepository,
    ):
        self.user_repo = user_repo
        self.password_reset_repo = password_reset_repo

    @staticmethod
    def hash_password(password: str) -> str:
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode(), salt).decode()

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        return bcrypt.checkpw(password.encode(), hashed.encode())

    @staticmethod
    def create_jwt(user_id: uuid.UUID, role: str, remember_me: bool = False) -> str:
        if remember_me:
            expires = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_REMEMBER_DAYS)
        else:
            expires = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)

        payload = {
            "sub": str(user_id),
            "role": role,
            "exp": expires,
        }
        return jwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)

    @staticmethod
    def decode_jwt(token: str) -> dict:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])

    async def register(self, email: str, password: str, display_name: str) -> UserResponse:
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise ValueError("DUPLICATE_EMAIL")

        hashed = self.hash_password(password)
        user = await self.user_repo.create(
            email=email, hashed_password=hashed, display_name=display_name
        )
        return UserResponse.model_validate(user)

    async def login(
        self, email: str, password: str, remember_me: bool = False
    ) -> LoginResponse:
        user = await self.user_repo.get_by_email(email)

        if not user or user.deleted_at is not None:
            raise ValueError("INVALID_CREDENTIALS")

        if user.disabled_at is not None:
            raise ValueError(f"DISABLED:{user.disabled_reason}")

        if not self.verify_password(password, user.hashed_password):
            raise ValueError("INVALID_CREDENTIALS")

        token = self.create_jwt(user.id, user.role, remember_me)
        return LoginResponse(
            access_token=token,
            user=UserResponse.model_validate(user),
        )

    async def forgot_password(self, email: str) -> ForgotPasswordResponse:
        user = await self.user_repo.get_by_email(email)

        if not user or user.deleted_at is not None:
            return ForgotPasswordResponse(
                message="Si el email esta registrado, recibiras instrucciones"
            )

        raw_token = os.urandom(32).hex()
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        await self.password_reset_repo.create(
            user_id=user.id, token_hash=token_hash, expires_at=expires_at
        )

        reset_link = f"/reset-password/{raw_token}"

        return ForgotPasswordResponse(
            message="Si el email esta registrado, recibiras instrucciones",
            reset_link=reset_link,
        )

    async def validate_reset_token(self, raw_token: str) -> TokenValidationResponse:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        record = await self.password_reset_repo.get_by_token_hash(token_hash)

        if not record:
            return TokenValidationResponse(valid=False, reason="invalid")

        if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return TokenValidationResponse(valid=False, reason="expired")

        return TokenValidationResponse(valid=True)

    async def reset_password(self, request: ResetPasswordRequest) -> None:
        token_hash = hashlib.sha256(request.token.encode()).hexdigest()
        record = await self.password_reset_repo.get_by_token_hash(token_hash)

        if not record:
            raise ValueError("INVALID_TOKEN")

        if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise ValueError("EXPIRED_TOKEN")

        hashed = self.hash_password(request.new_password)
        await self.user_repo.update_password(record.user_id, hashed)
        await self.password_reset_repo.mark_used(record.id)
