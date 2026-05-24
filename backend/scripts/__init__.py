"""Marker package for `backend/scripts/`.

Existe para que `python -m scripts.<name>` sea canónicamente válido
(no depender de PEP 420 namespace packages). Esto es relevante para:
- `python -m scripts.redact_old_message_ids` invocado por el cron de
  Railway (`railway.cron.toml`).
- Reproducción local del smoke test sin necesitar PYTHONPATH.

Sin este archivo, `python -m scripts.x` aún funciona vía namespace
packages, pero el comportamiento depende de que ningún sibling
shadowee `scripts` y agrega un punto de fallo silencioso. Mejor
declararlo paquete.
"""
