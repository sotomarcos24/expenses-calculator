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


@lru_cache
def get_settings() -> Settings:
    return Settings()
