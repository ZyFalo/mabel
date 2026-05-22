import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MessageReport(Base):
    __tablename__ = "message_reports"
    __table_args__ = (
        CheckConstraint(
            "reason IN ('hallucination', 'harmful', 'privacy', 'low_empathy', 'other')",
            name="chk_message_reports_reason",
        ),
        CheckConstraint(
            "status IN ('open', 'triaged', 'resolved', 'dismissed')",
            name="chk_message_reports_status",
        ),
        CheckConstraint(
            "severity IS NULL OR (severity >= 1 AND severity <= 5)",
            name="chk_message_reports_severity",
        ),
        Index("uq_message_reports_msg_user", "message_id", "reporter_id", unique=True),
        Index("idx_message_reports_status", "status"),
        Index("idx_message_reports_msg_time", "message_id", "created_at"),
        Index("idx_message_reports_reporter", "reporter_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="open")
    severity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
