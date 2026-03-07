import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)
    topic_hint: Mapped[str | None] = mapped_column(String, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checkin_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    checkin_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checkin_completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    avatar_used: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
