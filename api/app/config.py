from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "Copilote Investissement"
    debug: bool = True

    # Base de données SQLite (fichier local, zéro config)
    database_url: str = "sqlite+aiosqlite:///./trading.db"

    # Providers de données
    market_data_provider: str = "yfinance"

    # Scheduler
    scheduler_enabled: bool = True
    market_data_refresh_minutes: int = 30

    # Redis (optionnel — si absent, le cache est désactivé silencieusement)
    redis_url: str = "redis://localhost:6379/0"
    use_redis: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
