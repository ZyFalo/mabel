import json
from datetime import UTC, datetime

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

    async def get_safety_keywords(self) -> list[dict]:
        """Return safety_keywords as a list of structured entries.

        Current shape: ``[{"keyword": str, "critical": bool}, ...]``.
        Critical entries force severity=5 in `guardrails_service._analyze`.
        Non-critical entries accumulate (+1 each, cap 4).

        Backwards compatibility: if the stored value is the legacy
        `list[str]` (no structure), we lift each string to
        ``{"keyword": s, "critical": False}`` on read so callers always
        see a uniform shape. Writes always go through the structured
        path (see `validate_safety_keywords`).
        """
        value = await self.get_value("safety_keywords")
        if isinstance(value, str):
            value = json.loads(value)
        if not isinstance(value, list):
            return []
        normalized: list[dict] = []
        for entry in value:
            if isinstance(entry, dict) and "keyword" in entry:
                kw = entry.get("keyword")
                if isinstance(kw, str) and kw:
                    normalized.append(
                        {
                            "keyword": kw,
                            "critical": bool(entry.get("critical", False)),
                        }
                    )
            elif isinstance(entry, str) and entry:
                # Legacy shape — promote to structured with critical=False.
                normalized.append({"keyword": entry, "critical": False})
        return normalized

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
        row.updated_at = datetime.now(UTC)
        await self.db.flush()
        # Invalidate local cache (next read re-fetches).
        self.invalidate()
        return row

    def invalidate(self) -> None:
        """Drop the local cache so the next read re-fetches from BD.

        Public API so callers that mutate `system_config` outside of
        `update_value` (e.g. raw SQL UPSERTs in admin services) can
        opt in to the same cache-invalidation contract without
        reaching into private state. If the cache representation
        ever changes (TTL, per-key dict, shared module), only this
        method has to be updated.
        """
        self._cache = None
