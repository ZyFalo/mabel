"""Calificacion del estudiante a una sesion (1-5 corazones, mas = mejor).

Tabla introducida en mig 011 (2026-05-23). El estudiante puede calificar
su propia sesion desde el header del chat, incluso despues de cerrada,
y editar la calificacion las veces que quiera (UPSERT idempotente vía
UNIQUE constraint).
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SessionRating(Base):
    __tablename__ = "session_ratings"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_session_ratings_range"),
        UniqueConstraint("session_id", "user_id", name="uq_session_ratings_session_user"),
        Index("idx_session_ratings_session", "session_id"),
        Index("idx_session_ratings_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
