"""Redact `message_id` from old safety_events payloads (L2 retention).

Para qué existe
---------------
`safety_events.payload` guarda contexto forense del evento (incluyendo
`message_id` para poder mostrar el turno exacto en el panel admin). El
mensaje en sí (tabla `messages`) puede ser borrado por el estudiante en
cualquier momento, pero el `message_id` referenciado en el payload del
safety_event sigue ahí como huella correlacionable.

Política L2 (ver `docs/DATA_RETENTION_POLICY.md`): después de 30 días,
el `message_id` se redacta del payload. El evento se conserva (cuenta
para métricas de safety) pero deja de ser correlacionable con un
mensaje específico, lo que cumple el principio de minimización del Art.
4 de Ley 1581/2012 sin perder señal estadística.

Qué hace (y qué NO hace)
------------------------
- HACE: UPDATE safety_events SET payload = payload - 'message_id'
        WHERE created_at < NOW() - INTERVAL '30 days'
              AND payload ? 'message_id'.
- NO HACE: borrar el safety_event, borrar el message, tocar otros
  campos del payload (severity, matched_keywords, etc.).

Idempotente: la cláusula `payload ? 'message_id'` evita actualizar
filas ya redactadas, así re-correr el cron es no-op (no costo de I/O
ni filas afectadas).

Operación
---------
- Cadencia: diaria, 03:00 UTC, vía Railway cron service (ver
  `railway.cron.toml`).
- Ejecución manual local:
    cd backend && source .venv/bin/activate
    python -m scripts.redact_old_message_ids
  (Usar la forma `-m` y NO `python scripts/redact_old_message_ids.py`:
  esta última no agrega `backend/` a sys.path, así que `from
  app.core.config import settings` falla con ModuleNotFoundError.
  El `-m` lo resuelve gracias a `backend/scripts/__init__.py`.)
- Exit codes: 0 OK, 1 error de conexión/SQL.
- Logs: stdout (Railway los captura), línea final con conteo.

Diseño
------
- Engine propio (no toca el del FastAPI app) → seguro para procesos
  cron que terminan; libera el pool cleanly con `engine.dispose()`.
- `text()` SQL directo (no ORM): la operación es batch, no necesita
  hidratar 50k objetos `SafetyEvent` para luego decir "borrales este
  key". Una sola query lo resuelve.
- Async porque `settings.DATABASE_URL` ya está coercido a
  `postgresql+asyncpg://` por `_coerce_async_pg_url`; usar sync
  requeriría coercer al revés y duplicar lógica.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings

# Ventana de retención en días. NO mover sin actualizar a la vez
# `docs/DATA_RETENTION_POLICY.md` y `docs/ADMIN_PANEL.md` (L2).
RETENTION_DAYS = 30

# Operador JSONB `-` con string elimina la clave del objeto. No usar `#-`
# (que toma un path array) porque `message_id` siempre es top-level del
# payload. Si en el futuro se anida (p.ej. payload.context.message_id),
# cambiar a `#-` y revisitar la política.
#
# `make_interval(days => :days)` con bind integer es preferible a
# `(:days || ' days')::interval`: la versión anterior dependía de que
# asyncpg infiriera TEXT del parámetro y de string-concat server-side,
# frágil ante un cambio de tipo o un type coercion de SQLAlchemy. La
# nueva versión usa el constructor canónico de PostgreSQL y un int
# explícito.
REDACT_SQL = text(
    """
    UPDATE safety_events
    SET    payload = payload - 'message_id'
    WHERE  created_at < NOW() - make_interval(days => :days)
      AND  payload ? 'message_id'
    """
)

# Connect timeout corto: si la BD está en restart/maintenance, asyncpg
# por defecto puede colgar ~60s antes de fallar. En un cron que corre
# 1×/día, queremos fallar rápido y visible (Railway logs) en lugar de
# bloquear el container. command_timeout=30s cubre el UPDATE (queries
# >1s aquí son síntoma de un problema mayor, no de carga normal).
_CONNECT_ARGS = {"timeout": 10, "command_timeout": 30}


async def redact_old_message_ids() -> int:
    # IMPORTANTE: no importes modelos ORM (`app.models.*`) en este
    # script. Mantenerlo en `text()` SQL puro evita arrancar el
    # mapper registry de SQLAlchemy (~200ms × N runs) y reduce la
    # superficie de fallo si la BD aún no tiene una tabla referenciada
    # por un mapper (escenario día-0 race).
    engine = create_async_engine(
        settings.DATABASE_URL, future=True, connect_args=_CONNECT_ARGS
    )
    try:
        async with engine.begin() as conn:
            result = await conn.execute(REDACT_SQL, {"days": RETENTION_DAYS})
            affected = result.rowcount or 0
            print(
                f"[redact_message_ids] redacted message_id from {affected} "
                f"safety_events older than {RETENTION_DAYS} days"
            )
        return 0
    except Exception as exc:  # noqa: BLE001 — cron debe devolver exit code limpio
        print(f"[redact_message_ids] ERROR: {exc!r}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()


def main() -> None:
    sys.exit(asyncio.run(redact_old_message_ids()))


if __name__ == "__main__":
    main()
