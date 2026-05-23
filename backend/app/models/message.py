import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("role IN ('system', 'user', 'assistant')", name="chk_messages_role"),
        # Mirror DDL so autogenerate doesn't propose to drop these.
        Index("idx_messages_session_time", "session_id", "created_at"),
        Index(
            "idx_messages_latency",
            "latency_ms",
            postgresql_where=text("role = 'assistant' AND latency_ms IS NOT NULL"),
        ),
        # Mirrors migration 009 + `db/schema_postgresql.sql`. Declaring the
        # partial UNIQUE INDEX on the ORM model keeps `alembic revision
        # --autogenerate` honest: without this entry, the next autogen run
        # would diff the live DB against `Base.metadata`, conclude the
        # index is "extra", and emit `op.drop_index(...)` — silently
        # removing the dedupe protection for greeting double-inserts.
        # Predicate matches `MessageRepository.find_greeting` (text
        # equality) so the planner CAN use this index for that probe.
        Index(
            "uq_messages_session_greeting",
            "session_id",
            unique=True,
            postgresql_where=text(
                "role = 'assistant' AND meta->>'greeting' = 'true'"
            ),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    content_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    safety_flags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tokens_prompt: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_completion: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    asr_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tts_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    session = relationship("Session", back_populates="messages")
