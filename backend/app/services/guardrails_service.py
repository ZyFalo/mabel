import uuid

from app.repositories.safety_event_repository import SafetyEventRepository
from app.repositories.system_config_repository import SystemConfigRepository

CRITICAL_KEYWORDS = {"suicidio", "morir", "hacerme dano"}


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
        keywords = await self.config_repo.get_safety_keywords()
        content_lower = content.lower()

        matched = []
        severity = 0
        for kw in keywords:
            if kw.lower() in content_lower:
                matched.append(kw)
                severity += 2 if kw.lower() in CRITICAL_KEYWORDS else 1

        if not matched:
            return {"risk_detected": False}

        return {
            "risk_detected": True,
            "severity": min(5, severity),
            "keywords": matched,
        }
