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
        """Aggregation stub for SUS usability scores. Implemented in metrics capability."""
        return []

    async def get_empathy_scores(self) -> list[float]:
        """Aggregation stub for empathy rubric scores. Implemented in metrics capability."""
        return []

    async def get_wellbeing_pairs(self) -> list[tuple[float, float]]:
        """Aggregation stub returning (pre, post) wellbeing pairs. Implemented in metrics capability."""
        return []
