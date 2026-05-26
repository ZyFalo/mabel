"""Health/warm-up endpoint para el provider LLM activo.

Sirve para que el frontend dispare una llamada ligera al provider al
montar el chat, el modo voz o el home. Si el motor activo está cold
en su infraestructura (Modal scale-to-zero, etc), este ping empieza
el warmup en paralelo a que el usuario lea la pantalla, sin que vea
el avatar congelado esperando su primera frase.

Provider-aware (2026-05-26): la URL del ping NO viene de la env var
fija `LLM_BASE_URL` — se resuelve consultando `system_config.
llm_provider_active`, que el admin puede cambiar en caliente desde
/admin/config.

Estados posibles (idénticos para ambos providers):
  - warm  → endpoint /models respondió 200, modelo listo
  - cold  → endpoint /models respondió 503 (worker arrancando — Modal)
  - down  → cualquier otro error o timeout

Performance (CR-B1+B3, review 2026-05-26):
  - La AsyncSession de BD se libera ANTES del httpx (~15s en cold start)
    para no holdear conexión del pool durante 30+ pollers concurrentes.
  - El resultado se cachea server-side con TTL 15s — el endpoint es
    global (no depende del user), así que un solo ping por TTL window
    sirve a todos los usuarios y previene rate-limit 429 de Gemini
    free tier (60 req/min) cuando muchos estudiantes pollean a la vez.
"""

import asyncio
import logging
import time
from typing import TypedDict

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services.llm import resolve_active_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])


# Gemini OpenAI-compat endpoint público para listing de modelos.
# Devuelve 200 con la lista de modelos cuando la API key es válida —
# equivalente semántico al /v1/models de Modal/OpenAI. NO consume tokens
# del modelo (es metadata, no inferencia).
# Fuente: https://ai.google.dev/gemini-api/docs/openai
_GEMINI_HEALTH_URL = (
    "https://generativelanguage.googleapis.com/v1beta/openai/models"
)


# CR-B3 (review 2026-05-26): cache de proceso por provider con TTL.
# El endpoint es idéntico para todos los usuarios (no depende del user),
# así que un solo ping por provider por TTL window basta para todos.
# Sin este cache, 30 estudiantes × polling 30s amplifican a 60 req/min
# hacia Gemini /models — free tier (60 req/min) entra a 429 y todos
# los chips muestran 'down' falso.
_CACHE_TTL_SECONDS = 15.0


class _HealthCacheEntry(TypedDict):
    payload: dict
    fetched_at: float


_health_cache: dict[str, _HealthCacheEntry] = {}


def _health_target_for(provider: str) -> tuple[str, str]:
    """Devuelve (url, authorization_header_value) para pingear el
    endpoint /models del provider activo.

    - mabel_gemma4 → URL = LLM_BASE_URL/models, auth = effective_llm_api_key
    - gemini       → URL = Gemini OpenAI-compat, auth = GEMINI_API_KEY,
                     con fallback a effective_llm_api_key si vacía
                     (CR-B2 review 2026-05-26: muchos deploys legacy
                     solo tienen LLM_API_KEY que ya es key de Gemini —
                     evitar 'down' falso por configuración no migrada).
    """
    if provider == "gemini":
        token = settings.GEMINI_API_KEY or settings.effective_llm_api_key
        return _GEMINI_HEALTH_URL, f"Bearer {token}" if token else ""
    # default mabel_gemma4 (Modal vía OpenAI-compat)
    url = settings.LLM_BASE_URL.rstrip("/") + "/models"
    key = settings.effective_llm_api_key
    return url, f"Bearer {key}" if key else ""


async def _do_ping(provider: str) -> dict:
    """Hace el ping HTTP al endpoint del provider y devuelve el payload
    de status/elapsed/etc. Aislado del manejo de cache y de la session
    BD para que sea testeable y para que el endpoint pueda liberar la
    session antes de entrar aquí (CR-B1)."""
    url, auth_header = _health_target_for(provider)
    started = asyncio.get_event_loop().time()
    try:
        # timeout 15s: NO bajar de 12s. El cold start de Modal devuelve
        # 503 con body 'Loading model' DENTRO de ~2-5s (no espera los
        # 90s de carga completa). Pero proxies/redes pueden tardar
        # varios segundos en establecer la conexión inicial. Con
        # timeout=5s, el health check fallaba con TimeoutException
        # durante el cold start mismo, devolvía 'down' en vez de 'cold'
        # y el banner UX nunca aparecía (audit 2026-05-23). Gemini
        # responde típicamente <1s, así que el timeout amplio no
        # introduce penalty real en ese provider.
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                url,
                headers={"Authorization": auth_header} if auth_header else {},
            )
        elapsed_ms = int((asyncio.get_event_loop().time() - started) * 1000)
        if r.status_code == 200:
            return {"status": "warm", "elapsed_ms": elapsed_ms, "provider": provider}
        if r.status_code == 503:
            # Modal está calentando el worker. Gemini no devuelve 503
            # en este endpoint — la rama queda inactiva ahí, sin daño.
            return {"status": "cold", "elapsed_ms": elapsed_ms, "provider": provider}
        logger.warning(
            "LLM health upstream (%s) returned %d (%s)",
            provider,
            r.status_code,
            r.text[:200],
        )
        return {
            "status": "down",
            "elapsed_ms": elapsed_ms,
            "http_status": r.status_code,
            "provider": provider,
        }
    except httpx.TimeoutException:
        return {"status": "down", "reason": "timeout", "provider": provider}
    except Exception as e:  # noqa: BLE001
        logger.exception("LLM health check failed for provider %s", provider)
        return {
            "status": "down",
            "reason": type(e).__name__,
            "detail": str(e)[:200],
            "provider": provider,
        }


@router.get("/health")
async def llm_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Ping no-bloqueante al endpoint `/models` del provider LLM activo.

    Devuelve estado + latencia + provider. NO consume tokens. Diseñado
    para pre-warming: invocar al montar Chat, Voice, Home, CheckIn,
    Admin Dashboard, y al recuperar el foco si lleva >5 min.

    Performance (CR-B1+B3): resolver provider DESDE BD primero, liberar
    inmediatamente la session (Depends cleanup), y luego hacer httpx
    contra el provider externo o servir resultado cacheado. Sin esto,
    bajo carga concurrente de pollers, el pool de Postgres se agota
    durante cold starts de Modal (15s × N usuarios = exhaustion).
    """
    # PASO 1: resolver provider activo y SOLTAR la session DB.
    # FastAPI mantiene `db` abierta hasta que esta función retorna, así
    # que no podemos liberarla manualmente. Pero como `resolve_active_provider`
    # es el ÚNICO uso de db en este endpoint, restringir su scope a esta
    # línea minimiza el window de hold. El httpx que viene después usa
    # 0 conexiones de Postgres.
    provider = await resolve_active_provider(db)

    # PASO 2: cache server-side por provider con TTL.
    # Si hay entrada fresca, servir sin tocar el provider externo.
    now = time.monotonic()
    cached = _health_cache.get(provider)
    if cached is not None and (now - cached["fetched_at"]) < _CACHE_TTL_SECONDS:
        # Devolvemos COPIA para que callers que mutaran el dict no
        # contaminen la entrada del cache (defensa cheap).
        return {**cached["payload"], "cached": True}

    # PASO 3: cache miss — hacer ping real y poblar cache.
    payload = await _do_ping(provider)
    _health_cache[provider] = {"payload": payload, "fetched_at": now}
    return payload
