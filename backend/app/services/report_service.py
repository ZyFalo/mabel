import uuid

from sqlalchemy.exc import IntegrityError

from app.repositories.message_report_repository import MessageReportRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.session_repository import SessionRepository


class ReportService:
    def __init__(
        self,
        report_repo: MessageReportRepository,
        message_repo: MessageRepository,
        session_repo: SessionRepository,
    ) -> None:
        self.report_repo = report_repo
        self.message_repo = message_repo
        self.session_repo = session_repo

    async def create_report(
        self,
        message_id: uuid.UUID,
        reporter_id: uuid.UUID,
        reason: str,
        severity: int | None = None,
        details: str | None = None,
    ):
        message = await self.message_repo.get_by_id(message_id)
        if not message:
            raise ValueError("MESSAGE_NOT_FOUND")

        session = await self.session_repo.get_by_id(message.session_id)
        if not session or session.user_id != reporter_id:
            raise ValueError("ACCESS_DENIED")

        if message.role != "assistant":
            raise ValueError("CANNOT_REPORT_OWN_MESSAGE")

        try:
            report = await self.report_repo.create(
                message_id=message_id,
                reporter_id=reporter_id,
                reason=reason,
                severity=severity,
                details=details,
            )
            await self.report_repo.db.commit()
            return report
        except IntegrityError:
            await self.report_repo.db.rollback()
            raise ValueError("DUPLICATE_REPORT")

    async def check_report(self, message_id: uuid.UUID, reporter_id: uuid.UUID) -> bool:
        return await self.report_repo.check_exists(message_id, reporter_id)
