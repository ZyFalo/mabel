import uuid
from datetime import UTC, date, datetime, time

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

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

    async def get_by_id(self, event_id: uuid.UUID) -> SafetyEvent | None:
        result = await self.db.execute(select(SafetyEvent).where(SafetyEvent.id == event_id))
        return result.scalar_one_or_none()

    async def list_with_filters(
        self,
        event_type: str | None = None,
        severity: int | None = None,
        status: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[SafetyEvent], int]:
        """Return (items, total_count) ordered by created_at DESC.

        `severity` is extracted from `payload->>'severity'` (cast to int).
        """
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        stmt = select(SafetyEvent)
        count_stmt = select(func.count()).select_from(SafetyEvent)

        if event_type is not None:
            stmt = stmt.where(SafetyEvent.event_type == event_type)
            count_stmt = count_stmt.where(SafetyEvent.event_type == event_type)
        if status is not None:
            stmt = stmt.where(SafetyEvent.status == status)
            count_stmt = count_stmt.where(SafetyEvent.status == status)
        if severity is not None:
            sev_expr = cast(SafetyEvent.payload["severity"].astext, Integer)
            stmt = stmt.where(sev_expr == severity)
            count_stmt = count_stmt.where(sev_expr == severity)
        if from_date is not None:
            from_dt = datetime.combine(from_date, time.min, tzinfo=UTC)
            stmt = stmt.where(SafetyEvent.created_at >= from_dt)
            count_stmt = count_stmt.where(SafetyEvent.created_at >= from_dt)
        if to_date is not None:
            to_dt = datetime.combine(to_date, time.max, tzinfo=UTC)
            stmt = stmt.where(SafetyEvent.created_at <= to_dt)
            count_stmt = count_stmt.where(SafetyEvent.created_at <= to_dt)

        stmt = stmt.order_by(SafetyEvent.created_at.desc()).offset((page - 1) * page_size).limit(page_size)

        items_result = await self.db.execute(stmt)
        items = list(items_result.scalars().all())

        total_result = await self.db.execute(count_stmt)
        total = int(total_result.scalar_one())

        return items, total

    async def update_status(
        self,
        event_id: uuid.UUID,
        new_status: str,
        notes: str | None = None,
    ) -> SafetyEvent | None:
        """Update safety event status. Does NOT commit (D-12).

        Appends `notes` to `payload.admin_notes` (creates key if missing).
        """
        event = await self.get_by_id(event_id)
        if event is None:
            return None

        event.status = new_status

        if notes:
            now = datetime.now(UTC)
            stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
            entry = {"at": stamp, "status": new_status, "note": notes}
            payload = dict(event.payload) if event.payload else {}
            existing_notes = payload.get("admin_notes")
            if isinstance(existing_notes, list):
                payload["admin_notes"] = [*existing_notes, entry]
            else:
                payload["admin_notes"] = [entry]
            event.payload = payload
            flag_modified(event, "payload")

        await self.db.flush()
        return event
