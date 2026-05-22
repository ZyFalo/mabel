"""Admin Empathy service — Fase 8.1 Capability 3 (research-analytics-backend).

Implements the admin Empathy Ratings flow:
- ``get_queue``: random sample of unrated assistant messages for the active rater (D-07).
- ``create_rating``: insert a rating + audit_log atomically (D-12).
- ``get_stats``: aggregate stats used by Tab E "Estudio" (D-06).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.empathy_rating import EmpathyRating
from app.models.message import Message
from app.models.session import Session as SessionModel
from app.models.user import User
from app.repositories.empathy_rating_repository import EmpathyRatingRepository
from app.services.admin.users_service import mask_email
from app.services.audit_service import audit_log_action


class AdminEmpathyService:
    """Coordinator for admin empathy-rating endpoints."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = EmpathyRatingRepository(db)

    # ------------------------------------------------------------------ queue
    async def get_queue(
        self,
        rater_id: uuid.UUID,
        cohort: str | None = None,
        limit: int = 20,
    ) -> dict:
        """Return up to ``limit`` un-rated assistant messages + total pending.

        The dict shape (``{"items": [...], "total_pending": N}``) lets the
        UI render an honest counter — "Cola pendiente (12) · mostrando 12 de
        12" — and hide the "Cargar más" button once the loaded batch covers
        every pending message. Before this change the queue returned a bare
        list and the UI counter showed only the in-memory length, which was
        misleading whenever the true pool exceeded the limit (or, in the
        pilot, equalled it exactly).
        """
        # Clamp limit defensively (the router also enforces via Pydantic).
        clamped = max(1, min(int(limit), 100))

        total_pending = await self.repo.count_unrated_messages(
            rater_id=rater_id, cohort=cohort
        )

        messages = await self.repo.list_unrated_messages(
            rater_id=rater_id, cohort=cohort, limit=clamped
        )

        if not messages:
            return {"items": [], "total_pending": total_pending}

        # Load related sessions in a single query (avoid N+1).
        session_ids = {m.session_id for m in messages}
        sessions_result = await self.db.execute(
            select(SessionModel).where(SessionModel.id.in_(session_ids))
        )
        started_by_session: dict[uuid.UUID, object] = {
            s.id: s.started_at for s in sessions_result.scalars().all()
        }

        # S-02: Load the immediately preceding user message per assistant msg
        # for rater context (improves scoring accuracy). One query per session
        # ID range — for the pilot's small batch (limit<=100) the overhead is
        # negligible vs N+1 with explicit JOIN/lateral.
        preceding_by_msg: dict[uuid.UUID, str] = {}
        for m in messages:
            prev_result = await self.db.execute(
                select(Message.content)
                .where(
                    Message.session_id == m.session_id,
                    Message.role == "user",
                    Message.created_at < m.created_at,
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            prev = prev_result.scalar_one_or_none()
            if prev is not None:
                preceding_by_msg[m.id] = prev

        out: list[dict] = []
        for m in messages:
            out.append(
                {
                    "message_id": m.id,
                    "session_id": m.session_id,
                    "content": m.content,
                    "created_at": m.created_at,
                    "session_started_at": started_by_session.get(m.session_id),
                    "preceding_user_message": preceding_by_msg.get(m.id),
                }
            )
        return {"items": out, "total_pending": total_pending}

    # ----------------------------------------------------------------- create
    async def create_rating(
        self,
        rater_id: uuid.UUID,
        message_id: uuid.UUID,
        score: int,
        criteria: dict | None,
        ip: str | None = None,
    ) -> EmpathyRating:
        """Persist a rating + audit_log atomically (D-12).

        Raises ``ValueError("ALREADY_RATED")`` if the rater has already scored
        this message — the router maps that to HTTP 409.
        """
        # Defensive range check (Pydantic already enforces 1..5).
        if not isinstance(score, int) or score < 1 or score > 5:
            raise ValueError("INVALID_SCORE")

        try:
            rating = await self.repo.create(
                message_id=message_id,
                rater_id=rater_id,
                score=score,
                criteria=criteria,
            )
        except ValueError as e:
            # Re-raise the sentinel verbatim so the router can map it.
            if str(e) == "ALREADY_RATED":
                raise
            raise

        await audit_log_action(
            self.db,
            actor_id=rater_id,
            actor_role="admin",
            action="empathy_rate",
            target_type="message",
            target_id=message_id,
            details={"score": score, "criteria": criteria},
            ip=ip,
        )

        await self.db.commit()
        await self.db.refresh(rating)
        return rating

    # ------------------------------------------------------------------ rated
    async def list_rated(
        self,
        rater_id: uuid.UUID,
        cohort: str | None = None,
    ) -> dict:
        """Return ratings (from ALL raters) for assistant messages in the cohort.

        Each item carries the rating itself, the message + preceding context
        (same shape used by the queue), the rater identity (masked email so
        the panel can show "evaluated by a***@umb…"), and an `is_mine` flag
        so the UI can grey-out edits on other raters' ratings. The user
        explicitly asked for cross-rater visibility on the "Calificadas" tab
        — inter-rater reliability requires admins to be able to compare what
        each other scored.
        """
        # 1. Pull every rating for messages whose author's cohort matches.
        stmt = (
            select(EmpathyRating, Message, SessionModel, User)
            .join(Message, EmpathyRating.message_id == Message.id)
            .join(SessionModel, Message.session_id == SessionModel.id)
            .join(User, SessionModel.user_id == User.id)
            .where(Message.role == "assistant")
            .order_by(EmpathyRating.created_at.desc())
        )
        if cohort is not None:
            stmt = stmt.where(User.cohort == cohort)
        rows = (await self.db.execute(stmt)).all()

        if not rows:
            return {"items": [], "total": 0}

        # 2. Build rater email lookup with a single query (avoid N+1).
        rater_ids = {r.rater_id for (r, _m, _s, _u) in rows if r.rater_id is not None}
        rater_emails: dict[uuid.UUID, str] = {}
        if rater_ids:
            rater_result = await self.db.execute(
                select(User.id, User.email).where(User.id.in_(rater_ids))
            )
            for rid, email in rater_result.all():
                rater_emails[rid] = mask_email(email)

        # 3. Load preceding user messages per assistant message (same N+1
        #    approach as get_queue — fine for pilot scale).
        preceding_by_msg: dict[uuid.UUID, str] = {}
        for _r, m, _s, _u in rows:
            prev_result = await self.db.execute(
                select(Message.content)
                .where(
                    Message.session_id == m.session_id,
                    Message.role == "user",
                    Message.created_at < m.created_at,
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            prev = prev_result.scalar_one_or_none()
            if prev is not None:
                preceding_by_msg[m.id] = prev

        items: list[dict] = []
        for rating, message, session, _user in rows:
            items.append(
                {
                    "rating_id": rating.id,
                    "score": rating.score,
                    "criteria": rating.criteria,
                    "created_at": rating.created_at,
                    "updated_at": rating.updated_at,
                    "rater_id": rating.rater_id,
                    "rater_email_masked": (
                        rater_emails.get(rating.rater_id) if rating.rater_id else None
                    ),
                    "is_mine": rating.rater_id == rater_id,
                    "message_id": message.id,
                    "session_id": session.id,
                    "content": message.content,
                    "message_created_at": message.created_at,
                    "session_started_at": session.started_at,
                    "preceding_user_message": preceding_by_msg.get(message.id),
                }
            )
        return {"items": items, "total": len(items)}

    # ----------------------------------------------------------------- update
    async def update_rating(
        self,
        rating_id: uuid.UUID,
        rater_id: uuid.UUID,
        score: int | None,
        criteria: dict | None,
        ip: str | None = None,
    ) -> EmpathyRating:
        """Update score and/or criteria of an existing rating.

        Ownership check is strict: only the rater that created the rating can
        edit it. Other admins see ratings cross-cohort (per user request) but
        in read-only mode. Sets `updated_at = now()` so the UI can render
        "Calificado el X (editado el Y)".

        Raises:
            ValueError("RATING_NOT_FOUND"): the id does not exist.
            ValueError("FORBIDDEN"): caller is not the original rater.
            ValueError("INVALID_SCORE"): defensive (Pydantic enforces 1..5).
        """
        rating = await self.repo.get_by_id(rating_id)
        if rating is None:
            raise ValueError("RATING_NOT_FOUND")
        if rating.rater_id != rater_id:
            raise ValueError("FORBIDDEN")

        details: dict = {"rating_id": str(rating_id), "previous": {}}
        if score is not None:
            if not isinstance(score, int) or score < 1 or score > 5:
                raise ValueError("INVALID_SCORE")
            details["previous"]["score"] = rating.score
            rating.score = score
        if criteria is not None:
            details["previous"]["criteria"] = rating.criteria
            rating.criteria = criteria

        rating.updated_at = datetime.now(UTC)
        await self.db.flush()

        await audit_log_action(
            self.db,
            actor_id=rater_id,
            actor_role="admin",
            action="empathy_rate_updated",
            target_type="empathy_rating",
            target_id=rating.id,
            details=details,
            ip=ip,
        )

        await self.db.commit()
        await self.db.refresh(rating)
        return rating

    # ------------------------------------------------------------------ stats
    async def get_stats(self, cohort: str | None = None) -> dict:
        """Return aggregate stats (delegates to repository)."""
        return await self.repo.stats(cohort=cohort)
