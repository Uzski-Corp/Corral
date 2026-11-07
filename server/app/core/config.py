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
EmbeddingProvider = Literal["hashing", "openai"]
DedupeScope = Literal["product", "org", "off"]
UnsubscribeScope = Literal["address", "company"]
MIB = 1024 * 1024
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]
PaddleEnvironment = Literal["sandbox", "production"]
PastDueAccess = Literal["unresolved", "retain", "revoke"]


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

    # One explicitly configured workspace may use the consent-only demo mailbox.
    pi_service_url: str = "http://127.0.0.1:8090"
    pi_service_token: SecretStr = SecretStr("")

    autosend_api_key: SecretStr = SecretStr("")
    autosend_webhook_secret: SecretStr = SecretStr("")
    autosend_demo_org_id: str = ""
    autosend_demo_from: str = ""
    autosend_demo_reply_to: str = ""
    autosend_demo_recipients: list[str] = []

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

    # Email-code sign-in limits, enforced in Redis before WorkOS's own limits.
    auth_code_send_per_email: int = Field(default=3, ge=1)
    auth_code_send_window_s: int = Field(default=60, ge=1)
    auth_code_verify_per_email: int = Field(default=10, ge=1)
    auth_code_verify_window_s: int = Field(default=600, ge=1)
    auth_code_send_per_ip: int = Field(default=20, ge=1)
    auth_code_verify_per_ip: int = Field(default=50, ge=1)
    auth_code_ip_window_s: int = Field(default=600, ge=1)

    # --- Knowledge base (ENG-65/66). Every default here is a product assumption listed in the
    # PR under "Decisions for Sean"; change them per environment without a deploy.
    # Upload limits (the client checks the same numbers first: client/lib/kb/upload.ts).
    kb_max_file_bytes: int = Field(default=25 * MIB, ge=1, le=512 * MIB)
    kb_max_sources_per_product: int = Field(default=200, ge=1)
    kb_max_bytes_per_product: int = Field(default=1024 * MIB, ge=1)
    kb_uploads_per_user: int = Field(default=60, ge=1)
    kb_upload_window_s: int = Field(default=600, ge=1)
    # "product": the same bytes (or URL) can't be added twice to one product's KB.
    # "org": not twice anywhere in the workspace. "off": no duplicate check.
    kb_dedupe_scope: DedupeScope = "product"
    # Parsing guards (per source)
    kb_max_pages: int = Field(default=500, ge=1)
    kb_max_text_chars: int = Field(default=2_000_000, ge=1_000)
    # A PDF page with less text than this is treated as a scan and skipped (no OCR yet).
    kb_min_page_chars: int = Field(default=20, ge=0)
    kb_ingest_timeout_s: int = Field(default=900, ge=1)  # whole job, incl. a 40-page crawl
    kb_parse_timeout_s: float = Field(default=120.0, gt=0, le=3600)
    kb_reject_active_content: bool = True  # macros, embedded files, PDF JavaScript
    kb_zip_max_entries: int = Field(default=2_000, ge=1)
    kb_zip_max_uncompressed_bytes: int = Field(default=200 * MIB, ge=1)
    kb_zip_max_ratio: int = Field(default=100, ge=1)
    # Chunking
    kb_chunk_chars: int = Field(default=1_200, ge=200, le=8_000)
    kb_chunk_overlap_chars: int = Field(default=150, ge=0, le=2_000)
    # Embeddings. "hashing" is a local, deterministic lexical embedder (no network): fine
    # for dev/tests, weaker than a model. "openai" calls any OpenAI-compatible endpoint.
    kb_embedding_provider: EmbeddingProvider = "hashing"
    kb_embedding_model: str = "text-embedding-3-small"
    kb_embedding_api_base: str = "https://api.openai.com/v1"
    kb_embedding_api_key: SecretStr = SecretStr("")
    kb_embedding_batch_size: int = Field(default=64, ge=1, le=2048)
    kb_embedding_timeout_s: float = Field(default=30.0, gt=0, le=300)
    # Retrieval
    kb_search_max_results: int = Field(default=20, ge=1, le=100)
    # Web pages
    kb_url_timeout_s: float = Field(default=15.0, gt=0, le=120)
    kb_url_max_bytes: int = Field(default=5 * MIB, ge=1_024)
    kb_url_max_redirects: int = Field(default=5, ge=0, le=20)
    kb_url_allowed_ports: list[int] = [80, 443]
    kb_crawl_max_pages: int = Field(default=40, ge=1, le=1_000)
    kb_url_user_agent: str = "CorralBot/0.1 (+https://corral.app/bot)"
    kb_respect_robots_txt: bool = True

    # --- Lead CRM (companies, people, imports, segments). Open product questions are
    # "Decisions for Sean" in the PR; every default here is one of them.
    leads_import_max_bytes: int = Field(default=20 * MIB, ge=1_024, le=512 * MIB)
    leads_import_max_rows: int = Field(default=50_000, ge=1)
    leads_import_max_columns: int = Field(default=100, ge=2, le=2_000)
    leads_import_max_field_chars: int = Field(default=10_000, ge=100, le=100_000)
    # Used when a file isn't UTF-8 (Excel's "CSV" is often Windows-1252). "" rejects it.
    leads_import_fallback_encoding: Literal["cp1252", "latin-1", ""] = "cp1252"
    leads_imports_per_user: int = Field(default=20, ge=1)
    leads_import_window_s: int = Field(default=3_600, ge=1)
    leads_import_timeout_s: int = Field(default=600, ge=1)
    leads_import_batch_rows: int = Field(default=1_000, ge=1, le=10_000)
    leads_max_companies_per_org: int = Field(default=100_000, ge=1)
    # Companies without a website are matched by exact (case/space-insensitive) name.
    leads_match_company_by_name: bool = True
    leads_query_max_limit: int = Field(default=200, ge=1, le=1_000)
    leads_max_rules: int = Field(default=20, ge=1, le=100)
    leads_bulk_max_ids: int = Field(default=1_000, ge=1)
    leads_bulk_max_rows: int = Field(default=100_000, ge=1)
    leads_bulk_confirm_at: int = Field(default=100, ge=1)  # the client's BULK_CONFIRM_AT
    # "address": unsubscribing suppresses that email. "company": every person there.
    leads_unsubscribe_scope: UnsubscribeScope = "address"
    # Until mailboxes exist (ENG-56), the enroll dry run spreads sends at this pool rate.
    leads_pool_sends_per_day: int = Field(default=210, ge=1)
    leads_replied_window_days: int = Field(default=30, ge=0)
    leads_enroll_allow_catch_all: bool = False

    # Workspace logo. WorkOS organizations have no logo (AuthKit branding is one mark for
    # the whole environment), so a company logo is stored in Cloudflare R2. Leave these
    # empty until the keys exist: upload then answers 503 instead of pretending to save.
    r2_account_id: str = ""
    r2_access_key_id: SecretStr = SecretStr("")
    r2_secret_access_key: SecretStr = SecretStr("")
    r2_bucket: str = ""
    # Public base the browser loads, no trailing slash. A custom domain or r2.dev URL.
    r2_public_base_url: str = ""
    logo_max_bytes: int = Field(default=2 * MIB, ge=1, le=20 * MIB)
    # Onboarding site read: few pages, short timeout, so it finishes inside REQUEST_TIMEOUT_S.
    onboarding_site_max_pages: int = Field(default=6, ge=1, le=20)
    onboarding_site_timeout_s: float = Field(default=8.0, gt=0, le=20)

    # Billing. The seven-day trial is a product rule, not a tunable allowance.
    # Price IDs stay empty until Sean maps confirmed Corral prices. Athena sandbox
    # price IDs are rejected. Access enforcement stays off until the existing-workspace
    # rollout is decided. Past-due access stays "unresolved" until that policy is chosen.
    paddle_environment: PaddleEnvironment = "sandbox"
    paddle_checkout_url: str = ""
    paddle_api_key: SecretStr = SecretStr("")
    paddle_webhook_secret: SecretStr = SecretStr("")
    paddle_api_timeout_s: float = Field(default=10.0, gt=0, le=30)
    # Paddle's SDK rejects webhook timestamps older than five seconds.
    paddle_webhook_tolerance_s: int = Field(default=5, ge=5, le=5)
    billing_trial_days: int = Field(default=7, ge=7, le=7)
    billing_enforce_access: bool = False
    billing_past_due_access: PastDueAccess = "unresolved"
    billing_reconcile_limit: int = Field(default=25, ge=1, le=100)
    billing_recheck_delay_s: int = Field(default=900, ge=60, le=86_400)
    paddle_price_field_month: str = ""
    paddle_price_field_year: str = ""
    paddle_price_range_month: str = ""
    paddle_price_range_year: str = ""
    paddle_price_territory_month: str = ""
    paddle_price_territory_year: str = ""

    @field_validator("pi_service_token")
    @classmethod
    def _pi_token_length(cls, value: SecretStr) -> SecretStr:
        if value.get_secret_value() and len(value.get_secret_value()) < 32:
            raise ValueError("PI_SERVICE_TOKEN must be at least 32 characters")
        return value

    @field_validator("paddle_checkout_url")
    @classmethod
    def _checkout_url(cls, value: str) -> str:
        if value and not value.startswith("https://"):
            raise ValueError("PADDLE_CHECKOUT_URL must use HTTPS")
        return value

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
    def _kb_limits_are_consistent(self) -> "Settings":
        if self.kb_chunk_overlap_chars >= self.kb_chunk_chars:
            raise ValueError("KB_CHUNK_OVERLAP_CHARS must be smaller than KB_CHUNK_CHARS")
        if self.kb_max_file_bytes > self.kb_max_bytes_per_product:
            raise ValueError("KB_MAX_FILE_BYTES cannot exceed KB_MAX_BYTES_PER_PRODUCT")
        if (
            self.kb_embedding_provider == "openai"
            and not self.kb_embedding_api_key.get_secret_value()
        ):
            raise ValueError("KB_EMBEDDING_API_KEY is required when KB_EMBEDDING_PROVIDER=openai")
        if self.leads_bulk_max_ids > self.leads_bulk_max_rows:
            raise ValueError("LEADS_BULK_MAX_IDS cannot exceed LEADS_BULK_MAX_ROWS")
        r2 = (
            self.r2_account_id,
            self.r2_access_key_id.get_secret_value(),
            self.r2_secret_access_key.get_secret_value(),
            self.r2_bucket,
            self.r2_public_base_url,
        )
        if any(r2) and not all(r2):
            raise ValueError(
                "Logo storage needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, "
                "R2_BUCKET and R2_PUBLIC_BASE_URL together"
            )
        if self.r2_public_base_url and not self.r2_public_base_url.startswith(
            ("https://", "http://")
        ):
            raise ValueError("R2_PUBLIC_BASE_URL must be an http(s) URL")
        return self

    @model_validator(mode="after")
    def _paddle_settings_match_the_environment(self) -> "Settings":
        from app.billing.catalog import validate_price_mappings

        key = self.paddle_api_key.get_secret_value()
        if key:
            sandbox_key = "sdbx" in key
            live_key = "_live_" in key or key.startswith("pdl_live")
            if self.paddle_environment == "sandbox" and live_key and not sandbox_key:
                raise ValueError("PADDLE_API_KEY is a live key but PADDLE_ENVIRONMENT=sandbox")
            if self.paddle_environment == "production" and sandbox_key:
                raise ValueError(
                    "PADDLE_API_KEY is a sandbox key but PADDLE_ENVIRONMENT=production"
                )
        if self.app_env == "production" and self.paddle_environment != "production" and key:
            raise ValueError("APP_ENV=production cannot use a Paddle sandbox API key")
        validate_price_mappings(self)
        return self

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

    @property
    def paddle_configured(self) -> bool:
        return bool(self.paddle_api_key.get_secret_value())

    @property
    def paddle_api_base(self) -> str:
        if self.paddle_environment == "sandbox":
            return "https://sandbox-api.paddle.com"
        return "https://api.paddle.com"

    @property
    def r2_configured(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key_id.get_secret_value()
            and self.r2_secret_access_key.get_secret_value()
            and self.r2_bucket
            and self.r2_public_base_url
        )


@lru_cache
def get_settings() -> Settings:
    """Load settings from the process environment (cached; settings are immutable)."""
    return Settings()
