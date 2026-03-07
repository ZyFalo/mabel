import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attachment import Attachment


class AttachmentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        message_id: uuid.UUID,
        kind: str,
        path: str,
        meta: dict | None = None,
    ) -> Attachment:
        attachment = Attachment(
            message_id=message_id,
            kind=kind,
            path=path,
            meta=meta,
        )
        self.db.add(attachment)
        await self.db.flush()
        await self.db.refresh(attachment)
        return attachment
