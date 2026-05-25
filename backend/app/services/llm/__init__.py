"""LLM provider factory.

El proveedor activo se determina, en orden de precedencia:

1. **BD** — `system_config.llm_provider_active` ("mabel_gemma4" | "gemini").
   Editable en caliente desde el panel admin (`/admin/config`) sin
   redeploy. Cada request lee la key vía `SystemConfigRepository`, que
   ya tiene cache per-instance (un solo SELECT por request, no por
   turno). El costo es despreciable y NO requiere cache de proceso —
   evita el problema clásico multi-worker donde invalidar el cache
   solo afecta al worker actual y los demás siguen sirviendo el
   provider viejo hasta el TTL (CR-03, review 2026-05-25).

2. **Env var `LLM_PROVIDER`** (fallback) — usado por scripts offline
   (`smoke_tokens_capture.py`) y como bootstrap si la BD no está
   disponible al primer arranque.

Mapeo de valores:
- `"mabel_gemma4"` o `"openai_compat"` → `OpenAICompatAdapter` apuntando
  a Modal o cualquier endpoint OpenAI-compat (`LLM_BASE_URL`).
- `"gemini"` o `"gemini_native"` → `GeminiAdapter` (SDK `google-generativeai`,
  usa `GEMINI_API_KEY`).

Esta factory devuelve una tupla `(adapter, provider_name)` — el nombre
viaja junto al adapter para que el `ChatService` pueda condicionar
comportamientos según el motor (p.ej. añadir el voice-mode TTS suffix
solo para Gemini, no para Mabel-Gemma4 que ya está fine-tuneada a ese
estilo) sin volver a leer la BD.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.config import settings
from app.services.llm.provider import LLMProvider

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def _resolve_active_provider(db: AsyncSession | None) -> str:
    """Devuelve "mabel_gemma4" o "gemini" leyendo BD (si hay) con fallback a env."""
    if db is None:
        return _provider_from_env()

    try:
        from app.repositories.system_config_repository import SystemConfigRepository

        repo = SystemConfigRepository(db)
        raw = await repo.get_value("llm_provider_active")
        if isinstance(raw, str) and raw.strip():
            value = raw.strip().lower()
            # Aceptamos los alias del storage layer (legacy 'openai_compat'
            # mapea al deploy productivo de Mabel-Gemma4 en Modal).
            if value in ("gemini", "gemini_native"):
                return "gemini"
            return "mabel_gemma4"
    except Exception:  # noqa: BLE001 — cualquier fallo de BD cae a env
        # No tumbar el chat si la lectura de config falla. Log mínimo
        # para no contaminar el response stream del LLM.
        import logging

        logging.getLogger(__name__).warning(
            "llm_provider_active read failed, falling back to env LLM_PROVIDER"
        )
    return _provider_from_env()


def _provider_from_env() -> str:
    """Devuelve el provider derivado de env vars (bootstrap / fallback).

    Normaliza alias del storage layer: 'openai_compat' apunta semánticamente
    al modelo propio Mabel-Gemma4 cuando LLM_BASE_URL es Modal. Devolvemos
    solo dos valores ('mabel_gemma4' o 'gemini') al resto del código.
    """
    raw = (settings.LLM_PROVIDER or "openai_compat").lower()
    if raw in ("gemini_native", "gemini"):
        return "gemini"
    return "mabel_gemma4"


async def get_llm_provider(
    db: AsyncSession | None = None,
) -> tuple[LLMProvider, str]:
    """Devuelve (adapter, provider_name) según la key BD o env fallback.

    `provider_name` se propaga al `ChatService` para que pueda condicionar
    comportamientos por motor sin re-leer la BD (ver `ChatService.__init__`
    docstring para el rationale).
    """
    active = await _resolve_active_provider(db)
    if active == "gemini":
        from app.services.llm.gemini_adapter import GeminiAdapter

        return GeminiAdapter(), "gemini"
    # default 'mabel_gemma4' → adapter OpenAI-compat apuntando a Modal.
    from app.services.llm.openai_adapter import OpenAICompatAdapter

    return OpenAICompatAdapter(), "mabel_gemma4"
