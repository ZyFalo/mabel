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


def validate_llm_provider_active(value: Any) -> None:
    """Solo dos valores aceptados: el adapter OpenAI-compat apuntando al
    fine-tune en Modal ('mabel_gemma4') o el adapter Gemini nativo
    ('gemini'). Se rechaza cualquier otro string para evitar deploys
    inconsistentes (ej. 'openai' sin LLM_BASE_URL apuntando a OpenAI).
    """
    if not isinstance(value, str) or value not in ("mabel_gemma4", "gemini"):
        _invalid("llm_provider_active debe ser 'mabel_gemma4' o 'gemini'")


def validate_study_lock_enabled(value: Any) -> None:
    if not isinstance(value, bool):
        _invalid("study_lock_enabled must be a boolean")


_VALIDATORS = {
    "sos_hotline_numbers": validate_sos_hotline_numbers,
    "safety_keywords": validate_safety_keywords,
    "sos_severity_threshold": validate_sos_severity_threshold,
    "guardrails_enabled": validate_guardrails_enabled,
    "study_lock_enabled": validate_study_lock_enabled,
    "llm_provider_active": validate_llm_provider_active,
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

    @staticmethod
    def _mask_api_key(raw: str) -> tuple[str, bool]:
        """Return (masked_form, is_configured).

        Mask: 6 bullets + last 4 chars. Keys shorter than 12 chars
        render as bullets-only — at that length, exposing 4 chars
        leaks too much (≥33% of the key). Threshold mirrors AWS/Stripe
        console conventions: real provider API keys are always far
        longer than this, so legitimate keys still show the suffix;
        only short placeholders / fixtures fall to bullets-only.
        """
        if not raw:
            return "(no configurada)", False
        if len(raw) < 12:
            return "●" * 6, True
        tail = raw[-4:]
        return f"●●●●●●{tail}", True

    def _resolve_active_llm_model(self) -> str:
        """Single source of truth for the model name surfaced to admins.

        Mirrors the branch in `gemini_ping` so the LLM-info snapshot and
        the ping result always report the SAME model string.
        """
        provider_kind = (settings.LLM_PROVIDER or "openai_compat").lower()
        if provider_kind == "gemini_native":
            return settings.GEMINI_MODEL
        return settings.LLM_MODEL

    async def get_llm_info(self) -> dict:
        """Return a snapshot of LLM configuration + last_test info.

        Backs the `GET /admin/llm-info` endpoint. Everything except
        last_test is derived from process settings (read-only at runtime).
        last_test is loaded from `system_config.llm_last_test` if present.
        """
        provider = (settings.LLM_PROVIDER or "openai_compat").lower()
        provider_kind = provider
        # base_url / timeout differ by provider; report the values that
        # will actually be used by the active adapter.
        if provider_kind == "gemini_native":
            base_url = "(native Gemini SDK — no HTTP base url)"
            timeout_ms = settings.GEMINI_TIMEOUT_MS
            raw_key = settings.GEMINI_API_KEY
        else:
            base_url = settings.LLM_BASE_URL
            timeout_ms = settings.LLM_TIMEOUT_MS
            raw_key = settings.effective_llm_api_key
        masked, configured = self._mask_api_key(raw_key)
        last_test_raw = await self.repo.get_value("llm_last_test")
        # Validate shape defensively: a malformed entry in BD shouldn't
        # crash the panel; just report `last_test=None`.
        last_test = None
        if isinstance(last_test_raw, dict) and {"at", "ok", "latency_ms"} <= last_test_raw.keys():
            last_test = last_test_raw

        return {
            "provider": provider,
            "base_url": base_url,
            "model": self._resolve_active_llm_model(),
            "api_key_masked": masked,
            "api_key_configured": configured,
            "timeout_ms": timeout_ms,
            "last_test": last_test,
        }

    async def _persist_last_test(self, payload: dict) -> None:
        """UPSERT the `llm_last_test` row in `system_config`.

        The first time the admin clicks "Probar conexión" the row
        doesn't exist; subsequent clicks UPDATE it. Done with an
        ON CONFLICT statement so we don't have to branch on existence.

        D-12 compliance: this method NEVER commits or rolls back the
        outer transaction (the router owns the single commit, where it
        also writes the audit_log row). The UPSERT is wrapped in a
        SAVEPOINT (`begin_nested`) so a flaky write here is isolated:
        if the INSERT fails, only the SAVEPOINT is rolled back and the
        parent transaction (carrying the eventual audit_log row) stays
        usable. Without the SAVEPOINT, a PG error would poison the
        session and the subsequent audit_log INSERT would fail too,
        leaving an admin action with no audit trail (Ley 1581 risk).

        F10: invalidates `repo._cache` after a successful UPSERT so any
        downstream read inside the same request sees the new payload
        instead of the pre-UPSERT cached value.
        """
        from sqlalchemy import text

        try:
            async with self.db.begin_nested():
                await self.db.execute(
                    text(
                        """
                        INSERT INTO system_config (key, value, description, updated_at)
                        VALUES (:key, CAST(:value AS jsonb), :description, now())
                        ON CONFLICT (key) DO UPDATE
                           SET value = EXCLUDED.value,
                               updated_at = now()
                        """
                    ),
                    {
                        "key": "llm_last_test",
                        "value": _json_dumps(payload),
                        "description": (
                            "Resultado de la ultima prueba de conexion LLM "
                            "(persistido para mostrar en /admin/config seccion 04)."
                        ),
                    },
                )
            # SAVEPOINT released successfully — invalidate cache so a
            # subsequent `repo.get_value('llm_last_test')` in the same
            # request returns the fresh payload (F10). Uses the
            # repository's public `invalidate()` method instead of
            # reaching into `_cache` directly so the contract holds if
            # the cache representation is ever refactored.
            self.repo.invalidate()
        except Exception as exc:  # noqa: BLE001 — telemetry write must never break the ping
            # SAVEPOINT auto-rolled back by the context manager; the
            # parent transaction is intact. We swallow so a flaky
            # telemetry write doesn't mask a successful ping result,
            # but we log the exception class so the failure is at
            # least observable in backend logs (otherwise a future
            # bug here would be invisible — chip just stops updating
            # with no signal anywhere).
            import logging

            logging.getLogger(__name__).warning(
                "llm_last_test UPSERT failed (rolled back to SAVEPOINT): %s",
                exc.__class__.__name__,
            )

    async def get_services_health(self) -> dict:
        """Return real status of each backend dependency for /admin/config #05.

        Probes (no side effects, no audit log):
          - DB: simple SELECT 1 against the active session.
          - LLM: surfaces `system_config.llm_last_test` (set by
            `gemini_ping`); status="na" if no test has been run yet.
          - Piper TTS: `shutil.which('piper')` + existence of the model
            file at `PIPER_MODEL_PATH / PIPER_VOICE.onnx`.
          - faster-whisper ASR: importability test.
          - Backend uptime: time since process start (informational).

        Each check returns {label, status, value, detail?}. The frontend
        renders them as table rows with a color dot per status.
        """
        import importlib.util
        import shutil

        from sqlalchemy import text

        from app.services.tts_service import piper_model_files

        services: list[dict] = []

        # --- DB ---
        try:
            await self.db.execute(text("SELECT 1"))
            services.append(
                {
                    "label": "Base de datos",
                    "status": "ok",
                    "value": "Conectada",
                    "detail": "PostgreSQL — SELECT 1 OK",
                }
            )
        except Exception as exc:  # noqa: BLE001
            services.append(
                {
                    "label": "Base de datos",
                    "status": "fail",
                    "value": "No disponible",
                    "detail": exc.__class__.__name__,
                }
            )

        # --- LLM (reuses the cached last_test from the LLM section) ---
        last_test_raw = await self.repo.get_value("llm_last_test")
        if isinstance(last_test_raw, dict) and "ok" in last_test_raw:
            ok = bool(last_test_raw.get("ok"))
            latency_ms = last_test_raw.get("latency_ms", "?")
            err = last_test_raw.get("error")
            services.append(
                {
                    "label": "Proveedor LLM",
                    "status": "ok" if ok else "fail",
                    "value": "Operativo" if ok else f"Error: {err or 'desconocido'}",
                    "detail": f"Última prueba: {latency_ms} ms · {last_test_raw.get('at', '?')}",
                }
            )
        else:
            services.append(
                {
                    "label": "Proveedor LLM",
                    "status": "na",
                    "value": "Sin pruebas previas",
                    "detail": "Pulsa 'Probar conexión' en la sección 04",
                }
            )

        # --- Piper TTS ---
        # F3 fix: usar el helper compartido `piper_model_files` (definido
        # en tts_service.py) para que health check y runtime resuelvan
        # exactamente el mismo path — incluyendo expansion absoluta vs
        # CWD y el operador `/` en lugar de string-concat. Y verificar
        # AMBOS archivos: el `.onnx` y el sidecar `.onnx.json` que
        # Piper también requiere; sin uno de los dos, runtime falla
        # aunque el health check reporte OK.
        piper_bin = shutil.which("piper")
        onnx_path, sidecar_path = piper_model_files()
        if not piper_bin:
            services.append(
                {
                    "label": "TTS (Piper)",
                    "status": "fail",
                    "value": "Binario no encontrado",
                    "detail": (
                        "Ejecuta `bash scripts/setup-piper.sh` para instalar Piper "
                        "y el modelo de voz."
                    ),
                }
            )
        elif not onnx_path.exists():
            services.append(
                {
                    "label": "TTS (Piper)",
                    "status": "warn",
                    "value": f"Modelo '{settings.PIPER_VOICE}' no encontrado",
                    "detail": (
                        f"Binario en {piper_bin} pero falta el modelo en "
                        f"{onnx_path}."
                    ),
                }
            )
        elif not sidecar_path.exists():
            services.append(
                {
                    "label": "TTS (Piper)",
                    "status": "warn",
                    "value": f"Falta el sidecar .onnx.json para '{settings.PIPER_VOICE}'",
                    "detail": (
                        f"El modelo {onnx_path.name} existe pero no su sidecar "
                        f"{sidecar_path.name}. Piper requiere AMBOS archivos; sin "
                        "el JSON la síntesis falla en runtime."
                    ),
                }
            )
        else:
            services.append(
                {
                    "label": "TTS (Piper)",
                    "status": "ok",
                    "value": f"Voz: {settings.PIPER_VOICE}",
                    "detail": f"Binario: {piper_bin} · modelo: {onnx_path}",
                }
            )

        # --- ASR Whisper ---
        whisper_spec = importlib.util.find_spec("faster_whisper")
        if whisper_spec is None:
            services.append(
                {
                    "label": "ASR (faster-whisper)",
                    "status": "fail",
                    "value": "Paquete no instalado",
                    "detail": "Ejecuta `pip install faster-whisper` en el backend.",
                }
            )
        else:
            services.append(
                {
                    "label": "ASR (faster-whisper)",
                    "status": "ok",
                    "value": f"Modelo: {settings.WHISPER_MODEL}",
                    "detail": "Paquete instalado. El modelo se descarga en la primera transcripción.",
                }
            )

        # --- Uptime (process-level) ---
        # F7 fix: el `try/except NameError` que estaba aquí era código
        # muerto (el binding existe siempre tras import del módulo).
        # `_PROCESS_START_TS` se pinea ahora en `mark_process_started()`
        # vía el lifespan hook de FastAPI (ver app/main.py) en lugar de
        # depender del import time, que era frágil bajo cambios de
        # estructura (un re-import en tests / herramientas resetea el
        # singleton). Bajo `uvicorn --reload` el proceso entero se
        # reinicia, así que el reset ahí es honesto: el dev SÍ tiene
        # un proceso nuevo. Para uptime "real" del proceso habría que
        # depender de `psutil`, que evitamos para no inflar el bundle.
        uptime_seconds = _time.monotonic() - _PROCESS_START_TS
        services.append(
            {
                "label": "Uptime del backend",
                "status": "na",
                "value": _format_uptime(uptime_seconds),
                "detail": "Tiempo desde el último reinicio del proceso Python.",
            }
        )

        return {
            "checked_at": datetime.now(UTC),
            "services": services,
        }

    async def gemini_ping(self) -> dict:
        """Lightweight liveness check against the active LLM provider.

        Despite the legacy name (`gemini_ping`), this now resolves the
        configured provider via the factory — Gemini OpenAI-compat, native
        Gemini, OpenAI, or a self-hosted model. The Admin Config UI label
        still reads "Probar conexión" so no UX impact.

        Privacy: only metadata (latency, model, error class) is returned —
        the prompt `"ping"` and the response text are NOT persisted or logged.

        After the request completes we UPSERT the result into
        `system_config.llm_last_test` so the panel can show
        last-success time + latency across reloads / restarts.
        """
        from app.services.llm import get_llm_provider

        model = self._resolve_active_llm_model()
        start = _time.monotonic()
        try:
            adapter, _ = await get_llm_provider(self.db)
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
                result = {"ok": False, "latency_ms": latency_ms, "model": model, "error": "empty_response"}
            else:
                result = {"ok": True, "latency_ms": latency_ms, "model": model, "error": None}
        except Exception as exc:  # noqa: BLE001 — surface upstream error class only
            latency_ms = int((_time.monotonic() - start) * 1000)
            result = {"ok": False, "latency_ms": latency_ms, "model": model, "error": exc.__class__.__name__}

        # Persist the full snapshot for the panel. We include `model`
        # (F4 fix) so the chip can detect drift after an admin edits
        # `.env` and restarts: comparing `last_test.model` against
        # `llm_info.model` catches the case where the cached chip says
        # "Última prueba: OK" but the active model was swapped since.
        # Without the field the admin would falsely assume the new
        # model has been validated.
        last_test_payload = {
            "at": datetime.now(UTC).isoformat(),
            "ok": result["ok"],
            "latency_ms": result["latency_ms"],
            "model": model,
            "error": result["error"],
        }
        await self._persist_last_test(last_test_payload)
        # F8: return the persisted snapshot alongside the ping result
        # so the router can hand both to the frontend in one response —
        # no second GET /admin/llm-info roundtrip needed to refresh
        # the chip. The frontend hydrates `info.last_test` from this
        # field optimistically.
        return {**result, "last_test": last_test_payload}


def _json_dumps(payload: dict) -> str:
    """Local import-light JSON dumper used by `_persist_last_test`."""
    import json

    return json.dumps(payload)


# Set by `mark_process_started()` from the FastAPI lifespan startup
# hook (see app/main.py). Captured at lifespan time — NOT import time —
# so a stray re-import (test runners, tooling) doesn't reset it.
# Default value is the import-time monotonic so that calling
# `get_services_health` before lifespan completes never crashes; the
# real value is pinned right after the worker boots.
_PROCESS_START_TS: float = _time.monotonic()


def mark_process_started() -> None:
    """Pin the process start time. Call once from FastAPI lifespan.

    F7 fix: previously `_PROCESS_START_TS` relied on the module being
    imported exactly once per process — true in prod, fragile in dev
    and tests where re-imports can silently reset the "uptime since"
    anchor. The lifespan hook fires once per worker boot, which is
    what we actually want.
    """
    global _PROCESS_START_TS  # noqa: PLW0603 — explicit module-level singleton
    _PROCESS_START_TS = _time.monotonic()


def _format_uptime(seconds: float) -> str:
    """Human-readable duration: '4 h 12 min' / '3 d 5 h' / '47 s'."""
    s = max(0, int(seconds))
    if s < 60:
        return f"{s} s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m} min {s} s"
    h, m = divmod(m, 60)
    if h < 24:
        return f"{h} h {m} min"
    d, h = divmod(h, 24)
    return f"{d} d {h} h"
