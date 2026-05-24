import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create(self, email: str, hashed_password: str, display_name: str) -> User:
        """Insert a new user. Does NOT commit (per D-12).

        The caller (`AuthService.register`) bundles this with the matching
        `audit_log_action(action='user_register')` and commits both
        atomically, so a failure in the audit write rolls back the user
        creation too.
        """
        user = User(email=email, hashed_password=hashed_password, display_name=display_name)
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def update_password(self, user_id: uuid.UUID, hashed_password: str) -> None:
        # NO commit aquí (D-12 atomicity): el caller (auth_router.change_password,
        # auth_router.reset_password) emite el audit_log_action y hace commit final
        # para que el UPDATE del hash y el audit_logs row queden en la misma TX.
        # Hasta 2026-05-24 sí commiteaba aquí, lo que rompía el patrón post-D-12 y
        # permitía que el audit quedara perdido si fallaba tras el password update.
        user = await self.get_by_id(user_id)
        if user:
            user.hashed_password = hashed_password
            await self.db.flush()

    async def delete(self, user_id: uuid.UUID) -> bool:
        result = await self.db.execute(delete(User).where(User.id == user_id))
        await self.db.commit()
        return result.rowcount > 0
