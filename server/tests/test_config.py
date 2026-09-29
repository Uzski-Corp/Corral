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
