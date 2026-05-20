import uuid
from datetime import UTC, date, datetime, time

from sqlalchemy import func, select
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

    async def get_by_id(self, report_id: uuid.UUID) -> MessageReport | None:
        result = await self.db.execute(select(MessageReport).where(MessageReport.id == report_id))
        return result.scalar_one_or_none()

    async def list_with_filters(
        self,
        reason: str | None = None,
        severity: int | None = None,
        status: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[MessageReport], int]:
        """Return (items, total_count) ordered by created_at DESC with filters."""
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        stmt = select(MessageReport)
        count_stmt = select(func.count()).select_from(MessageReport)

        if reason is not None:
            stmt = stmt.where(MessageReport.reason == reason)
            count_stmt = count_stmt.where(MessageReport.reason == reason)
        if severity is not None:
            stmt = stmt.where(MessageReport.severity == severity)
            count_stmt = count_stmt.where(MessageReport.severity == severity)
        if status is not None:
            stmt = stmt.where(MessageReport.status == status)
            count_stmt = count_stmt.where(MessageReport.status == status)
        if from_date is not None:
            from_dt = datetime.combine(from_date, time.min, tzinfo=UTC)
            stmt = stmt.where(MessageReport.created_at >= from_dt)
            count_stmt = count_stmt.where(MessageReport.created_at >= from_dt)
        if to_date is not None:
            to_dt = datetime.combine(to_date, time.max, tzinfo=UTC)
            stmt = stmt.where(MessageReport.created_at <= to_dt)
            count_stmt = count_stmt.where(MessageReport.created_at <= to_dt)

        stmt = stmt.order_by(MessageReport.created_at.desc()).offset((page - 1) * page_size).limit(page_size)

        items_result = await self.db.execute(stmt)
        items = list(items_result.scalars().all())

        total_result = await self.db.execute(count_stmt)
        total = int(total_result.scalar_one())

        return items, total

    async def update_status(
        self,
        report_id: uuid.UUID,
        new_status: str,
        triaged_by_id: uuid.UUID | None = None,
        notes: str | None = None,
    ) -> MessageReport | None:
        """Update report status. Does NOT commit (D-12).

        Notes:
        - Sets `updated_at = now()` always.
        - When transitioning to `triaged`, also stamps the timestamp in
          `updated_at` (acts as `triaged_at` since the column doesn't exist).
        - Appends `notes` to the `details` column (or sets it if null).
        - `triaged_by_id` is recorded in the audit log by the caller (no
          dedicated column on this table).
        """
        report = await self.get_by_id(report_id)
        if report is None:
            return None

        now = datetime.now(UTC)
        report.status = new_status
        report.updated_at = now

        if notes:
            stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
            entry = f"[{stamp}] {new_status}: {notes}"
            report.details = f"{report.details}\n{entry}" if report.details else entry

        await self.db.flush()
        return report
