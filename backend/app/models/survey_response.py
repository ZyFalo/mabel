import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SurveyResponse(Base):
    __tablename__ = "survey_responses"
    __table_args__ = (
        CheckConstraint(
            "instrument IN ('sus', 'empathy_rubric', 'wellbeing_pre', 'wellbeing_post')",
            name="chk_survey_responses_instrument",
        ),
        CheckConstraint("phase IN ('pre', 'post')", name="chk_survey_responses_phase"),
        UniqueConstraint("user_id", "instrument", "phase", name="uq_survey_user_instrument_phase"),
        Index("idx_survey_instrument_phase", "instrument", "phase"),
        Index("idx_survey_user", "user_id", postgresql_where=text("user_id IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    instrument: Mapped[str] = mapped_column(String, nullable=False)
    phase: Mapped[str] = mapped_column(String, nullable=False)
    score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    administered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    imported_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
