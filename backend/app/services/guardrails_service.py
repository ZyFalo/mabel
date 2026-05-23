import uuid

from app.repositories.safety_event_repository import SafetyEventRepository
from app.repositories.system_config_repository import SystemConfigRepository


class GuardrailsService:
    def __init__(
        self,
        config_repo: SystemConfigRepository,
        event_repo: SafetyEventRepository,
    ) -> None:
        self.config_repo = config_repo
        self.event_repo = event_repo

    async def pre_filter(
        self,
        content: str,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> dict:
        enabled = await self.config_repo.get_guardrails_enabled()
        if not enabled:
            return {"risk_detected": False}

        result = await self._analyze(content)
        if not result["risk_detected"]:
            return result

        await self.event_repo.create(
            user_id=user_id,
            session_id=session_id,
            event_type="risk_detected",
            payload={
                "keywords": result["keywords"],
                "severity": result["severity"],
                "message_id": None,
                "filter": "pre",
            },
        )
        await self.event_repo.db.commit()

        threshold = await self.config_repo.get_sos_threshold()
        return {
            "risk_detected": result["severity"] >= threshold,
            "severity": result["severity"],
            "keywords": result["keywords"],
        }

    async def post_filter(
        self,
        content: str,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
        message_id: uuid.UUID | None = None,
    ) -> dict:
        enabled = await self.config_repo.get_guardrails_enabled()
        if not enabled:
            return {"risk_detected": False}

        result = await self._analyze(content)
        if not result["risk_detected"]:
            return result

        await self.event_repo.create(
            user_id=user_id,
            session_id=session_id,
            event_type="risk_detected",
            payload={
                "keywords": result["keywords"],
                "severity": result["severity"],
                "message_id": str(message_id) if message_id else None,
                "filter": "post",
            },
        )
        await self.event_repo.db.commit()

        threshold = await self.config_repo.get_sos_threshold()
        return {
            "risk_detected": result["severity"] >= threshold,
            "severity": result["severity"],
            "keywords": result["keywords"],
        }

    async def _analyze(self, content: str) -> dict:
        """Substring-match `content` against the configured safety keywords.

        Severity policy:

        - **Any** keyword marked `critical=True` in `safety_keywords` →
          severity = 5. Forces an automatic SOS panel regardless of how
          many keywords matched. Mental-health best practice: a single
          mention of ideation is enough to act, never wait for
          accumulation.
        - Non-critical keywords accumulate: +1 each, capped at 4 —
          leaves headroom so 5 stays reserved for the critical bucket.

        100% data-driven: there is NO hardcoded keyword list. Admins
        manage the full vocabulary (including critical entries) via
        ``/admin/config`` section 02 → "Palabras clave de seguridad".
        The DB seed (``a1b2c3d4e5f6_seed_system_config_operational_keys``)
        ships with a recommended baseline that includes the canonical
        critical Spanish ideation terms, but the admin can rename, add,
        or remove any of them.
        """
        configured = await self.config_repo.get_safety_keywords()
        content_lower = content.lower()

        matched: list[str] = []
        critical_matched = False
        non_critical_count = 0
        for entry in configured:
            kw = entry["keyword"]
            if kw.lower() in content_lower:
                matched.append(kw)
                if entry.get("critical"):
                    critical_matched = True
                else:
                    non_critical_count += 1

        if not matched:
            return {"risk_detected": False}

        if critical_matched:
            severity = 5
        else:
            severity = min(non_critical_count, 4)

        return {
            "risk_detected": True,
            "severity": severity,
            "keywords": matched,
        }
