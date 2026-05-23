import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message


class MessageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, **kwargs) -> Message:
        message = Message(**kwargs)
        self.db.add(message)
        await self.db.flush()
        await self.db.refresh(message)
        return message

    async def list_by_session(self, session_id: uuid.UUID) -> list[Message]:
        result = await self.db.execute(
            select(Message).where(Message.session_id == session_id).order_by(Message.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, message_id: uuid.UUID) -> Message | None:
        result = await self.db.execute(select(Message).where(Message.id == message_id))
        return result.scalar_one_or_none()

    async def get_recent_context(self, session_id: uuid.UUID, limit: int) -> list[Message]:
        result = await self.db.execute(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        messages = list(result.scalars().all())
        messages.reverse()  # chronological order
        return messages

    async def find_greeting(self, session_id: uuid.UUID) -> Message | None:
        """Return the unique greeting row for a session, if any.

        Pairs with the partial UNIQUE INDEX `uq_messages_session_greeting`
        (`role='assistant' AND meta->>'greeting' = 'true'`). Used by the
        greeting-race recovery path in ChatService to attribute consumed
        tokens to the surviving INSERT.
        """
        result = await self.db.execute(
            select(Message)
            .where(
                Message.session_id == session_id,
                Message.role == "assistant",
                Message.meta["greeting"].astext == "true",
            )
            .limit(1)
        )
        return result.scalar_one_or_none()
