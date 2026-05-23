"""[Evolucion 011] sessions.hidden_at + hidden_reason para soft-hide de sesiones por el usuario.

Revision ID: 012_sessions_hidden
Revises: 011_session_ratings
Create Date: 2026-05-23

Contexto
--------
Habilita el patron documentado en `docs/DATA_RETENTION_POLICY.md`:
el usuario puede ocultar sesiones de su barra lateral sin que se
eliminen de BD. El admin sigue viendo todo para metricas. El usuario
NO ve las sesiones ocultas y la accion es one-way (reactivar el
toggle no des-oculta retroactivamente — decision UX explicada al
usuario en el modal de confirmacion).

Campos
------
- `hidden_at TIMESTAMPTZ NULL`: si NOT NULL, la sesion esta oculta.
  NULL = visible normal.
- `hidden_reason TEXT NULL`: distingue origen para audit trail y
  para responder al usuario si reclama. CHECK enforce los valores.

Indice parcial
--------------
La query del sidebar (`list_by_user`) filtra `WHERE hidden_at IS
NULL`. El indice parcial cubre exactamente ese caso sin inflar el
indice general, y deja queries admin (que NO filtran) usando
indices preexistentes.

Compliance
----------
- B-04 ramificacion por scope (`solo_uso` hace hard delete en lugar
  de soft hide) NO se enforce en BD — vive en `history_service.py`
  porque depende de `consents.scope` actual del usuario, dato vivo.
- `messages` NO se toca aqui: el contenido permanece bajo la sesion
  oculta; solo se filtra al listar por el usuario.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "012_sessions_hidden"
down_revision: str | None = "011_session_ratings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "sessions",
        sa.Column("hidden_reason", sa.Text(), nullable=True),
    )
    op.create_check_constraint(
        "ck_sessions_hidden_reason",
        "sessions",
        "hidden_reason IS NULL OR hidden_reason IN "
        "('user_toggle_off', 'user_per_session', 'admin_action')",
    )
    # Indice parcial: cubre la query mas hot (listar sesiones visibles
    # del usuario) sin pesar en el indice general de `sessions`.
    op.create_index(
        "idx_sessions_user_visible",
        "sessions",
        ["user_id", sa.text("started_at DESC")],
        postgresql_where=sa.text("hidden_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_sessions_user_visible", table_name="sessions")
    op.drop_constraint("ck_sessions_hidden_reason", "sessions", type_="check")
    op.drop_column("sessions", "hidden_reason")
    op.drop_column("sessions", "hidden_at")
