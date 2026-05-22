import uuid

from app.repositories.safety_event_repository import SafetyEventRepository
from app.repositories.system_config_repository import SystemConfigRepository

# Critical keywords → force severity 5 → auto-SOS regardless of threshold.
# Substring matching is the active strategy (`_analyze` does `kw in content`),
# so we list verb conjugations and common phrasings explicitly. Without them,
# "me quiero suicidar" would NOT match the noun "suicidio" — a textbook
# example of the substring-match gap that misses real ideation.
#
# Source for this list: combined recommendations from Crisis Text Line ES,
# 988 Lifeline (Spanish variants), and Colombian MinSalud's línea 192.
# Includes both `daño` and `dano` for keyboard layouts that drop the ñ.
CRITICAL_KEYWORDS = {
    # Suicidio — sustantivo + verbos
    "suicidio",
    "suicidar",
    "suicidarme",
    "matarme",
    # Muerte — verbo + frases
    "morir",
    "morirme",
    "no quiero vivir",
    "no quiero seguir",
    "quitarme la vida",
    "acabar con mi vida",
    "acabar conmigo",
    # Autolesión
    "hacerme dano",
    "hacerme daño",
    "lastimarme",
    "cortarme",
    "autolesion",
    "autolesionar",
}


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

        Severity policy (post-PO-Q3 + safety review 2026-05-22):

        - **Any** critical keyword matched ("suicidio", "morir",
          "hacerme dano") → severity = 5. Forces an automatic SOS panel
          regardless of how many keywords matched. Mental-health best
          practice: a single mention of ideation is enough to act, never
          wait for accumulation.
        - Non-critical keywords accumulate: +1 each, capped at 4 — leaves
          headroom so 5 stays reserved for the critical bucket.

        Previous logic (`+2 critical, +1 non-critical, cap 5`) under-counted
        a lone "suicidio" as severity 2, which is BELOW the default
        `sos_severity_threshold = 3` → SOS panel never opened. That was a
        functional safety bug.
        """
        configured = await self.config_repo.get_safety_keywords()
        content_lower = content.lower()

        # Defense in depth: ALWAYS scan against the hardcoded CRITICAL_KEYWORDS
        # set, even if the admin emptied or mis-configured `safety_keywords` in
        # system_config. Critical-keyword detection must not depend on runtime
        # configuration. We `set`-union to dedupe overlap with `configured`.
        # `dict.fromkeys` preserves insertion order so reports stay readable.
        all_keywords = list(
            dict.fromkeys(list(configured) + list(CRITICAL_KEYWORDS))
        )

        matched: list[str] = []
        critical_matched = False
        non_critical_count = 0
        for kw in all_keywords:
            if kw.lower() in content_lower:
                matched.append(kw)
                if kw.lower() in CRITICAL_KEYWORDS:
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
