"""research instrumentation: users.cohort, messages latency split, empathy_ratings, study_lock_enabled

Revision ID: 006_research_inst
Revises: a1b2c3d4e5f6
Create Date: 2026-05-20

Additive-only changes for Fase 8.1 (research instrumentation):
- users.cohort TEXT NULL + partial index
- messages.{asr,llm,tts}_latency_ms INT NULL
- empathy_ratings table
- system_config seed: study_lock_enabled = false
"""

import sqlalchemy as sa
from alembic import op

revision = "006_research_inst"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. users.cohort + partial index
    op.add_column("users", sa.Column("cohort", sa.Text(), nullable=True))
    op.create_index(
        "idx_users_cohort",
        "users",
        ["cohort"],
        postgresql_where=sa.text("cohort IS NOT NULL"),
    )

    # 2. messages latency split
    op.add_column("messages", sa.Column("asr_latency_ms", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("llm_latency_ms", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("tts_latency_ms", sa.Integer(), nullable=True))

    # 3. empathy_ratings table
    op.create_table(
        "empathy_ratings",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "message_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "rater_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("criteria", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("score BETWEEN 1 AND 5", name="chk_empathy_ratings_score"),
        sa.UniqueConstraint("message_id", "rater_id", name="uq_empathy_ratings_message_rater"),
    )
    op.create_index("idx_empathy_ratings_message", "empathy_ratings", ["message_id"])
    op.create_index("idx_empathy_ratings_rater", "empathy_ratings", ["rater_id"])

    # 4. seed system_config study_lock_enabled
    op.execute(
        """
        INSERT INTO system_config (key, value, description)
        VALUES (
            'study_lock_enabled',
            'false'::jsonb,
            'Bloqueo de configuracion durante el estudio. Cuando true, PATCH a guardrails devuelve 423 salvo override explicito.'
        )
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM system_config WHERE key = 'study_lock_enabled'")
    op.drop_index("idx_empathy_ratings_rater", table_name="empathy_ratings")
    op.drop_index("idx_empathy_ratings_message", table_name="empathy_ratings")
    op.drop_table("empathy_ratings")
    op.drop_column("messages", "tts_latency_ms")
    op.drop_column("messages", "llm_latency_ms")
    op.drop_column("messages", "asr_latency_ms")
    op.drop_index("idx_users_cohort", table_name="users")
    op.drop_column("users", "cohort")
