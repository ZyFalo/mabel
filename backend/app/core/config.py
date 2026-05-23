from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve .env from project root (parent of backend/)
_env_file = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    # --- LLM provider selection (OpenAI-compatible by default) -----------
    # `openai_compat` works for: Gemini OpenAI-compat endpoint, OpenAI,
    # vLLM/Ollama, OpenRouter, or any service exposing /v1/chat/completions.
    # `gemini_native` keeps the legacy `google-generativeai` SDK as fallback.
    LLM_PROVIDER: str = "openai_compat"
    LLM_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.5-flash"
    LLM_TIMEOUT_MS: int = 30000
    # --- Legacy Gemini-native config (kept for the fallback adapter) -----
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_TIMEOUT_MS: int = 30000
    CORS_ORIGINS: str = "http://localhost:5173"
    CONTEXT_WINDOW_SIZE: int = 20
    WHISPER_MODEL: str = "base"
    PIPER_VOICE: str = "es_ES-mls_9972-low"
    PIPER_MODEL_PATH: str = "models/piper/"
    UPLOAD_DIR: str = "uploads/audio/"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def effective_llm_api_key(self) -> str:
        """
        Resolve the LLM API key with fallback to GEMINI_API_KEY.

        Why this exists: legacy .env files only define GEMINI_API_KEY (the
        repo lived on Gemini-native for months before the OpenAI-compat
        migration). Without this fallback, anyone pulling the new branch
        without updating their .env would boot AsyncOpenAI with api_key=''
        and every chat request would 401.

        Preference order: LLM_API_KEY → GEMINI_API_KEY → empty.
        Consumers should always read this property, NEVER `LLM_API_KEY`
        directly.
        """
        if self.LLM_API_KEY:
            return self.LLM_API_KEY
        return self.GEMINI_API_KEY

    model_config = {"env_file": str(_env_file), "env_file_encoding": "utf-8"}


def _coerce_async_pg_url(url: str) -> str:
    """Railway's Postgres plugin injects DATABASE_URL as `postgres://` or
    `postgresql://`. SQLAlchemy + asyncpg need the explicit driver
    suffix (`postgresql+asyncpg://`), otherwise the engine boots with
    the sync psycopg2 driver and async sessions fail at startup.
    """
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


settings = Settings()
settings.DATABASE_URL = _coerce_async_pg_url(settings.DATABASE_URL)
