import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ConsentVersion(Base):
    __tablename__ = "consent_versions"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'active', 'archived')", name="chk_consent_versions_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    version: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="draft")
    published_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("CURRENT_TIMESTAMP"))
