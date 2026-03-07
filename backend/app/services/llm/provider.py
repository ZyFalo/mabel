from collections.abc import AsyncGenerator
from typing import Protocol


class LLMProvider(Protocol):
    async def generate_stream(
        self,
        messages: list[dict],
        system_prompt: str,
        config: dict | None = None,
    ) -> AsyncGenerator[str, None]: ...
