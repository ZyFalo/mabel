import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import Session


class SessionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, **kwargs) -> Session:
        session = Session(**kwargs)
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def get_by_id(self, session_id: uuid.UUID) -> Session | None:
        result = await self.db.execute(select(Session).where(Session.id == session_id))
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: uuid.UUID) -> list[Session]:
        result = await self.db.execute(
            select(Session).where(Session.user_id == user_id).order_by(Session.started_at.desc())
        )
        return list(result.scalars().all())

    async def update(self, session: Session, **kwargs) -> Session:
        for key, value in kwargs.items():
            setattr(session, key, value)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def close_active(self, user_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            update(Session)
            .where(Session.user_id == user_id, Session.ended_at.is_(None))
            .values(ended_at=datetime.utcnow())
        )
        return result.rowcount > 0
