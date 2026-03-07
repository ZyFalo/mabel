import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message_report import MessageReport


class MessageReportRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, **kwargs) -> MessageReport:
        report = MessageReport(**kwargs)
        self.db.add(report)
        await self.db.flush()
        await self.db.refresh(report)
        return report

    async def check_exists(self, message_id: uuid.UUID, reporter_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(MessageReport.id).where(
                MessageReport.message_id == message_id,
                MessageReport.reporter_id == reporter_id,
            )
        )
        return result.scalar_one_or_none() is not None
