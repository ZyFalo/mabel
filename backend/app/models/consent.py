import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Consent(Base):
    __tablename__ = "consents"
    __table_args__ = (
        CheckConstraint("scope IN ('solo_uso', 'uso_mejora_anon')", name="chk_consents_scope"),
        UniqueConstraint("user_id", "consent_version_id", name="uq_consents_user_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    scope: Mapped[str] = mapped_column(String, nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    consent_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("consent_versions.id", ondelete="RESTRICT"), nullable=False
    )

    user = relationship("User", back_populates="consents")
