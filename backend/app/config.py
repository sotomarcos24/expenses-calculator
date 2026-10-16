from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me-in-production"
MIN_PRODUCTION_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "PersonalDolar"
    # "development" (default) or "production"; production enforces the secret/cookie guard below.
    environment: Literal["development", "production"] = "development"
    # Built frontend served by the API when the directory exists (relative paths resolve
    # against the backend directory). The Docker image sets /app/frontend/dist.
    frontend_dist_dir: str = "../frontend/dist"
    database_url: str = "sqlite:///./dev.db"
    # Dev-only default (>= 32 bytes so PyJWT does not warn). Set JWT_SECRET in production.
    jwt_secret: str = DEV_JWT_SECRET
    access_token_days: int = 7
    cookie_secure: bool = False
    # Per-IP attempts per window on login / register; 0 disables that limit.
    rate_limit_login_attempts: int = 10
    rate_limit_register_attempts: int = 5
    rate_limit_window_seconds: int = 60
    # Number of trusted reverse proxies in front of the app (0 = use the socket IP).
    trusted_proxy_count: int = 0

    @model_validator(mode="after")
    def _check_production(self) -> Self:
        if self.environment != "production":
            return self
        if self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET must not be the development default in production")
        if len(self.jwt_secret) < MIN_PRODUCTION_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be at least {MIN_PRODUCTION_SECRET_LENGTH} characters "
                "in production"
            )
        if not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
