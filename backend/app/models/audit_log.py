import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        CheckConstraint(
            "actor_role IN ('admin', 'student', 'system')",
            # Alineado con el name que usa la migración 008
            # (chk_audit_logs_actor_role). Antes el modelo declaraba
            # 'audit_logs_actor_role_check' (autogenerate de SQLAlchemy)
            # mientras la migración creaba 'chk_*'; resultado: dos CHECKs
            # con misma definición pero distintos names podían quedar en
            # la BD según orden. Audit fix DR-11 (2026-05-24).
            name="chk_audit_logs_actor_role",
        ),
        Index("idx_audit_logs_actor_time", "actor_id", text("created_at DESC")),
        Index("idx_audit_logs_action_time", "action", text("created_at DESC")),
        Index("idx_audit_logs_role_time", "actor_role", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # No server_default: migration 008 backfilled historic rows with
    # 'admin' (correct label — pre-007 audit was admin-only) and then
    # DROPped the DEFAULT so any future INSERT that omits actor_role
    # fails loudly with a NOT NULL violation instead of silently
    # mislabeling student/system rows as 'admin'.
    actor_role: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    target_type: Mapped[str | None] = mapped_column(String, nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
