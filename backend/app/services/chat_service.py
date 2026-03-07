import hashlib
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime

from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.repositories.message_repository import MessageRepository
from app.repositories.preference_repository import PreferenceRepository
from app.repositories.session_repository import SessionRepository
from app.services.llm.prompts import MABEL_SYSTEM_PROMPT
from app.services.llm.provider import LLMProvider


class ChatService:
    def __init__(
        self,
        session_repo: SessionRepository,
        message_repo: MessageRepository,
        preference_repo: PreferenceRepository,
        llm: LLMProvider,
        guardrails=None,
    ) -> None:
        self.session_repo = session_repo
        self.message_repo = message_repo
        self.preference_repo = preference_repo
        self.llm = llm
        self.guardrails = guardrails

    async def create_session(self, user_id: uuid.UUID, topic_hint: str | None = None) -> tuple:
        prefs = await self.preference_repo.get_by_user_id(user_id)
        checkin_opt_in = prefs.checkin_enabled if prefs else True

        previous_closed = False
        try:
            session = await self.session_repo.create(
                user_id=user_id,
                topic_hint=topic_hint,
                checkin_opt_in=checkin_opt_in,
            )
        except IntegrityError:
            await self.session_repo.db.rollback()
            await self.session_repo.close_active(user_id)
            await self.session_repo.db.commit()
            session = await self.session_repo.create(
                user_id=user_id,
                topic_hint=topic_hint,
                checkin_opt_in=checkin_opt_in,
            )
            previous_closed = True

        await self.session_repo.db.commit()
        return session, previous_closed

    async def list_sessions(self, user_id: uuid.UUID):
        return await self.session_repo.list_by_user(user_id)

    async def get_session(self, session_id: uuid.UUID, user_id: uuid.UUID):
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError("SESSION_NOT_FOUND")
        if session.user_id != user_id:
            raise ValueError("ACCESS_DENIED")
        return session

    async def update_checkin(self, session_id: uuid.UUID, user_id: uuid.UUID, checkin_payload: dict):
        session = await self.get_session(session_id, user_id)
        if session.ended_at is not None:
            raise ValueError("SESSION_ENDED")
        if session.checkin_completed_at is not None:
            raise ValueError("CHECKIN_ALREADY_COMPLETED")

        session = await self.session_repo.update(
            session,
            checkin_payload=checkin_payload,
            checkin_completed_at=datetime.utcnow(),
        )
        await self.session_repo.db.commit()
        return session

    async def end_session(self, session_id: uuid.UUID, user_id: uuid.UUID):
        session = await self.get_session(session_id, user_id)
        if session.ended_at is not None:
            raise ValueError("SESSION_ENDED")

        session = await self.session_repo.update(session, ended_at=datetime.utcnow())
        await self.session_repo.db.commit()
        return session

    async def send_message(
        self, session_id: uuid.UUID, user_id: uuid.UUID, content: str
    ) -> AsyncGenerator[str, None]:
        session = await self.get_session(session_id, user_id)
        if session.ended_at is not None:
            raise ValueError("SESSION_ENDED")

        prefs = await self.preference_repo.get_by_user_id(user_id)
        save_history = prefs.save_history if prefs else False

        # Pre-filter guardrails
        pre_risk = None
        if self.guardrails:
            pre_risk = await self.guardrails.pre_filter(content, session_id, user_id)
            if pre_risk.get("risk_detected"):
                yield f'{{"risk_detected": true, "severity": {pre_risk["severity"]}}}'

        content_hash = hashlib.sha256(content.encode()).hexdigest()
        user_safety_flags = (
            {"risk_detected": True, "keywords": pre_risk["keywords"], "severity": pre_risk["severity"]}
            if pre_risk and pre_risk.get("risk_detected")
            else None
        )

        if save_history:
            await self.message_repo.create(
                session_id=session_id,
                role="user",
                content=content,
                content_sha256=content_hash,
                safety_flags=user_safety_flags,
            )
            await self.message_repo.db.commit()

        # Build context window
        if save_history:
            context_messages = await self.message_repo.get_recent_context(
                session_id, settings.CONTEXT_WINDOW_SIZE
            )
            messages = [{"role": m.role, "content": m.content} for m in context_messages]
        else:
            messages = [{"role": "user", "content": content}]

        # Stream from LLM
        start_time = time.time()
        full_response = ""

        try:
            async for token in self.llm.generate_stream(
                messages=messages,
                system_prompt=MABEL_SYSTEM_PROMPT,
            ):
                full_response += token
                yield f'{{"token": {_json_str(token)}}}'

        except ValueError:
            yield '{"error": "Error al generar respuesta. Intenta de nuevo."}'
            return

        latency_ms = int((time.time() - start_time) * 1000)

        # Post-filter guardrails
        post_risk = None
        if self.guardrails and full_response:
            post_risk = await self.guardrails.post_filter(content=full_response, session_id=session_id, user_id=user_id)

        assistant_safety_flags = (
            {"risk_detected": True, "keywords": post_risk["keywords"], "severity": post_risk["severity"]}
            if post_risk and post_risk.get("risk_detected")
            else None
        )

        assistant_message_id = None
        if save_history and full_response:
            assistant_hash = hashlib.sha256(full_response.encode()).hexdigest()
            assistant_msg = await self.message_repo.create(
                session_id=session_id,
                role="assistant",
                content=full_response,
                content_sha256=assistant_hash,
                meta={"model": settings.GEMINI_MODEL},
                latency_ms=latency_ms,
                safety_flags=assistant_safety_flags,
            )
            await self.message_repo.db.commit()
            assistant_message_id = str(assistant_msg.id)

        done_payload = f'"done": true, "message_id": {_json_str(assistant_message_id)}, "latency_ms": {latency_ms}'
        if post_risk and post_risk.get("risk_detected"):
            done_payload += ', "risk_detected": true'
        yield f'{{{done_payload}}}'

    async def list_messages(self, session_id: uuid.UUID, user_id: uuid.UUID):
        await self.get_session(session_id, user_id)
        return await self.message_repo.list_by_session(session_id)


def _json_str(value: str | None) -> str:
    if value is None:
        return "null"
    import json

    return json.dumps(value)
