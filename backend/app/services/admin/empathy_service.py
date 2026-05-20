"""Admin Empathy service — Fase 8.1 Capability 3 (research-analytics-backend).

Implements the admin Empathy Ratings flow:
- ``get_queue``: random sample of unrated assistant messages for the active rater (D-07).
- ``create_rating``: insert a rating + audit_log atomically (D-12).
- ``get_stats``: aggregate stats used by Tab E "Estudio" (D-06).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.empathy_rating import EmpathyRating
from app.models.session import Session as SessionModel
from app.repositories.empathy_rating_repository import EmpathyRatingRepository
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
    ) -> list[dict]:
        """Return up to ``limit`` un-rated assistant messages.

        Each item bundles the message content along with timing context the
        UI needs to display the rating card.
        """
        # Clamp limit defensively (the router also enforces via Pydantic).
        clamped = max(1, min(int(limit), 100))

        messages = await self.repo.list_unrated_messages(
            rater_id=rater_id, cohort=cohort, limit=clamped
        )

        if not messages:
            return []

        # Load related sessions in a single query (avoid N+1).
        session_ids = {m.session_id for m in messages}
        sessions_result = await self.db.execute(
            select(SessionModel).where(SessionModel.id.in_(session_ids))
        )
        started_by_session: dict[uuid.UUID, object] = {
            s.id: s.started_at for s in sessions_result.scalars().all()
        }

        out: list[dict] = []
        for m in messages:
            out.append(
                {
                    "message_id": m.id,
                    "session_id": m.session_id,
                    "content": m.content,
                    "created_at": m.created_at,
                    "session_started_at": started_by_session.get(m.session_id),
                }
            )
        return out

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
            admin_id=rater_id,
            action="empathy_rate",
            target_type="message",
            target_id=message_id,
            details={"score": score, "criteria": criteria},
            ip=ip,
        )

        await self.db.commit()
        await self.db.refresh(rating)
        return rating

    # ------------------------------------------------------------------ stats
    async def get_stats(self, cohort: str | None = None) -> dict:
        """Return aggregate stats (delegates to repository)."""
        return await self.repo.stats(cohort=cohort)
