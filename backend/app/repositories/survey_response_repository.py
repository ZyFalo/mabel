import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.survey_response import SurveyResponse


class SurveyResponseRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_by_filters(
        self,
        user_id: uuid.UUID | None = None,
        instrument: str | None = None,
        phase: str | None = None,
    ) -> list[SurveyResponse]:
        stmt = select(SurveyResponse)
        if user_id is not None:
            stmt = stmt.where(SurveyResponse.user_id == user_id)
        if instrument is not None:
            stmt = stmt.where(SurveyResponse.instrument == instrument)
        if phase is not None:
            stmt = stmt.where(SurveyResponse.phase == phase)
        stmt = stmt.order_by(SurveyResponse.administered_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_sus_scores(self) -> list[float]:
        """Return all non-null SUS usability scores as a flat list of floats."""
        stmt = select(SurveyResponse.score).where(
            SurveyResponse.instrument == "sus",
            SurveyResponse.score.is_not(None),
        )
        result = await self.db.execute(stmt)
        return [float(row) for row in result.scalars().all() if row is not None]

    async def get_empathy_scores(self) -> list[float]:
        """Return all non-null empathy rubric scores as a flat list of floats."""
        stmt = select(SurveyResponse.score).where(
            SurveyResponse.instrument == "empathy_rubric",
            SurveyResponse.score.is_not(None),
        )
        result = await self.db.execute(stmt)
        return [float(row) for row in result.scalars().all() if row is not None]

    async def get_wellbeing_pairs(self) -> list[tuple[float, float]]:
        """Return paired (pre, post) wellbeing scores per user.

        Sources:
        - instrument='wellbeing_pre' phase='pre'
        - instrument='wellbeing_post' phase='post'
        Pairs are matched by user_id; users without both entries are skipped.
        """
        stmt = select(
            SurveyResponse.user_id,
            SurveyResponse.instrument,
            SurveyResponse.phase,
            SurveyResponse.score,
        ).where(
            SurveyResponse.instrument.in_(["wellbeing_pre", "wellbeing_post"]),
            SurveyResponse.score.is_not(None),
            SurveyResponse.user_id.is_not(None),
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        pre: dict[uuid.UUID, float] = {}
        post: dict[uuid.UUID, float] = {}
        for user_id, instrument, _phase, score in rows:
            if score is None or user_id is None:
                continue
            if instrument == "wellbeing_pre":
                pre[user_id] = float(score)
            elif instrument == "wellbeing_post":
                post[user_id] = float(score)

        pairs: list[tuple[float, float]] = []
        for uid, pre_val in pre.items():
            if uid in post:
                pairs.append((pre_val, post[uid]))
        return pairs
