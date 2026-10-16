from typing import Any

import pytest
from pydantic import ValidationError

from app.config import DEV_JWT_SECRET, Settings

GOOD_SECRET = "x" * 40


def production(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "environment": "production",
        "jwt_secret": GOOD_SECRET,
        "cookie_secure": True,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_development_accepts_defaults() -> None:
    settings = Settings(_env_file=None)
    assert settings.environment == "development"
    assert settings.jwt_secret == DEV_JWT_SECRET
    assert settings.cookie_secure is False


def test_production_with_valid_values_starts() -> None:
    assert production().environment == "production"


def test_production_rejects_default_secret() -> None:
    with pytest.raises(ValidationError, match="development default"):
        production(jwt_secret=DEV_JWT_SECRET)


def test_production_rejects_short_secret() -> None:
    with pytest.raises(ValidationError, match="at least 32"):
        production(jwt_secret="short")


def test_production_rejects_insecure_cookie() -> None:
    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        production(cookie_secure=False)


def test_unknown_environment_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="staging")
