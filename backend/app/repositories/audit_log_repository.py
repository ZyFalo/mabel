import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


class AuditLogRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        admin_id: uuid.UUID | None,
        action: str,
        target_type: str | None = None,
        target_id: uuid.UUID | None = None,
        details: dict | None = None,
        ip: str | None = None,
    ) -> AuditLog:
        """Insert an audit_logs row. Does NOT commit (per D-12)."""
        log = AuditLog(
            admin_id=admin_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=details,
            ip_address=ip,
        )
        self.db.add(log)
        await self.db.flush()
        await self.db.refresh(log)
        return log

    async def list_with_filters(
        self,
        admin_id: uuid.UUID | None = None,
        action: str | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AuditLog], int]:
        """Return (items, total_count) ordered by created_at DESC with filters."""
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        stmt = select(AuditLog)
        count_stmt = select(func.count()).select_from(AuditLog)

        if admin_id is not None:
            stmt = stmt.where(AuditLog.admin_id == admin_id)
            count_stmt = count_stmt.where(AuditLog.admin_id == admin_id)
        if action is not None:
            stmt = stmt.where(AuditLog.action == action)
            count_stmt = count_stmt.where(AuditLog.action == action)
        if from_date is not None:
            stmt = stmt.where(AuditLog.created_at >= from_date)
            count_stmt = count_stmt.where(AuditLog.created_at >= from_date)
        if to_date is not None:
            stmt = stmt.where(AuditLog.created_at <= to_date)
            count_stmt = count_stmt.where(AuditLog.created_at <= to_date)

        stmt = stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)

        items_result = await self.db.execute(stmt)
        items = list(items_result.scalars().all())

        total_result = await self.db.execute(count_stmt)
        total = int(total_result.scalar_one())

        return items, total
