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
        """Crea el stream con tolerancia a cold start del provider.

        Modal.com (donde vive Mabel-Gemma4) apaga el worker tras 5 min
        de inactividad. Reanudarlo toma 60-90 s y devuelve HTTP 503
        con body `{"error":{"message":"Loading model"}}`. Reintentamos
        cada 10 s hasta 8 veces (~80 s = budget suficiente para el
        cold start típico). Otros 503 (rate limit, hard error) burbujan
        tras un solo intento.

        Para providers warm (Gemini, OpenAI directo) la primera llamada
        funciona y no hay overhead — `for attempt in range(MAX)` corta
        al primer éxito.
        """
        last_err: Exception | None = None
        for attempt in range(COLD_START_MAX_RETRIES):
            try:
                return await self._client.chat.completions.create(**kwargs)
            except APIStatusError as e:
                last_err = e
                if e.status_code != 503:
                    # No es cold start: re-raise inmediato sin esperar.
                    raise
                body_text = ""
                try:
                    body_text = str(e.response.text or "")
                except Exception:  # noqa: BLE001
                    pass
                is_loading = "loading" in body_text.lower() or "model" in body_text.lower()
                if not is_loading:
                    # 503 no relacionado a cold start (proxy down, etc.)
                    raise
                logger.info(
                    "LLM cold start in progress, retrying in %ds (attempt %d/%d)",
                    COLD_START_BACKOFF_SECONDS,
                    attempt + 1,
                    COLD_START_MAX_RETRIES,
                )
                await asyncio.sleep(COLD_START_BACKOFF_SECONDS)
        # Agotamos retries: re-raise el ultimo error con contexto.
        raise ValueError(
            f"LLM cold start no respondio tras {COLD_START_MAX_RETRIES} "
            f"intentos de {COLD_START_BACKOFF_SECONDS}s. ultimo error: {last_err}"
        )
