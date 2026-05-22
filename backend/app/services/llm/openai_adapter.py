"""OpenAI-compatible LLM adapter.

Single implementation that works against ANY provider exposing the OpenAI
`/v1/chat/completions` schema:

- Google Gemini via its OpenAI-compat endpoint
  (https://generativelanguage.googleapis.com/v1beta/openai/)
- OpenAI itself
- A self-hosted fine-tuned model (vLLM, Ollama, llama.cpp, FastAPI wrapper, …)
- Any aggregator (OpenRouter, Groq, Together, …)

Switching providers requires changing only the `LLM_BASE_URL`, `LLM_API_KEY`
and `LLM_MODEL` env vars — no code change. The Mabel/Gemini identity policy
(never expose the underlying brand) is honored by `prompts.build_system_prompt`,
which is upstream of this adapter.
"""

from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from app.core.config import settings


class OpenAICompatAdapter:
    def __init__(self) -> None:
        # `effective_llm_api_key` falls back to GEMINI_API_KEY when LLM_API_KEY
        # is empty — covers legacy .env files that only define the old name.
        self._client = AsyncOpenAI(
            api_key=settings.effective_llm_api_key,
            base_url=settings.LLM_BASE_URL,
            timeout=settings.LLM_TIMEOUT_MS / 1000,
        )
        self._model = settings.LLM_MODEL

    async def generate_stream(
        self,
        messages: list[dict],
        system_prompt: str,
        config: dict | None = None,
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
        }
        if config:
            if "temperature" in config:
                kwargs["temperature"] = config["temperature"]
            if "max_output_tokens" in config:
                # OpenAI uses `max_tokens`; the chat_service layer keeps Gemini-style
                # key for backwards compat with the existing adapter.
                kwargs["max_tokens"] = config["max_output_tokens"]

        try:
            stream = await self._client.chat.completions.create(**kwargs)
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
        except Exception as e:  # noqa: BLE001 — wrap upstream class without leaking it
            raise ValueError(f"LLM_ERROR: {e}") from e
