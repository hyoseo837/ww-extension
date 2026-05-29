from pydantic import HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: HttpUrl
    supabase_publishable_key: str
    supabase_secret_key: str
    supabase_jwks_url: HttpUrl
    database_url: str
    gemini_api_key: str
    stripe_secret_key: str
    stripe_webhook_secret: str
    public_base_url: str


settings = Settings()
