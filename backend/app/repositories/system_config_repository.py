import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_config import SystemConfig


class SystemConfigRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._cache: dict[str, object] | None = None

    async def _ensure_cache(self) -> None:
        if self._cache is not None:
            return
        result = await self.db.execute(select(SystemConfig))
        rows = result.scalars().all()
        self._cache = {}
        for row in rows:
            self._cache[row.key] = row.value

    async def get_value(self, key: str) -> object | None:
        await self._ensure_cache()
        return self._cache.get(key)

    async def get_safety_keywords(self) -> list[str]:
        value = await self.get_value("safety_keywords")
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return json.loads(value)
        return []

    async def get_sos_threshold(self) -> int:
        value = await self.get_value("sos_severity_threshold")
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            try:
                return int(value)
            except (ValueError, TypeError):
                pass
        return 3

    async def get_guardrails_enabled(self) -> bool:
        value = await self.get_value("guardrails_enabled")
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() == "true"
        return True

    async def get_sos_hotline_numbers(self) -> list[dict]:
        value = await self.get_value("sos_hotline_numbers")
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return json.loads(value)
        return []

    async def list_all(self) -> list[SystemConfig]:
        """Return all system_config rows (admin list endpoint)."""
        result = await self.db.execute(select(SystemConfig).order_by(SystemConfig.key))
        return list(result.scalars().all())

    async def get_row(self, key: str) -> SystemConfig | None:
        """Return the raw ORM row for `key` (or None)."""
        result = await self.db.execute(select(SystemConfig).where(SystemConfig.key == key))
        return result.scalar_one_or_none()

    async def update_value(self, key: str, new_value) -> SystemConfig:
        """Update `value` for the row identified by `key`.

        Sets `updated_at = now()` and flushes (does NOT commit, per D-12).
        Raises ValueError("KEY_NOT_FOUND") if the row does not exist.
        """
        row = await self.get_row(key)
        if row is None:
            raise ValueError("KEY_NOT_FOUND")
        row.value = new_value
        row.updated_at = datetime.utcnow()
        await self.db.flush()
        # Invalidate local cache (next read re-fetches).
        self._cache = None
        return row
