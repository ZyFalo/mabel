import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        # Mirror DDL so autogenerate doesn't propose to drop these.
        Index("idx_sessions_user_time", "user_id", "started_at"),
        Index(
            "uq_sessions_user_active",
            "user_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
        # Mig 012: indice parcial para la query del sidebar
        # (`list_by_user` filtra `WHERE hidden_at IS NULL`).
        Index(
            "idx_sessions_user_visible",
            "user_id",
            text("started_at DESC"),
            postgresql_where=text("hidden_at IS NULL"),
        ),
        # Mig 012: solo valores controlados para hidden_reason. NULL
        # admitido (sesion no oculta).
        CheckConstraint(
            "hidden_reason IS NULL OR hidden_reason IN "
            "('user_toggle_off', 'user_per_session', 'admin_action')",
            name="ck_sessions_hidden_reason",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    topic_hint: Mapped[str | None] = mapped_column(String, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checkin_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    checkin_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checkin_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    avatar_used: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Mig 012: soft-hide controlado por el usuario (toggle save_history
    # off, o quitar individual desde el menu 3-puntos del sidebar).
    # NULL = visible normal. NOT NULL = oculta del usuario, pero
    # permanece en BD para metricas / investigacion segun consentimiento.
    # Detalle completo en docs/DATA_RETENTION_POLICY.md.
    hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hidden_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
