import pytest
from cryptography.fernet import Fernet
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from tests.conftest import make_settings


def test_defaults_are_local_and_unconfigured() -> None:
    s = Settings(_env_file=None, workos_api_key="", workos_client_id="")
    assert s.app_env in ("local", "test", "staging", "production")
    assert s.workos_configured is False


def test_configured_when_all_keys_present() -> None:
    assert make_settings().workos_configured is True


@pytest.mark.parametrize(
    "missing", ["workos_api_key", "workos_client_id", "workos_cookie_password"]
)
def test_not_configured_when_any_key_missing(missing: str) -> None:
    assert make_settings(**{missing: ""}).workos_configured is False


def test_rejects_non_fernet_cookie_password() -> None:
    with pytest.raises(ValidationError, match="Fernet"):
        make_settings(workos_cookie_password="not-a-key")


def test_accepts_fernet_cookie_password() -> None:
    key = Fernet.generate_key().decode()
    assert (
        make_settings(workos_cookie_password=key).workos_cookie_password.get_secret_value() == key
    )


def test_paddle_rejects_athena_price_ids() -> None:
    with pytest.raises(ValidationError, match="Athena"):
        make_settings(paddle_price_field_month="pri_01m215b0ecq2b4ax936hxkg1zp")


def test_trial_length_is_seven_days() -> None:
    assert make_settings().billing_trial_days == 7
    with pytest.raises(ValidationError):
        make_settings(billing_trial_days=14)


def test_paddle_environment_cannot_mix_live_and_sandbox_keys() -> None:
    with pytest.raises(ValidationError, match="sandbox"):
        make_settings(paddle_environment="sandbox", paddle_api_key="pdl_live_apikey_example")


def test_r2_keys_are_all_or_nothing() -> None:
    with pytest.raises(ValidationError, match="R2_ACCOUNT_ID"):
        make_settings(r2_account_id="acct")
    assert make_settings().r2_configured is False


def test_rejects_wildcard_cors() -> None:
    with pytest.raises(ValidationError, match="explicit origins"):
        make_settings(cors_origins=["*"])


@pytest.mark.parametrize("env", ["staging", "production"])
def test_deployed_envs_require_workos(env: str) -> None:
    with pytest.raises(ValidationError, match="required"):
        make_settings(app_env=env, workos_api_key="")
    assert make_settings(app_env=env).app_env == env


@pytest.mark.parametrize(
    ("env", "secure"), [("local", False), ("test", False), ("staging", True), ("production", True)]
)
def test_cookie_secure_outside_local(env: str, secure: bool) -> None:
    assert make_settings(app_env=env).cookie_secure is secure


def test_secrets_are_not_rendered() -> None:
    rendered = repr(make_settings())
    assert "sk_test_dummy" not in rendered


def test_settings_are_frozen() -> None:
    s = make_settings()
    with pytest.raises(ValidationError):
        s.app_env = "production"  # type: ignore[misc]


def test_get_settings_is_cached() -> None:
    get_settings.cache_clear()
    try:
        assert get_settings() is get_settings()
    finally:
        get_settings.cache_clear()


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"kb_chunk_chars": 500, "kb_chunk_overlap_chars": 500}, "KB_CHUNK_OVERLAP_CHARS"),
        ({"kb_max_file_bytes": 2_000, "kb_max_bytes_per_product": 1_000}, "KB_MAX_FILE_BYTES"),
        ({"kb_embedding_provider": "openai"}, "KB_EMBEDDING_API_KEY"),
    ],
)
def test_inconsistent_kb_settings_are_rejected(overrides: dict[str, object], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        make_settings(**overrides)


def test_openai_embeddings_with_a_key_are_accepted() -> None:
    s = make_settings(kb_embedding_provider="openai", kb_embedding_api_key="sk-test")
    assert s.kb_embedding_api_key.get_secret_value() == "sk-test"


def test_r2_public_base_url_must_be_http() -> None:
    r2 = {
        "r2_account_id": "acct",
        "r2_access_key_id": "AK",
        "r2_secret_access_key": "SK",
        "r2_bucket": "b",
    }
    with pytest.raises(ValidationError, match="http"):
        make_settings(**r2, r2_public_base_url="cdn.test")
    assert make_settings(**r2, r2_public_base_url="https://cdn.test").r2_configured is True
