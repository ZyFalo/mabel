"""seed system_config operational keys

Revision ID: a1b2c3d4e5f6
Revises: 3c6f5125803d
Create Date: 2026-03-07
"""

from alembic import op
import json

revision = "a1b2c3d4e5f6"
down_revision = "3c6f5125803d"
branch_labels = None
depends_on = None

SEED_DATA = [
    {
        "key": "sos_hotline_numbers",
        "value": json.dumps([
            {"name": "Linea 106 ICBF", "number": "018000112440"},
            {"name": "Linea 141 Linea de la Vida", "number": "018000113113"},
            {"name": "Linea UMB Bienestar", "number": "POR_DEFINIR"},
        ]),
        "description": "Lineas de crisis mostradas en Panel SOS (#12). Array JSON configurable por admin desde #30.",
    },
    {
        "key": "safety_keywords",
        "value": json.dumps(["suicidio", "morir", "hacerme dano"]),
        "description": "Keywords de deteccion de crisis",
    },
    {
        "key": "sos_severity_threshold",
        # Default 4 — only severity-4 (3+ non-critical keyword matches in a
        # single message) and severity-5 (any CRITICAL_KEYWORD match) trigger
        # the automatic SOS panel. Threshold 3 was perceived as invasive
        # because a single "estoy triste, solo, ansioso" (3 non-critical
        # hits) would force the SOS overlay; 4 lets the conversation breathe.
        # Critical-ideation keywords still ALWAYS hit (severity=5 forced).
        "value": "4",
        "description": "Umbral de severidad para activacion automatica de SOS (1-5)",
    },
    {
        "key": "guardrails_enabled",
        "value": "true",
        "description": "Toggle global de guardrails (true/false)",
    },
]

KEYS = [row["key"] for row in SEED_DATA]


def upgrade() -> None:
    for row in SEED_DATA:
        op.execute(
            f"""
            INSERT INTO system_config (key, value, description)
            VALUES ('{row["key"]}', '{row["value"]}'::jsonb, '{row["description"]}')
            ON CONFLICT (key) DO NOTHING
            """
        )


def downgrade() -> None:
    keys_str = ", ".join(f"'{k}'" for k in KEYS)
    op.execute(f"DELETE FROM system_config WHERE key IN ({keys_str})")
