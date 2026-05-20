"""Admin Config service — Capability 5 (admin-config-audit).

Validates system_config payloads per key, orchestrates consent_version
lifecycle (draft -> active, archive previous), and exposes a lightweight
Gemini ping for the admin config page (#30).

Per D-12 (atomicity), service methods MAY flush but never commit — the
router performs the single commit after writing the audit log row.
"""

from __future__ import annotations

import re
import time as _time
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.consent_version import ConsentVersion
from app.models.system_config import SystemConfig
from app.repositories.system_config_repository import SystemConfigRepository

# --- Validation helpers (raise ValueError("INVALID_VALUE: <reason>")) ---


_PHONE_RE = re.compile(r"^\d{7,12}$")


def _invalid(reason: str) -> None:
    raise ValueError(f"INVALID_VALUE: {reason}")


def validate_sos_hotline_numbers(value: Any) -> None:
    if not isinstance(value, list):
        _invalid("sos_hotline_numbers must be a list")
    for idx, entry in enumerate(value):
        if not isinstance(entry, dict):
            _invalid(f"entry[{idx}] must be an object with name and number")
        name = entry.get("name")
        number = entry.get("number")
        if not isinstance(name, str) or not name.strip():
            _invalid(f"entry[{idx}].name must be a non-empty string")
        if not isinstance(number, str) or not _PHONE_RE.fullmatch(number):
            _invalid(f"entry[{idx}].number must be 7-12 digits only")


def validate_safety_keywords(value: Any) -> None:
    if not isinstance(value, list):
        _invalid("safety_keywords must be a list")
    seen: set[str] = set()
    for idx, kw in enumerate(value):
        if not isinstance(kw, str) or not kw:
            _invalid(f"keyword[{idx}] must be a non-empty string")
        if kw != kw.lower():
            _invalid(f"keyword[{idx}] must be lowercase")
        if kw in seen:
            _invalid(f"duplicate keyword '{kw}'")
        seen.add(kw)


def validate_sos_severity_threshold(value: Any) -> None:
    # bool is a subclass of int in Python — reject it explicitly.
    if isinstance(value, bool) or not isinstance(value, int):
        _invalid("sos_severity_threshold must be an integer")
    if not (1 <= value <= 5):
        _invalid("sos_severity_threshold must be between 1 and 5")


def validate_guardrails_enabled(value: Any) -> None:
    if not isinstance(value, bool):
        _invalid("guardrails_enabled must be a boolean")


def validate_study_lock_enabled(value: Any) -> None:
    if not isinstance(value, bool):
        _invalid("study_lock_enabled must be a boolean")


_VALIDATORS = {
    "sos_hotline_numbers": validate_sos_hotline_numbers,
    "safety_keywords": validate_safety_keywords,
    "sos_severity_threshold": validate_sos_severity_threshold,
    "guardrails_enabled": validate_guardrails_enabled,
    "study_lock_enabled": validate_study_lock_enabled,
}


def validate_config_value(key: str, value: Any) -> None:
    """Dispatch to the per-key validator. Unknown keys are rejected up-stream."""
    validator = _VALIDATORS.get(key)
    if validator is None:
        # Caller should have returned 404 first; defensive fallback.
        _invalid(f"unknown key '{key}'")
    validator(value)


class AdminConfigService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = SystemConfigRepository(db)

    async def list_config(self) -> list[SystemConfig]:
        return await self.repo.list_all()

    async def get_current_value(self, key: str) -> Any:
        row = await self.repo.get_row(key)
        if row is None:
            raise ValueError("KEY_NOT_FOUND")
        return row.value

    async def update_config(self, key: str, new_value: Any) -> SystemConfig:
        """Validate then update. Does NOT commit (router commits with audit log)."""
        validate_config_value(key, new_value)
        return await self.repo.update_value(key, new_value)

    # --- Consent versions ---

    async def create_consent_version(self, version: str, title: str, body: str) -> ConsentVersion:
        row = ConsentVersion(version=version, title=title, body=body, status="draft")
        self.db.add(row)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def publish_consent_version(self, version_id: uuid.UUID) -> ConsentVersion:
        """Atomically archive the current active and promote `version_id` to active.

        Raises:
          ValueError("VERSION_NOT_FOUND") if the id does not exist.
          ValueError("ALREADY_ACTIVE") if the row is already active.
        """
        target_result = await self.db.execute(
            select(ConsentVersion).where(ConsentVersion.id == version_id)
        )
        target = target_result.scalar_one_or_none()
        if target is None:
            raise ValueError("VERSION_NOT_FOUND")
        if target.status == "active":
            raise ValueError("ALREADY_ACTIVE")

        now = datetime.now(UTC)
        # Archive any currently active row(s) — there should be at most one.
        await self.db.execute(
            update(ConsentVersion)
            .where(ConsentVersion.status == "active")
            .values(status="archived")
        )
        target.status = "active"
        target.published_at = now
        await self.db.flush()
        await self.db.refresh(target)
        return target

    # --- Gemini ping ---

    async def gemini_ping(self) -> dict:
        """Lightweight liveness check against the Gemini adapter.

        Privacy: only metadata (latency, model, error class) is returned — the
        prompt `"ping"` and the response text are NOT persisted or logged.
        """
        model = settings.GEMINI_MODEL
        start = _time.monotonic()
        try:
            # Local import to avoid loading the SDK at module import time.
            from app.services.llm.gemini_adapter import GeminiAdapter

            adapter = GeminiAdapter()
            collected_any = False
            async for _chunk in adapter.generate_stream(
                messages=[{"role": "user", "content": "ping"}],
                system_prompt="",
                config={"max_output_tokens": 8, "temperature": 0.0},
            ):
                collected_any = True
                # We only need to confirm the stream produces *something*.
                break
            latency_ms = int((_time.monotonic() - start) * 1000)
            if not collected_any:
                return {"ok": False, "latency_ms": latency_ms, "model": model, "error": "empty_response"}
            return {"ok": True, "latency_ms": latency_ms, "model": model, "error": None}
        except Exception as exc:  # noqa: BLE001 — surface upstream error class only
            latency_ms = int((_time.monotonic() - start) * 1000)
            err = exc.__class__.__name__
            return {"ok": False, "latency_ms": latency_ms, "model": model, "error": err}
