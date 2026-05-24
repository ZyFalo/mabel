"""Health/warm-up endpoint para el provider LLM.

Sirve para que el frontend dispare una llamada ligera (`GET /v1/models`
al provider) al montar el chat o el modo voz, antes de que el usuario
escriba o hable. Si Mabel-Gemma4 está cold en Modal.com, este ping
empieza el cold start de 60-90s en paralelo a que el usuario lea la
pantalla, sin que vea el avatar congelado esperando su primera frase.

Estados posibles:
  - warm  → /v1/models respondió 200, modelo listo
  - cold  → /v1/models respondió 503 (worker arrancando)
  - down  → cualquier otro error
"""

import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends

from app.core.config import settings
from app.middleware.auth import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/health")
async def llm_health(current_user: User = Depends(get_current_user)) -> dict:
    """Ping no-bloqueante al endpoint `/models` del provider LLM.

    Devuelve estado + latencia. NO consume tokens. Diseñado para
    pre-warming: invocar al montar Chat o Voice y al perder foco/
    recuperar foco si lleva >5 min.
    """
    url = settings.LLM_BASE_URL.rstrip("/") + "/models"
    # timeout 15s: NO bajar de 12s. El cold start de Modal devuelve 503
    # con body 'Loading model' DENTRO de ~2-5s (no espera los 90s de
    # carga completa). Pero proxies/redes pueden tardar varios segundos
    # en establecer la conexión inicial. Con timeout=5s, el health
    # check fallaba con TimeoutException durante el cold start mismo,
    # devolvía 'down' en vez de 'cold' y el banner UX nunca aparecía
    # (defeat del propósito de la feature). Audit 2026-05-23.
    started = asyncio.get_event_loop().time()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                url,
                headers={
                    "Authorization": (
                        f"Bearer {settings.effective_llm_api_key}"
                        if settings.effective_llm_api_key
                        else ""
                    )
                },
            )
        elapsed_ms = int((asyncio.get_event_loop().time() - started) * 1000)
        if r.status_code == 200:
            return {"status": "warm", "elapsed_ms": elapsed_ms}
        if r.status_code == 503:
            # Modal está calentando el worker — el cliente sabrá que la
            # primera respuesta tardará. NO retornamos 503 porque eso
            # confundiria al front (parecería que el HEALTH endpoint
            # mismo está abajo); usamos 200 con status semántico.
            return {"status": "cold", "elapsed_ms": elapsed_ms}
        logger.warning(
            "LLM health upstream returned %d (%s)", r.status_code, r.text[:200]
        )
        return {
            "status": "down",
            "elapsed_ms": elapsed_ms,
            "http_status": r.status_code,
        }
    except httpx.TimeoutException:
        return {"status": "down", "reason": "timeout"}
    except Exception as e:  # noqa: BLE001
        logger.exception("LLM health check failed")
        return {"status": "down", "reason": type(e).__name__, "detail": str(e)[:200]}
