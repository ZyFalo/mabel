import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Preference(Base):
    __tablename__ = "preferences"
    __table_args__ = (
        CheckConstraint("preferred_chat_mode IN ('chat', 'avatar')", name="chk_preferences_chat_mode"),
    )

    # user_id IS the primary key (1:1 table, no separate id column)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    save_history: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    ui_language: Mapped[str] = mapped_column(String, nullable=False, server_default="es")
    tts_voice: Mapped[str | None] = mapped_column(String, nullable=True)
    accessibility: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checkin_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    preferred_chat_mode: Mapped[str] = mapped_column(String, nullable=False, server_default="chat")

    user = relationship("User", back_populates="preferences")
