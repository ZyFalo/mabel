from collections.abc import AsyncGenerator
from typing import Protocol


class LLMProvider(Protocol):
    async def generate_stream(
        self,
        messages: list[dict],
        system_prompt: str,
        config: dict | None = None,
        usage_sink: dict | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens from the underlying LLM.

        When ``usage_sink`` is provided, the adapter MUST populate it with
        token usage information once available (typically in the final
        stream chunk). Expected keys:

        - ``prompt_tokens`` (int): tokens consumed by the prompt.
        - ``completion_tokens`` (int): tokens produced by the model.

        Callers that don't need usage stats can omit ``usage_sink``;
        adapters MUST treat it as best-effort and never raise if the
        underlying provider doesn't expose usage.
        """
        ...
