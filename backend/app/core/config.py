import os
from typing import List
from pydantic import ConfigDict
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "SaaS Revenue Assurance"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    API_V1_STR: str = "/api/v1"
    
    # Dual database support: SQLite default for zero-config local run; PostgreSQL via DATABASE_URL
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./saas_assurance.db")
    DB_POOL_PRE_PING: bool = True
    DB_POOL_RECYCLE: int = 3600
    
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-revenue-assurance-jwt-key-2026")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALLOW_DEV_FALLBACK: bool = os.getenv("ALLOW_DEV_FALLBACK", "true").lower() == "true"
    
    # Tenancy
    DEFAULT_TENANT_ID: str = os.getenv("DEFAULT_TENANT_ID", "tenant-enterprise-default")
    
    # Upload limits
    MAX_UPLOAD_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    
    # Rate Limits
    RATE_LIMIT_AUTH_PER_MINUTE: int = 20
    RATE_LIMIT_AI_PER_MINUTE: int = 30
    RATE_LIMIT_GLOBAL_PER_MINUTE: int = 600
    
    # Gemini AI configuration
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    AI_TIMEOUT_SECONDS: int = 10
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5185",
        "http://127.0.0.1:5185",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    # Financial & Anomaly thresholds
    UNDERBILLING_THRESHOLD: float = 5000.0
    UNDERBILLING_CRITICAL_THRESHOLD: float = 100000.0  # ₹1,00,000
    CRITICAL_SEVERITY_THRESHOLD: float = 100000.0
    UNDERBILLING_HIGH_THRESHOLD: float = 50000.0       # ₹50,000
    PRICING_MISMATCH_PCT_THRESHOLD: float = 5.0
    DISCOUNT_DRIFT_THRESHOLD_PCT: float = 2.0          # 2% discrepancy
    OVERDUE_DAYS_ALERT: int = 30
    
    # Base Currency
    DEFAULT_CURRENCY: str = "INR"
    CURRENCY_SYMBOL: str = "₹"

    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
