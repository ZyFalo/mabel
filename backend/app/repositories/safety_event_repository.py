import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.safety_event import SafetyEvent


class SafetyEventRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        user_id: uuid.UUID | None,
        session_id: uuid.UUID | None,
        event_type: str,
        payload: dict | None = None,
    ) -> SafetyEvent:
        event = SafetyEvent(
            user_id=user_id,
            session_id=session_id,
            event_type=event_type,
            payload=payload,
        )
        self.db.add(event)
        await self.db.flush()
        await self.db.refresh(event)
        return event
