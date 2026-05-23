"""[Evolucion 009] safety_keywords legacy → structured shape upgrade.

Revision ID: 010_safety_kw_struct
Revises: 009_greeting_empathy
Create Date: 2026-05-23

Background
----------
The seed migration `a1b2c3d4e5f6_seed_system_config_operational_keys`
originally inserted `safety_keywords` as a flat string list:

    ["suicidio", "morir", "hacerme dano"]

In the safety-keyword refactor of 2026-05-23 the runtime contract
changed to a structured shape with an explicit `critical` flag:

    [{"keyword": "suicidio", "critical": true}, ...]

The seed file was edited in place to the new shape (17 entries, all
critical), but `INSERT ... ON CONFLICT (key) DO NOTHING` means Alembic
will NOT re-apply the seed on databases that already ran it. Any DB
provisioned before this commit therefore still holds the legacy
3-string list, which the repository's compatibility shim lifts to
`{critical: False}` for each entry — silently disabling auto-SOS for
suicide ideation (severity caps at 1 instead of forcing 5).

This migration fixes the data on legacy DBs without disturbing the
ones already on the structured shape (e.g. the dev DB that was
hand-migrated via SQL on 2026-05-23).

Idempotency
-----------
We only UPDATE rows whose `value` is still a JSON array of strings
(`jsonb_typeof(value->0) <> 'object'`). DBs already on the structured
shape skip the UPDATE; downgrades are no-op because we don't know
which legacy entries the admin had picked vs. the original 3-string
default.
"""

from __future__ import annotations

import json

from alembic import op

# revision identifiers, used by Alembic.
revision = "010_safety_kw_struct"
down_revision = "009_greeting_empathy"
branch_labels = None
depends_on = None


# Baseline list mirrors the rewritten seed at
# `a1b2c3d4e5f6_seed_system_config_operational_keys.py`. Kept in sync
# manually — if you edit one, edit both.
BASELINE_STRUCTURED = [
    {"keyword": "suicidio", "critical": True},
    {"keyword": "suicidar", "critical": True},
    {"keyword": "suicidarme", "critical": True},
    {"keyword": "matarme", "critical": True},
    {"keyword": "morir", "critical": True},
    {"keyword": "morirme", "critical": True},
    {"keyword": "no quiero vivir", "critical": True},
    {"keyword": "no quiero seguir", "critical": True},
    {"keyword": "quitarme la vida", "critical": True},
    {"keyword": "acabar con mi vida", "critical": True},
    {"keyword": "acabar conmigo", "critical": True},
    {"keyword": "hacerme dano", "critical": True},
    {"keyword": "hacerme daño", "critical": True},
    {"keyword": "lastimarme", "critical": True},
    {"keyword": "cortarme", "critical": True},
    {"keyword": "autolesion", "critical": True},
    {"keyword": "autolesionar", "critical": True},
]


def upgrade() -> None:
    new_value = json.dumps(BASELINE_STRUCTURED).replace("'", "''")
    # Guard:
    # - `value` is a JSONB array
    # - first element is NOT an object (i.e. still the legacy
    #   list-of-strings shape)
    # If true: replace with the structured baseline.
    op.execute(
        f"""
        UPDATE system_config
           SET value = '{new_value}'::jsonb,
               updated_at = now()
         WHERE key = 'safety_keywords'
           AND jsonb_typeof(value) = 'array'
           AND (
                 jsonb_array_length(value) = 0
                 OR jsonb_typeof(value->0) <> 'object'
               );
        """
    )


def downgrade() -> None:
    # Intentional no-op. Reverting to the legacy 3-string list would
    # reintroduce the safety regression this migration fixes, and we
    # don't track which structured entries an admin curated in the
    # meantime. If a true rollback is needed, restore from backup.
    pass
