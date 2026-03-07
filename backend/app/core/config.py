from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve .env from project root (parent of backend/)
_env_file = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_TIMEOUT_MS: int = 30000
    CORS_ORIGINS: str = "http://localhost:5173"
    CONTEXT_WINDOW_SIZE: int = 20

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": str(_env_file), "env_file_encoding": "utf-8"}


settings = Settings()
