from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "PersonalDolar"
    database_url: str = "sqlite:///./dev.db"
    # Dev-only default (>= 32 bytes so PyJWT does not warn). Set JWT_SECRET in production.
    jwt_secret: str = "dev-only-insecure-jwt-secret-change-me-in-production"
    access_token_days: int = 7
    cookie_secure: bool = False
    # Per-IP attempts per window on login / register; 0 disables that limit.
    rate_limit_login_attempts: int = 10
    rate_limit_register_attempts: int = 5
    rate_limit_window_seconds: int = 60
    # Number of trusted reverse proxies in front of the app (0 = use the socket IP).
    trusted_proxy_count: int = 0


@lru_cache
def get_settings() -> Settings:
    return Settings()
