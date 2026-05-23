import uuid
from datetime import UTC, datetime

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

    async def get_by_id(
        self, session_id: uuid.UUID, include_hidden: bool = False
    ) -> Session | None:
        """Carga una sesion por id.

        Por defecto (include_hidden=False) excluye sesiones ocultas:
        el endpoint student-side `GET /sessions/{id}` debe responder
        404 si la sesion esta oculta, igual que si no existiera. El
        admin y los servicios que actuan sobre sesiones ocultas
        (history_service para des-ocultar / hard delete) pasan
        include_hidden=True explicitamente.
        """
        stmt = select(Session).where(Session.id == session_id)
        if not include_hidden:
            stmt = stmt.where(Session.hidden_at.is_(None))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: uuid.UUID) -> list[Session]:
        """Lista sesiones VISIBLES del usuario (sidebar student-side).

        Filtra `hidden_at IS NULL` para excluir sesiones que el usuario
        marco como ocultas via toggle OFF del historial o desde el menu
        3-puntos del sidebar. Las sesiones siguen en BD y son contables
        en metricas admin — esto es solo el filtro del lado del titular.
        Usa el indice parcial `idx_sessions_user_visible` (mig 012).
        """
        result = await self.db.execute(
            select(Session)
            .where(Session.user_id == user_id, Session.hidden_at.is_(None))
            .order_by(Session.started_at.desc())
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
            .values(ended_at=datetime.now(UTC))
        )
        return result.rowcount > 0
