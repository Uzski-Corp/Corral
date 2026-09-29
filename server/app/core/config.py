"""Typed application settings.

Settings are loaded once from the environment (and an optional ``.env`` file) and are
immutable afterwards. They are attached to ``app.state.settings`` by :func:`create_app`
so request handlers never reach for a module-level global.
"""

from functools import lru_cache
from typing import Literal

from cryptography.fernet import Fernet
from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AppEnv = Literal["local", "test", "staging", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True)

    app_name: str = "Corral API"
    app_env: AppEnv = "local"
    log_level: LogLevel = "INFO"

    database_url: str = "postgresql+asyncpg://corral:corral@localhost:5432/corral"
    db_pool_size: int = Field(default=10, ge=1, le=100)
    db_max_overflow: int = Field(default=5, ge=0, le=100)
    db_connect_timeout_s: float = Field(default=10.0, gt=0, le=60)
    db_statement_timeout_ms: int = Field(default=15_000, ge=0)

    redis_url: str = "redis://localhost:6379/0"
    redis_timeout_s: float = Field(default=2.0, gt=0, le=30)

    # HTTP: requests exceeding this are answered with 504 (and their work cancelled).
    request_timeout_s: float = Field(default=30.0, gt=0, le=300)
    readiness_timeout_s: float = Field(default=2.0, gt=0, le=30)

    # Background worker (arq)
    worker_max_jobs: int = Field(default=10, ge=1, le=1000)
    worker_job_timeout_s: int = Field(default=300, ge=1)
    worker_max_tries: int = Field(default=5, ge=1, le=50)
    worker_shutdown_grace_s: int = Field(default=20, ge=0, le=300)

    # Observability
    otel_enabled: bool = False
    otel_service_name: str = "corral-api"
    # e.g. http://localhost:4318/v1/traces; unset falls back to OTEL_EXPORTER_OTLP_* env vars
    otel_exporter_otlp_endpoint: str | None = None
    otel_sample_ratio: float = Field(default=1.0, ge=0.0, le=1.0)
    metrics_enabled: bool = True
    # When set, GET /metrics requires "Authorization: Bearer <token>".
    metrics_token: SecretStr = SecretStr("")
    cors_origins: list[str] = ["http://localhost:3000"]

    workos_api_key: SecretStr = SecretStr("")
    workos_client_id: str = ""
    workos_cookie_password: SecretStr = SecretStr("")
    workos_redirect_uri: str = "http://localhost:8000/api/v1/auth/callback"
    workos_request_timeout_s: int = Field(default=10, ge=1, le=60)
    frontend_url: str = "http://localhost:3000"

    session_cookie_name: str = "wos_session"
    session_cookie_max_age_s: int = Field(default=60 * 60 * 24 * 30, ge=60)
    session_cookie_domain: str | None = None

    @field_validator("workos_cookie_password")
    @classmethod
    def _cookie_password_is_fernet_key(cls, value: SecretStr) -> SecretStr:
        raw = value.get_secret_value()
        if raw:
            try:
                Fernet(raw.encode())
            except ValueError as exc:
                raise ValueError(
                    "WORKOS_COOKIE_PASSWORD must be a urlsafe base64 32-byte Fernet key"
                ) from exc
        return value

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard_origin(cls, value: list[str]) -> list[str]:
        # Credentials (the session cookie) are sent cross-origin, so a wildcard is unsafe.
        if "*" in value:
            raise ValueError("CORS_ORIGINS must list explicit origins; '*' is not allowed")
        return value

    @model_validator(mode="after")
    def _deployed_envs_require_auth(self) -> "Settings":
        if self.app_env in ("staging", "production") and not self.workos_configured:
            raise ValueError(
                "WORKOS_API_KEY, WORKOS_CLIENT_ID and WORKOS_COOKIE_PASSWORD are required "
                f"when APP_ENV={self.app_env}"
            )
        return self

    @property
    def workos_configured(self) -> bool:
        return bool(
            self.workos_api_key.get_secret_value()
            and self.workos_client_id
            and self.workos_cookie_password.get_secret_value()
        )

    @property
    def cookie_secure(self) -> bool:
        return self.app_env not in ("local", "test")


@lru_cache
def get_settings() -> Settings:
    """Load settings from the process environment (cached; settings are immutable)."""
    return Settings()
