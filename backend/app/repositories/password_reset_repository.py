import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.password_reset_token import PasswordResetToken


class PasswordResetRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, user_id: uuid.UUID, token_hash: str, expires_at: datetime) -> PasswordResetToken:
        token = PasswordResetToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.db.add(token)
        await self.db.commit()
        await self.db.refresh(token)
        return token

    async def get_by_token_hash(self, token_hash: str) -> PasswordResetToken | None:
        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def mark_used(self, token_id: uuid.UUID) -> None:
        # NO commit aquí (D-12 atomicity, 2026-05-24): el caller
        # (auth_router.reset_password) emite audit_log_action y hace commit
        # final para que el used_at update y el audit queden en la misma TX.
        # Antes commiteaba aquí y el audit quedaba en otra TX (no atómico).
        result = await self.db.execute(select(PasswordResetToken).where(PasswordResetToken.id == token_id))
        token = result.scalar_one_or_none()
        if token:
            token.used_at = datetime.now(UTC)
            await self.db.flush()
