"""Admin Empathy service — Fase 8.1 Capability 3 (research-analytics-backend).

Implements the admin Empathy Ratings flow:
- ``get_queue``: random sample of unrated assistant messages for the active rater (D-07).
- ``create_rating``: insert a rating + audit_log atomically (D-12).
- ``get_stats``: aggregate stats used by Tab E "Estudio" (D-06).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.empathy_rating import EmpathyRating
from app.models.message import Message
from app.models.session import Session as SessionModel
from app.models.user import User
from app.repositories.empathy_rating_repository import EmpathyRatingRepository
from app.services.admin.users_service import mask_email
from app.services.audit_service import audit_log_action


async def _batch_preceding_user_messages(
    db: AsyncSession, anchors: Sequence[Message]
) -> dict[uuid.UUID, str]:
    """Return {anchor_message_id: previous_user_message_content} in ONE query.

    Replaces the previous per-message ``SELECT ... ORDER BY created_at DESC
    LIMIT 1`` loop (N+1 against ``messages``) with a single Postgres LATERAL
    join: for each anchor we ask the planner for the latest user message in
    the same session strictly preceding the anchor. At pilot scale (30
    students × 50 sessions × 10 msgs ≈ 15k ratings) the loop made the
    Calificadas tab visibly slow — this version is O(1) round-trip and uses
    the same index as the original (``messages(session_id, created_at)``).
    """
    if not anchors:
        return {}

    anchor_ids = [m.id for m in anchors]

    # Aliased target message and previous user-message inside a LATERAL.
    Anchor = aliased(Message, name="anchor_msg")
    Prev = aliased(Message, name="prev_user_msg")

    prev_lat = (
        select(Prev.content.label("prev_content"))
        .where(
            Prev.session_id == Anchor.session_id,
            Prev.role == "user",
            Prev.created_at < Anchor.created_at,
        )
        .order_by(Prev.created_at.desc())
        .limit(1)
        .lateral("prev_lat")
    )

    stmt = (
        select(Anchor.id, prev_lat.c.prev_content)
        .select_from(Anchor)
        .join(prev_lat, true(), isouter=True)
        .where(Anchor.id.in_(anchor_ids))
    )
    result = await db.execute(stmt)
    return {row[0]: row[1] for row in result.all() if row[1] is not None}


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

        # S-02: Load the immediately preceding user message per assistant
        # message in ONE LATERAL query (single round-trip — see
        # `_batch_preceding_user_messages`).
        preceding_by_msg = await _batch_preceding_user_messages(self.db, messages)

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

        # 3. Load preceding user messages in ONE LATERAL query (see
        #    `_batch_preceding_user_messages`). Dedupe anchors by id because
        #    the same assistant message can appear in multiple rating rows
        #    (cross-rater visibility), and we only need its predecessor once.
        anchor_msgs: dict[uuid.UUID, Message] = {}
        for _r, m, _s, _u in rows:
            anchor_msgs.setdefault(m.id, m)
        preceding_by_msg = await _batch_preceding_user_messages(
            self.db, list(anchor_msgs.values())
        )

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
