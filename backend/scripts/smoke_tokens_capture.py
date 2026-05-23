"""One-shot smoke test: send a chat message and verify the assistant
message lands in BD with tokens_prompt / tokens_completion / llm_latency_ms
populated. Intended for manual run after the token-capture fix.

Run from `backend/`:
    python -m scripts.smoke_tokens_capture
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv

# Load env from project root before importing app modules (settings read
# DATABASE_URL / LLM_* on import).
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, text  # noqa: E402

from app.core.database import async_session  # noqa: E402
from app.models.message import Message  # noqa: E402
from app.repositories.message_repository import MessageRepository  # noqa: E402
from app.repositories.preference_repository import PreferenceRepository  # noqa: E402
from app.repositories.session_repository import SessionRepository  # noqa: E402
from app.services.chat_service import ChatService  # noqa: E402
from app.services.llm import get_llm_provider  # noqa: E402

USER_EMAIL = os.environ.get("SMOKE_USER_EMAIL", "estudiante@umb.edu.co")


async def main() -> int:
    async with async_session() as db:
        # Resolve test user.
        row = (
            await db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": USER_EMAIL})
        ).first()
        if not row:
            print(f"ERROR: user {USER_EMAIL!r} not found")
            return 2
        user_id = uuid.UUID(str(row[0]))

        chat = ChatService(
            session_repo=SessionRepository(db),
            message_repo=MessageRepository(db),
            preference_repo=PreferenceRepository(db),
            llm=get_llm_provider(),
            guardrails=None,
        )

        session, _ = await chat.create_session(user_id, topic_hint="smoke-tokens")
        print(f"session_id = {session.id}")

        # Drive the streaming generator to completion.
        assistant_id: str | None = None
        async for chunk in chat.send_message(session.id, user_id, "Hola, ¿cómo estás?"):
            if '"done": true' in chunk:
                # crude extract for visibility — real parsing not needed here
                print(f"final chunk: {chunk}")
                # message_id is embedded; we'll re-query BD anyway

        # Re-query the assistant row.
        result = await db.execute(
            select(Message)
            .where(Message.session_id == session.id, Message.role == "assistant")
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        msg = result.scalar_one_or_none()
        if not msg:
            print("ERROR: assistant message not persisted")
            return 3
        assistant_id = str(msg.id)
        print("---")
        print(f"assistant_message_id = {assistant_id}")
        print(f"tokens_prompt       = {msg.tokens_prompt!r}")
        print(f"tokens_completion   = {msg.tokens_completion!r}")
        print(f"llm_latency_ms      = {msg.llm_latency_ms!r}")
        print(f"latency_ms          = {msg.latency_ms!r}")
        print(f"content[:80]        = {msg.content[:80]!r}")

        ok = (
            msg.tokens_prompt is not None
            and msg.tokens_completion is not None
            and msg.llm_latency_ms is not None
        )
        print("---")
        print("RESULT:", "PASS" if ok else "FAIL")
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
