"""LLM provider factory.

The active provider is selected via the `LLM_PROVIDER` env var:

- `openai_compat` (default): uses `OpenAICompatAdapter` pointing at
  `LLM_BASE_URL` with `LLM_API_KEY` and `LLM_MODEL`. Works for the Google
  Gemini OpenAI-compat endpoint, OpenAI itself, vLLM/Ollama-hosted models,
  OpenRouter, etc.

- `gemini_native`: legacy adapter using the `google-generativeai` SDK against
  the Gemini-native `generateContent` endpoint. Kept as fallback and for
  Gemini-only features (caching, grounding) the OpenAI-compat layer doesn't
  expose.

This factory is intentionally a function (not a singleton) so each request
can construct a fresh adapter — matches the existing pattern in
`session_router._get_chat_service`.
"""

from app.core.config import settings
from app.services.llm.provider import LLMProvider


def get_llm_provider() -> LLMProvider:
    provider = (settings.LLM_PROVIDER or "openai_compat").lower()
    if provider == "gemini_native":
        from app.services.llm.gemini_adapter import GeminiAdapter

        return GeminiAdapter()
    # default
    from app.services.llm.openai_adapter import OpenAICompatAdapter

    return OpenAICompatAdapter()
