"""seed system_config.llm_provider_active

Capability: admin runtime switch entre Mabel-Gemma4 (Modal) y Gemini.
Default 'mabel_gemma4' = comportamiento productivo actual del piloto.

Idempotente vía ON CONFLICT DO NOTHING — la migración se puede correr
varias veces sin duplicar ni sobreescribir un valor ya configurado por
el admin desde el panel.

Revision ID: 013
Revises: 012
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from alembic import op


revision = "013_seed_llm_provider"
down_revision = "012_sessions_hidden"
branch_labels = None
depends_on = None


KEY = "llm_provider_active"
# JSONB string: el ::jsonb cast convierte la cadena entre comillas dobles
# en un valor JSON de tipo string (no objeto). `repo.get_value()` devuelve
# entonces el str Python "mabel_gemma4".
DEFAULT_VALUE_JSON = '"mabel_gemma4"'
# CR-01 (review 2026-05-25): la descripción contenía apóstrofes
# ('mabel_gemma4', 'gemini') que rompían la query si se interpolaban
# en un f-string SQL. Usar `sa.text(...)` con bind parameters y dejar
# que el driver escape los valores correctamente.
DESCRIPTION = (
    "Proveedor LLM activo para responder mensajes del chat. "
    "Valores: 'mabel_gemma4' (Modal, modelo propio) o 'gemini' "
    "(API Google, requiere GEMINI_API_KEY). Cambio en caliente "
    "desde /admin/config — aplica al proximo turno sin reiniciar."
)


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO system_config (key, value, description)
            VALUES (:key, CAST(:value AS jsonb), :description)
            ON CONFLICT (key) DO NOTHING
            """
        ).bindparams(
            sa.bindparam("key", KEY),
            sa.bindparam("value", DEFAULT_VALUE_JSON),
            sa.bindparam("description", DESCRIPTION),
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM system_config WHERE key = :key").bindparams(
            sa.bindparam("key", KEY)
        )
    )
