from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Corral API"
    app_env: str = "local"
    database_url: str = "postgresql+asyncpg://corral:corral@localhost:5432/corral"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:3000"]

    workos_api_key: str = ""
    workos_client_id: str = ""
    workos_cookie_password: str = ""
    workos_redirect_uri: str = "http://localhost:8000/api/v1/auth/callback"
    frontend_url: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
