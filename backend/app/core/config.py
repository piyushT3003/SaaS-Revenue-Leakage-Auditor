import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "SaaS Revenue Assurance"
    ENVIRONMENT: str = "production"
    API_V1_STR: str = "/api/v1"
    
    # Dual database support: SQLite default for zero-config local run; PostgreSQL via DATABASE_URL
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./saas_assurance.db")
    
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-revenue-assurance-jwt-key-2026")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Gemini AI configuration
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    # Financial & Anomaly thresholds
    UNDERBILLING_CRITICAL_THRESHOLD: float = 100000.0  # ₹1,00,000
    UNDERBILLING_HIGH_THRESHOLD: float = 50000.0       # ₹50,000
    DISCOUNT_DRIFT_THRESHOLD_PCT: float = 2.0          # 2% discrepancy
    OVERDUE_DAYS_ALERT: int = 30
    
    # Base Currency
    DEFAULT_CURRENCY: str = "INR"
    CURRENCY_SYMBOL: str = "₹"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
