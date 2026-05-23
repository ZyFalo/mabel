"""[Evolucion 010] tabla session_ratings para calificacion de corazones post-sesion.

Revision ID: 011_session_ratings
Revises: 010_safety_kw_struct
Create Date: 2026-05-23

Contexto
--------
El estudiante puede calificar una sesion con 1-5 corazones (mas = mejor)
desde el header del chat. La calificacion aparece como CTA visible solo
en sesiones finalizadas (ended_at IS NOT NULL) y queda editable incluso
despues — el estudiante puede volver a la sesion en otro momento, ver el
chat completo y ajustar su calificacion.

La nueva tabla `session_ratings` cumple:

- 1 calificacion por (sesion, usuario): UNIQUE constraint hace el flow
  upsert idempotente. Re-rating cambia el valor sin duplicar filas.
- FK CASCADE: si la sesion o el usuario se borra, la calificacion
  desaparece (no es legalmente relevante, es metrica de UX agregada).
- CHECK 1<=rating<=5 enforces el rango a nivel BD.
- Indices por session_id y user_id para queries directas (admin
  dashboard agrega por dia, student-side consulta su propia
  calificacion al abrir el chat).
- TIMESTAMPTZ con default now() — consistente con el resto del schema
  post-migracion 007.

Por que tabla nueva en lugar de columna en `sessions`
------------------------------------------------------
- Permite que `created_at`/`updated_at` reflejen cuando se hizo/edito
  la calificacion, independiente del lifecycle de la sesion.
- Si en el futuro se decide permitir multiples raters (peers,
  supervisores), la tabla ya esta normalizada.
- Mantiene `sessions` limpia (es la tabla mas hot del schema).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "011_session_ratings"
down_revision: str | None = "010_safety_kw_struct"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "session_ratings",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "session_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.Integer, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_session_ratings_range"),
        sa.UniqueConstraint("session_id", "user_id", name="uq_session_ratings_session_user"),
    )
    op.create_index("idx_session_ratings_session", "session_ratings", ["session_id"])
    op.create_index("idx_session_ratings_user", "session_ratings", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_session_ratings_user", table_name="session_ratings")
    op.drop_index("idx_session_ratings_session", table_name="session_ratings")
    op.drop_table("session_ratings")
