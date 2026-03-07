from collections.abc import AsyncGenerator

import google.generativeai as genai

from app.core.config import settings


class GeminiAdapter:
    def __init__(self) -> None:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self._model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
        )
        self._timeout = settings.GEMINI_TIMEOUT_MS / 1000  # convert to seconds

    async def generate_stream(
        self,
        messages: list[dict],
        system_prompt: str,
        config: dict | None = None,
    ) -> AsyncGenerator[str, None]:
        generation_config = {}
        if config:
            if "temperature" in config:
                generation_config["temperature"] = config["temperature"]
            if "max_output_tokens" in config:
                generation_config["max_output_tokens"] = config["max_output_tokens"]

        # Build Gemini contents format
        contents = []
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [msg["content"]]})

        try:
            response = await self._model.generate_content_async(
                contents,
                generation_config=genai.GenerationConfig(**generation_config) if generation_config else None,
                stream=True,
                request_options={"timeout": self._timeout},
            )

            async for chunk in response:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            raise ValueError(f"LLM_ERROR: {e}") from e
