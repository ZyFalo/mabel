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
        # 100% data-driven (no hardcoded list in guardrails_service). Each
        # entry: {"keyword": str, "critical": bool}. Critical entries
        # force severity=5 (auto-SOS), non-critical accumulate +1 each
        # (cap 4). Admin can edit every entry from /admin/config #02.
        # Baseline list: combined recommendations from Crisis Text Line
        # ES, 988 Lifeline (Spanish variants), and Colombian MinSalud
        # linea 192. Includes both "daño" and "dano" for keyboard layouts
        # that drop the ñ.
        "value": json.dumps([
            # --- Critical: suicide ideation (force severity=5) ---
            {"keyword": "suicidio", "critical": True},
            {"keyword": "suicidar", "critical": True},
            {"keyword": "suicidarme", "critical": True},
            {"keyword": "matarme", "critical": True},
            # --- Critical: death wishes ---
            {"keyword": "morir", "critical": True},
            {"keyword": "morirme", "critical": True},
            {"keyword": "no quiero vivir", "critical": True},
            {"keyword": "no quiero seguir", "critical": True},
            {"keyword": "quitarme la vida", "critical": True},
            {"keyword": "acabar con mi vida", "critical": True},
            {"keyword": "acabar conmigo", "critical": True},
            # --- Critical: self-harm ---
            {"keyword": "hacerme dano", "critical": True},
            {"keyword": "hacerme daño", "critical": True},
            {"keyword": "lastimarme", "critical": True},
            {"keyword": "cortarme", "critical": True},
            {"keyword": "autolesion", "critical": True},
            {"keyword": "autolesionar", "critical": True},
        ]),
        "description": (
            "Lista de palabras clave de seguridad. Cada entrada {keyword, "
            "critical}: critical=true fuerza severidad 5 (auto-SOS); "
            "critical=false suma +1 (cap 4). Gestionable desde el panel admin."
        ),
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
