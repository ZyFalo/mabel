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
from app.services.audit_service import audit_log_action


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

    async def register(
        self,
        email: str,
        password: str,
        display_name: str,
        ip: str | None = None,
    ) -> UserResponse:
        """Create a new student account ATOMICALLY with its audit entry.

        Per D-12 the user_repo.create() no longer commits — it only flushes
        so the new user_id is available for the audit row. We then emit
        `user_register` against `self.user_repo.db` and commit ONCE. If the
        audit raises (e.g. ALLOWED_ACTIONS regression, transient DB error),
        the user creation rolls back too and the endpoint returns 5xx
        without orphaning a row in `users` without its matching audit
        trail in `audit_logs`.
        """
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise ValueError("DUPLICATE_EMAIL")

        hashed = self.hash_password(password)
        user = await self.user_repo.create(
            email=email, hashed_password=hashed, display_name=display_name
        )
        await audit_log_action(
            self.user_repo.db,
            actor_id=user.id,
            actor_role="student",
            action="user_register",
            target_type="user",
            target_id=user.id,
            details={"email": email},
            ip=ip,
        )
        await self.user_repo.db.commit()
        await self.user_repo.db.refresh(user)
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

    async def forgot_password(
        self, email: str
    ) -> tuple[ForgotPasswordResponse, uuid.UUID | None]:
        """Return (anti-enumeration response, real_user_id_or_None).

        The user_id is returned ONLY so the caller can write an audit log
        with the matching `actor_id`. The HTTP response is identical
        regardless of whether the email exists (D-03 / anti-enumeration).
        """
        user = await self.user_repo.get_by_email(email)

        # We treat deleted AND disabled accounts as "non-existent" for the
        # reset flow. Issuing a working reset_link for a disabled account
        # would let the user reset their password but still be blocked at
        # login (DISABLED: error), which is confusing and useless. It also
        # weakens anti-enumeration: an attacker that sees `reset_link`
        # present learns the email belongs to a real (disabled) account.
        if user is None or user.deleted_at is not None or user.disabled_at is not None:
            return (
                ForgotPasswordResponse(
                    message="Si el email esta registrado, recibiras instrucciones"
                ),
                None,
            )

        raw_token = os.urandom(32).hex()
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        await self.password_reset_repo.create(
            user_id=user.id, token_hash=token_hash, expires_at=expires_at
        )

        reset_link = f"/reset-password/{raw_token}"

        return (
            ForgotPasswordResponse(
                message="Si el email esta registrado, recibiras instrucciones",
                reset_link=reset_link,
            ),
            user.id,
        )

    async def validate_reset_token(self, raw_token: str) -> TokenValidationResponse:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        record = await self.password_reset_repo.get_by_token_hash(token_hash)

        if not record:
            return TokenValidationResponse(valid=False, reason="invalid")

        if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return TokenValidationResponse(valid=False, reason="expired")

        return TokenValidationResponse(valid=True)

    async def reset_password(self, request: ResetPasswordRequest) -> uuid.UUID:
        """Reset password and return the user_id whose password was changed.

        Returning the id lets the router emit a `password_reset_completed`
        audit log entry without an extra lookup.
        """
        token_hash = hashlib.sha256(request.token.encode()).hexdigest()
        record = await self.password_reset_repo.get_by_token_hash(token_hash)

        if not record:
            raise ValueError("INVALID_TOKEN")

        if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise ValueError("EXPIRED_TOKEN")

        hashed = self.hash_password(request.new_password)
        await self.user_repo.update_password(record.user_id, hashed)
        await self.password_reset_repo.mark_used(record.id)
        return record.user_id
