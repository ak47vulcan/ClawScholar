from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # === Primary LLM provider (OpenAI) ===
    openai_api_key: str = Field(default="", validation_alias=AliasChoices("OPENAI_API_KEY"))
    openai_model: str = Field(
        default="gpt-4.1-mini",
        validation_alias=AliasChoices("OPENAI_MODEL"),
    )

    # === Embeddings (optional) ===
    # If not set, vector embeddings are disabled and RAG should fall back to BM25-only.
    embeddings_base_url: str = Field(default="")
    embeddings_api_key: str = Field(default="")
    embeddings_model: str = Field(default="text-embedding-3-small")

    # Database
    database_url: str = Field(default="postgresql+asyncpg://clawscholar:clawscholar@localhost:5432/clawscholar")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0")

    # Auth
    jwt_secret_key: str = Field(default="dev-secret-change-in-production")
    jwt_algorithm: str = Field(default="HS256")
    jwt_expiry_minutes: int = Field(default=1440)

    # Storage
    upload_dir: str = Field(default="/app/uploads")

    # Sandbox
    sandbox_timeout_seconds: int = Field(default=30)
    sandbox_queue_execute: str = Field(default="sandbox:execute")
    sandbox_queue_result_prefix: str = Field(default="sandbox:result")

    # Logging
    log_level: str = Field(default="DEBUG")
    log_format: str = Field(default="json")

    # CORS
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ],
        validation_alias=AliasChoices("CORS_ORIGINS"),
    )

    # Migrations
    run_migrations_on_startup: bool = Field(
        default=True,
        validation_alias=AliasChoices("RUN_MIGRATIONS_ON_STARTUP"),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
