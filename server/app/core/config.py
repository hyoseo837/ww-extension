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
    # Comma-separated browser origins allowed by CORS (web app, v6.1).
    cors_origins: str = "http://localhost:5173,https://ww-extension.hyoseo.dev"
    # Web app base URL — Stripe success/cancel return for web checkout (v6.2).
    web_app_url: str = "https://ww-extension.hyoseo.dev"
    # Comma-separated Supabase user_ids allowed into the admin surface (v6.6,
    # ADR 0025). Empty = no admins (every /admin/* request gets 403).
    admin_user_ids: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_user_id_list(self) -> list[str]:
        return [u.strip() for u in self.admin_user_ids.split(",") if u.strip()]


settings = Settings()
