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
from types import SimpleNamespace
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
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
    """Validate the safety_keywords payload.

    Shape (current): `list[{keyword: str, critical: bool}]`. Every entry
    is an object with a non-empty lowercase keyword and an explicit
    critical flag. Critical entries force severity=5 in
    `guardrails_service._analyze` (auto-SOS). Non-critical entries
    accumulate +1 each, capped at 4.

    Legacy shape (`list[str]`) is also accepted for backwards
    compatibility — converted on read by the repository to all entries
    with `critical=False`. We don't ACCEPT writes in the legacy shape:
    admins always send the structured form from the UI.
    """
    if not isinstance(value, list):
        _invalid("safety_keywords must be a list")
    # Safety floor: refuse to persist a list with zero critical entries.
    # Without at least one critical keyword, `_analyze` can never produce
    # severity=5 → the auto-SOS panel never opens for ideation. Pre-2026-05-23
    # the code had a hardcoded `CRITICAL_KEYWORDS` set as defense-in-depth;
    # we removed it to make the vocabulary 100% admin-managed, but that
    # turned a misclick (delete-all + Save) into a silent safety regression
    # for a mental-health product. This floor is the bare minimum guard:
    # the admin is welcome to curate the list, just not to leave it empty
    # or strip ALL critical flags.
    if len(value) == 0:
        _invalid(
            "safety_keywords no puede estar vacia. Debe contener al menos "
            "una entrada con critical=true para que la deteccion automatica "
            "de ideacion siga activa."
        )
    seen: set[str] = set()
    critical_count = 0
    for idx, entry in enumerate(value):
        if not isinstance(entry, dict):
            _invalid(
                f"keyword[{idx}] must be an object "
                "{keyword: str, critical: bool}"
            )
        kw = entry.get("keyword")
        critical = entry.get("critical")
        if not isinstance(kw, str) or not kw:
            _invalid(f"keyword[{idx}].keyword must be a non-empty string")
        if kw != kw.lower():
            _invalid(f"keyword[{idx}].keyword must be lowercase")
        if not isinstance(critical, bool):
            _invalid(f"keyword[{idx}].critical must be a boolean")
        if kw in seen:
            _invalid(f"duplicate keyword '{kw}'")
        seen.add(kw)
        if critical:
            critical_count += 1
    if critical_count == 0:
        _invalid(
            "Debe haber al menos una palabra clave con critical=true. "
            "Estas son las que disparan el panel SOS automaticamente "
            "ante ideacion (severidad 5)."
        )


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

    async def delete_consent_version_draft(self, version_id: uuid.UUID) -> SimpleNamespace:
        """Delete a consent_version that is still in 'draft' status.

        Active and archived versions are NEVER deletable: they're part
        of the legal trail. A draft, however, never reached any user —
        deleting it is just discarding an abandoned admin edit.

        Returns a SNAPSHOT (`SimpleNamespace`, NOT an ORM instance) of
        the deleted row so the caller can audit-log identifying info
        (version string + title) after the row is gone. Using a plain
        namespace instead of a transient `ConsentVersion(id=...)` avoids
        a latent SQLAlchemy identity-map collision: constructing a new
        ORM instance with the same primary key as a row being deleted
        in the same session works today by accident, but any future
        event listener / cascade / refactor that touches the snapshot
        could re-attach it and either raise IntegrityError on flush or
        silently resurrect the draft. Plain namespace is safer because
        SQLAlchemy never tracks it.

        Raises:
          ValueError("VERSION_NOT_FOUND") if the id does not exist.
          ValueError("NOT_DRAFT") if the row is active or archived.
          ValueError("HAS_REFERENCES") if a `consents` row references
            this version (race: another admin published it between our
            SELECT and our DELETE). The FK is ON DELETE RESTRICT so
            Postgres rejects the delete; we translate to a structured
            error the router maps to HTTP 409.
        """
        target_result = await self.db.execute(
            select(ConsentVersion).where(ConsentVersion.id == version_id)
        )
        target = target_result.scalar_one_or_none()
        if target is None:
            raise ValueError("VERSION_NOT_FOUND")
        if target.status != "draft":
            raise ValueError("NOT_DRAFT")

        # Snapshot BEFORE delete — pure data, not bound to the session.
        snapshot = SimpleNamespace(
            id=target.id,
            version=target.version,
            title=target.title,
            body=target.body,
            status=target.status,
        )
        await self.db.delete(target)
        try:
            await self.db.flush()
        except IntegrityError as e:
            # FK RESTRICT from consents.consent_version_id. Concurrent
            # publish followed by user acceptance is the only realistic
            # path to trigger this since drafts are unreachable to
            # students. Rollback the pending delete and let the router
            # map to HTTP 409 with a helpful message.
            await self.db.rollback()
            raise ValueError("HAS_REFERENCES") from e
        return snapshot

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

    # --- LLM ping (provider-agnostic) ---

    async def gemini_ping(self) -> dict:
        """Lightweight liveness check against the active LLM provider.

        Despite the legacy name (`gemini_ping`), this now resolves the
        configured provider via the factory — Gemini OpenAI-compat, native
        Gemini, OpenAI, or a self-hosted model. The Admin Config UI label
        still reads "Probar conexión" so no UX impact.

        Privacy: only metadata (latency, model, error class) is returned —
        the prompt `"ping"` and the response text are NOT persisted or logged.
        """
        # Report the model that the active provider will actually use, not
        # the legacy GEMINI_MODEL setting.
        from app.services.llm import get_llm_provider

        provider_kind = (settings.LLM_PROVIDER or "openai_compat").lower()
        model = settings.GEMINI_MODEL if provider_kind == "gemini_native" else settings.LLM_MODEL
        start = _time.monotonic()
        try:
            adapter = get_llm_provider()
            collected_any = False
            # NOTE: gemini-2.5-* family burns ~50-200 reasoning tokens before
            # producing output. Cap at 256 so the ping reliably emits >=1 token
            # without bleeding latency. For lite/1.5 models this is overkill
            # but harmless.
            async for _chunk in adapter.generate_stream(
                messages=[{"role": "user", "content": "ping"}],
                system_prompt="",
                config={"max_output_tokens": 256, "temperature": 0.0},
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
