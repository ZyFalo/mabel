"""Empathy ratings repository — Fase 8.1 Capability 3 (research-analytics-backend).

Provides queue sampling, rating creation, and aggregate stats for
the admin Empathy Ratings tooling. The `survey_responses` table is NOT used
here: per D-06, empathy data now lives in `empathy_ratings` (one row per
(message, rater)).

All methods are async and DO NOT commit (D-12) — callers manage the
surrounding transaction.
"""

from __future__ import annotations

import uuid

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.empathy_rating import EmpathyRating
from app.models.message import Message
from app.models.session import Session as SessionModel
from app.models.user import User


class EmpathyRatingRepository:
    """Data access for the `empathy_ratings` table."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ------------------------------------------------------------------ create
    async def create(
        self,
        message_id: uuid.UUID,
        rater_id: uuid.UUID,
        score: int,
        criteria: dict | None = None,
    ) -> EmpathyRating:
        """Insert a new rating. Does NOT commit.

        Raises ``ValueError("ALREADY_RATED")`` when the UNIQUE
        ``(message_id, rater_id)`` constraint fires.
        """
        rating = EmpathyRating(
            message_id=message_id,
            rater_id=rater_id,
            score=score,
            criteria=criteria,
        )
        self.db.add(rating)
        try:
            await self.db.flush()
        except IntegrityError as e:
            # Re-raise as a sentinel the service layer can map to 409.
            await self.db.rollback()
            raise ValueError("ALREADY_RATED") from e
        await self.db.refresh(rating)
        return rating

    # ----------------------------------------------------- queue (D-07 sample)
    async def list_unrated_messages(
        self,
        rater_id: uuid.UUID,
        *,
        eligible_user_ids: list[uuid.UUID],
        cohort: str | None = None,
        limit: int = 20,
    ) -> list[Message]:
        """Return up to ``limit`` assistant messages NOT yet rated by ``rater_id``.

        - Only ``role='assistant'`` messages.
        - ``eligible_user_ids`` is REQUIRED (research consent gate): every
          caller must resolve and pass the research-eligible user list.
          The empty list ``[]`` is a valid value and produces an empty
          queue (semantically: nobody consented, nothing to rate).
          Making this a required kwarg (no default) prevents a future
          refactor from silently regressing to "show everyone".
        - If ``cohort`` is provided, JOIN users and filter ``users.cohort
          = cohort`` on top of the eligibility constraint.
        - Random sampling per D-07 (``ORDER BY random() LIMIT n``).
        """
        # NOT EXISTS subquery: no rating from this rater for the message.
        not_rated = ~select(EmpathyRating.id).where(
            EmpathyRating.message_id == Message.id,
            EmpathyRating.rater_id == rater_id,
        ).exists()

        # We always JOIN SessionModel because the eligibility filter
        # is unconditional now (required kwarg).
        stmt = (
            select(Message)
            .join(SessionModel, Message.session_id == SessionModel.id)
            .where(
                Message.role == "assistant",
                not_rated,
                SessionModel.user_id.in_(eligible_user_ids),
            )
        )
        if cohort is not None:
            stmt = stmt.join(User, SessionModel.user_id == User.id).where(User.cohort == cohort)

        stmt = stmt.order_by(func.random()).limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_unrated_messages(
        self,
        rater_id: uuid.UUID,
        *,
        eligible_user_ids: list[uuid.UUID],
        cohort: str | None = None,
    ) -> int:
        """Return the TOTAL number of assistant messages this rater has yet
        to evaluate (no limit). Backs the "Cola pendiente (N)" counter so
        the UI can show progress honestly (e.g. "mostrando 12 de 12").

        Honors the same filters as ``list_unrated_messages`` so the
        counter and the queue stay consistent (you never see "12 pending"
        and then nothing in the queue because the filter dropped them).

        ``eligible_user_ids`` is REQUIRED — same fail-secure contract as
        ``list_unrated_messages``.
        """
        not_rated = ~select(EmpathyRating.id).where(
            EmpathyRating.message_id == Message.id,
            EmpathyRating.rater_id == rater_id,
        ).exists()

        stmt = (
            select(func.count(Message.id))
            .select_from(Message)
            .join(SessionModel, Message.session_id == SessionModel.id)
            .where(
                Message.role == "assistant",
                not_rated,
                SessionModel.user_id.in_(eligible_user_ids),
            )
        )
        if cohort is not None:
            stmt = stmt.join(User, SessionModel.user_id == User.id).where(User.cohort == cohort)

        result = await self.db.execute(stmt)
        return int(result.scalar() or 0)

    # ----------------------------------------------------------------- filter
    async def list_by_filters(
        self,
        cohort: str | None = None,
        rater_id: uuid.UUID | None = None,
    ) -> list[EmpathyRating]:
        """Return ratings, optionally filtered by author cohort and/or rater."""
        stmt = select(EmpathyRating)
        if cohort is not None:
            stmt = (
                stmt.join(Message, EmpathyRating.message_id == Message.id)
                .join(SessionModel, Message.session_id == SessionModel.id)
                .join(User, SessionModel.user_id == User.id)
                .where(User.cohort == cohort)
            )
        if rater_id is not None:
            stmt = stmt.where(EmpathyRating.rater_id == rater_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, rating_id: uuid.UUID) -> EmpathyRating | None:
        """Fetch a single rating by primary key (used by PATCH ownership check)."""
        result = await self.db.execute(
            select(EmpathyRating).where(EmpathyRating.id == rating_id)
        )
        return result.scalar_one_or_none()

    # -------------------------------------------------------------------- stats
    async def stats(
        self,
        *,
        eligible_user_ids: list[uuid.UUID],
        cohort: str | None = None,
    ) -> dict:
        """Aggregate stats over all ratings.

        Returns shape:
            {
              "n": int,
              "mean": float | None,
              "distribution": [{"bucket": "1".."5", "count": int}],
              "pct_4_or_above": float | None,
            }

        ``eligible_user_ids`` is REQUIRED (fail-secure). ``cohort`` is
        optional. Both filter the message author via the JOIN chain
        ``empathy_ratings → messages → sessions → users``.
        """
        # Eligibility is always applied → always join the chain.
        def _attach_chain(stmt):
            """Apply the join chain + filters once for any aggregate."""
            stmt = (
                stmt.join(Message, EmpathyRating.message_id == Message.id)
                .join(SessionModel, Message.session_id == SessionModel.id)
                .where(SessionModel.user_id.in_(eligible_user_ids))
            )
            if cohort is not None:
                stmt = stmt.join(User, SessionModel.user_id == User.id).where(
                    User.cohort == cohort
                )
            return stmt

        # Aggregate: n, mean, count(score>=4)
        agg_stmt = select(
            func.count(EmpathyRating.id).label("n"),
            func.avg(EmpathyRating.score).label("mean"),
            func.sum(case((EmpathyRating.score >= 4, 1), else_=0)).label("ge4"),
        )
        agg_stmt = _attach_chain(agg_stmt)

        agg_row = (await self.db.execute(agg_stmt)).one()
        n = int(agg_row.n or 0)
        mean_raw = agg_row.mean
        ge4 = int(agg_row.ge4 or 0)

        # Distribution per score 1..5
        dist_stmt = select(EmpathyRating.score, func.count(EmpathyRating.id))
        dist_stmt = _attach_chain(dist_stmt)
        dist_stmt = dist_stmt.group_by(EmpathyRating.score)

        dist_rows = (await self.db.execute(dist_stmt)).all()
        counts_by_score: dict[int, int] = {int(s): int(c) for s, c in dist_rows}
        distribution = [
            {"bucket": str(score), "count": counts_by_score.get(score, 0)}
            for score in range(1, 6)
        ]

        if n == 0:
            return {
                "n": 0,
                "mean": None,
                "distribution": distribution,
                "pct_4_or_above": None,
            }

        mean = float(mean_raw) if mean_raw is not None else None
        pct_4_or_above = round((ge4 / n) * 100.0, 2)

        return {
            "n": n,
            "mean": mean,
            "distribution": distribution,
            "pct_4_or_above": pct_4_or_above,
        }
