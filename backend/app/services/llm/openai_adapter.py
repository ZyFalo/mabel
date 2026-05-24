"""OpenAI-compatible LLM adapter.

Single implementation that works against ANY provider exposing the OpenAI
`/v1/chat/completions` schema:

- Google Gemini via its OpenAI-compat endpoint
  (https://generativelanguage.googleapis.com/v1beta/openai/)
- OpenAI itself
- Mabel-Gemma4 fine-tuned (Modal.com serverless, repo Gemma4-Mabel)
- A self-hosted fine-tuned model (vLLM, Ollama, llama.cpp, FastAPI wrapper, …)
- Any aggregator (OpenRouter, Groq, Together, …)

Switching providers requires changing only the `LLM_BASE_URL`, `LLM_API_KEY`
and `LLM_MODEL` env vars — no code change. La identidad de Mabel (nunca
exponer el modelo subyacente) la garantiza `prompts.build_system_prompt`,
upstream del adapter.

COLD START handling: Modal.com serverless apaga el worker tras 5 min idle.
Reanudarlo toma 60-90 s y devuelve HTTP 503 con `Loading model`. El adapter
implementa retry manual de 8 × 10 s específico para ese caso. Cualquier
otro 503 (rate limit, hard error) burbujea como ValueError tras un reintento.
"""

import asyncio
import logging
from collections.abc import AsyncGenerator

from openai import APIStatusError, AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


COLD_START_MAX_RETRIES = 8
COLD_START_BACKOFF_SECONDS = 10
# Transient errors (429/502/504) — el SDK los retiraba por default (2x)
# pero ahora `max_retries=0` los suprime. Compensamos manualmente con
# backoff exponencial corto: 1s, 2s, 4s. Cubre quota spikes breves y
# blips de red sin sumar latencia visible para el usuario.
TRANSIENT_MAX_RETRIES = 3
TRANSIENT_BASE_BACKOFF_SECONDS = 1.0


class OpenAICompatAdapter:
    def __init__(self) -> None:
        # `effective_llm_api_key` falls back to GEMINI_API_KEY when LLM_API_KEY
        # is empty — covers legacy .env files that only define the old name.
        self._client = AsyncOpenAI(
            api_key=settings.effective_llm_api_key,
            base_url=settings.LLM_BASE_URL,
            timeout=settings.LLM_TIMEOUT_MS / 1000,
            # max_retries=0 porque manejamos retries manualmente: el
            # SDK no diferencia 503 "modelo cargando" (esperar) de 503
            # "servicio caído" (avisar). Lo nuestro distingue por
            # status_code + body.
            max_retries=0,
        )
        self._model = settings.LLM_MODEL

    async def generate_stream(
        self,
        messages: list[dict],
        system_prompt: str,
        config: dict | None = None,
        usage_sink: dict | None = None,
    ) -> AsyncGenerator[str, None]:
        # OpenAI expects the system prompt as the first message with role "system".
        # Empty system_prompt is omitted so providers that disallow it don't 400.
        full_messages: list[dict] = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        for msg in messages:
            # messages come in already-OpenAI-shaped: {"role": "user|assistant", "content": str}
            full_messages.append({"role": msg["role"], "content": msg["content"]})

        kwargs: dict = {
            "model": self._model,
            "messages": full_messages,
            "stream": True,
            # `include_usage` makes the provider emit a terminal chunk with
            # empty `choices` and a populated `usage` block. Without this flag,
            # streaming responses NEVER expose token counts, which is why the
            # `messages.tokens_prompt/completion` columns were 0/28 populated.
            # Both OpenAI and Gemini's OpenAI-compat endpoint honor this option.
            "stream_options": {"include_usage": True},
        }
        if config:
            if "temperature" in config:
                kwargs["temperature"] = config["temperature"]
            if "max_output_tokens" in config:
                # OpenAI uses `max_tokens`; the chat_service layer keeps Gemini-style
                # key for backwards compat with the existing adapter.
                kwargs["max_tokens"] = config["max_output_tokens"]

        try:
            stream = await self._create_with_cold_start_retry(kwargs)
            async for chunk in stream:
                # The terminal usage chunk has empty `choices` but populated
                # `usage`. We must check usage BEFORE the early-continue on
                # empty choices, otherwise we'd silently drop it.
                if usage_sink is not None:
                    usage = getattr(chunk, "usage", None)
                    if usage is not None:
                        prompt_tokens = getattr(usage, "prompt_tokens", None)
                        completion_tokens = getattr(usage, "completion_tokens", None)
                        if prompt_tokens is not None:
                            usage_sink["prompt_tokens"] = int(prompt_tokens)
                        if completion_tokens is not None:
                            usage_sink["completion_tokens"] = int(completion_tokens)
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
        except Exception as e:  # noqa: BLE001 — wrap upstream class without leaking it
            raise ValueError(f"LLM_ERROR: {e}") from e

    async def _create_with_cold_start_retry(self, kwargs: dict):
        """Crea el stream con tolerancia a cold start + transient errors.

        Dos políticas de retry distintas según el tipo de error:

        1) 503 con body que contiene la frase exacta 'loading model':
           es el patrón documentado de Modal cold start. Reintentamos
           8 × 10s = 80s. Antes el detector usaba 'loading' OR 'model'
           pero 'model' aparece en casi todo error body OpenAI-compat
           ('model not found', 'model overloaded', etc.) y bloqueaba
           80s ante errores permanentes. Audit 2026-05-23.

        2) 429 (rate limit), 502/504 (bad gateway/timeout): retry corto
           con backoff exponencial (1s, 2s, 4s — 3 intentos total).
           Restaura la tolerancia del SDK default tras max_retries=0.

        Otros errores (4xx no-429, 5xx no-503/502/504, network hard
        errors) burbujean tras un solo intento.
        """
        last_err: Exception | None = None

        # Loop principal de cold-start (puede agotar 80s)
        for attempt in range(COLD_START_MAX_RETRIES):
            try:
                return await self._try_create_with_transient_retry(kwargs)
            except APIStatusError as e:
                last_err = e
                if e.status_code != 503:
                    raise
                body_text = ""
                try:
                    body_text = str(e.response.text or "")
                except Exception:  # noqa: BLE001
                    pass
                # Detección estricta del patrón Modal cold start. La
                # frase exacta del doc es "Loading model". Aceptamos
                # case-insensitive para tolerar variantes.
                is_cold_start = "loading model" in body_text.lower()
                if not is_cold_start:
                    # 503 de otra causa (rate limit hard, proxy abajo) —
                    # bubble out inmediato.
                    raise
                logger.info(
                    "LLM cold start in progress, retrying in %ds (attempt %d/%d)",
                    COLD_START_BACKOFF_SECONDS,
                    attempt + 1,
                    COLD_START_MAX_RETRIES,
                )
                await asyncio.sleep(COLD_START_BACKOFF_SECONDS)

        raise ValueError(
            f"LLM cold start no respondio tras {COLD_START_MAX_RETRIES} "
            f"intentos de {COLD_START_BACKOFF_SECONDS}s. ultimo error: {last_err}"
        )

    async def _try_create_with_transient_retry(self, kwargs: dict):
        """Retry corto para errores transientes (429/502/504).

        Backoff exponencial: 1s, 2s, 4s entre intentos (max 3 totales).
        Total worst-case extra: ~7s antes de bubble — invisible para
        cold start (80s) pero suficiente para resistir un blip de
        rate limit / gateway. Cualquier otro error burbujea inmediato.
        """
        for attempt in range(TRANSIENT_MAX_RETRIES):
            try:
                return await self._client.chat.completions.create(**kwargs)
            except APIStatusError as e:
                # 429 rate limit y 502/504 gateway → retry.
                # 503 lo deja salir para que el outer loop decida cold-start.
                if e.status_code in (429, 502, 504) and attempt < TRANSIENT_MAX_RETRIES - 1:
                    backoff = TRANSIENT_BASE_BACKOFF_SECONDS * (2 ** attempt)
                    logger.info(
                        "LLM transient error %d, retrying in %.1fs (attempt %d/%d)",
                        e.status_code,
                        backoff,
                        attempt + 1,
                        TRANSIENT_MAX_RETRIES,
                    )
                    await asyncio.sleep(backoff)
                    continue
                raise
        # Defensive — never reached, el loop siempre return o raise antes
        raise RuntimeError("transient retry loop fell through")
