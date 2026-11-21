"""Environment-based configuration.

All secrets come from the environment (or a local, git-ignored ``.env`` file).
Nothing secret is hard-coded. In ``production`` the application refuses to start
if a required secret is missing or obviously weak.
"""
from __future__ import annotations

import secrets
import warnings
from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalise_db_url(v: str) -> str:
    """Hosted Postgres (Neon, Vercel) hands out postgres:// or postgresql:// URLs; use the psycopg 3 driver."""
    for prefix in ("postgres://", "postgresql://"):
        if v.startswith(prefix):
            v = "postgresql+psycopg://" + v[len(prefix):]
    if not v.startswith("postgresql"):
        raise ValueError("DATABASE_URL must point to PostgreSQL (postgresql+psycopg://...)")
    return v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "SaaS Revenue Assurance"
    PROJECT_SUBTITLE: str = "Contract-to-Cash & Customer Unit Economics Auditor"
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    API_V1_STR: str = "/api/v1"

    # --- Database (PostgreSQL only; financial data needs NUMERIC + real transactions) ---
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/sra"
    # Set automatically by the Vercel ↔ Neon integration. When present it is preferred: a direct (unpooled)
    # connection keeps per-connection settings (statement timeout, UTC) that a transaction pooler would drop.
    DATABASE_URL_UNPOOLED: str = ""
    # "queue": a normal connection pool (long-running servers). "null": open a connection per request and close it
    # (serverless — instances are frozen between requests, so pooled connections would go stale).
    DB_POOL_MODE: str = Field(default="queue", pattern="^(queue|null)$")
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 10
    DB_STATEMENT_TIMEOUT_MS: int = 30_000

    # --- Security ---
    JWT_SECRET: str = Field(default="")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8
    CORS_ORIGINS: str = "http://localhost:5185,http://127.0.0.1:5185"
    DEFAULT_TENANT_CODE: str = "demo"
    SESSION_IDLE_MINUTES: int = Field(default=60, ge=5)  # signed out after this long without any request
    LOGIN_MAX_ATTEMPTS_PER_MINUTE: int = Field(default=10, ge=1)
    PASSWORD_RESET_MINUTES: int = Field(default=60, ge=5)
    APP_BASE_URL: str = "http://localhost:5185"  # used to build password-reset links

    # Optional public read-only demo: a "View the demo" button signs in as this account (must be a VIEWER).
    DEMO_LOGIN_EMAIL: str = ""
    # Demo mode: visitors without a session go straight into that read-only demo, no sign-in step.
    # Anyone can still choose "Sign in" from the demo banner.
    DEMO_AUTO_LOGIN: bool = False

    # --- Email (optional; enables self-service "Forgot password") ---
    # EMAIL_PROVIDER: "" (off) | "smtp" | "brevo" (HTTPS API, works where SMTP ports are blocked)
    EMAIL_PROVIDER: str = ""
    EMAIL_FROM: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    BREVO_API_KEY: str = ""

    # Bootstrap admin (created on first start only when no users exist)
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@demo.local"
    BOOTSTRAP_ADMIN_PASSWORD: str = Field(default="")

    # --- Uploads ---
    MAX_UPLOAD_SIZE_BYTES: int = 25 * 1024 * 1024
    ALLOWED_UPLOAD_EXTENSIONS: str = ".csv,.xlsx"

    # --- Financial engine ---
    BASE_CURRENCY: str = "INR"
    MATCH_TOLERANCE: Decimal = Decimal("1.00")  # absolute amount tolerance for "matched"
    SEED_DEMO_DATA_ON_START: bool = True
    DEMO_USER_PASSWORD: str = ""  # with SEED_DEMO_DATA_ON_START: password for piyush@/analyst@/viewer@demo.local
    SEED_DEMO_RUN_AUDITS: bool = False  # with SEED_DEMO_DATA_ON_START: also audit each demo month once
    AUDIT_STALE_MINUTES: int = Field(default=15, ge=1)  # QUEUED/RUNNING longer than this with no progress → FAILED
    # "background": the API replies 202 and runs the audit after responding (long-running servers).
    # "inline": the audit runs before the response (serverless hosts, which may freeze work after the reply).
    AUDIT_EXECUTION: str = Field(default="background", pattern="^(background|inline)$")
    SERVE_FRONTEND: bool = True
    APP_VERSION: str = "1.0.0"
    # Shown on the public privacy notice and terms pages (/privacy, /terms).
    OPERATOR_NAME: str = ""
    CONTACT_EMAIL: str = ""
    # Optional error monitoring (Sentry). SENTRY_DSN: backend; SENTRY_FRONTEND_DSN: browser (public by design; events
    # go through this API's same-origin tunnel, so the Content-Security-Policy stays 'self').
    SENTRY_DSN: str = ""
    SENTRY_FRONTEND_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = Field(default=0.0, ge=0.0, le=1.0)
    # Daily scheduler (Vercel Cron sends "Authorization: Bearer $CRON_SECRET"). Empty = /cron endpoints disabled.
    CRON_SECRET: str = ""
    AUTO_MONTHLY_AUDIT: bool = True  # the daily job audits last month once it has closed
    AUTO_AUDIT_DAY: int = Field(default=2, ge=1, le=28)  # first day of the month on which that audit may run  # serve frontend/dist from the API process if it has been built
    AUTO_MIGRATE: bool = True  # run `alembic upgrade head` on start (disable in production; run it in the deploy step)

    # --- GenAI (configured later; never required for financial calculations) ---
    LLM_PROVIDER: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""

    @field_validator("DATABASE_URL")
    @classmethod
    def _postgres_only(cls, v: str) -> str:
        return _normalise_db_url(v)

    @field_validator("DATABASE_URL_UNPOOLED")
    @classmethod
    def _unpooled(cls, v: str) -> str:
        return _normalise_db_url(v) if v else v

    @model_validator(mode="after")
    def _secrets(self) -> "Settings":
        if self.DATABASE_URL_UNPOOLED:
            self.DATABASE_URL = self.DATABASE_URL_UNPOOLED
        if self.ENVIRONMENT == "production":
            if len(self.JWT_SECRET) < 32:
                raise ValueError("JWT_SECRET must be set to at least 32 characters in production")
            if "*" in self.cors_origins:
                raise ValueError("Wildcard CORS origin is not allowed in production")
        elif not self.JWT_SECRET:
            # Ephemeral per-process secret: tokens become invalid on restart. Fine for dev/test.
            self.JWT_SECRET = secrets.token_urlsafe(48)
            if self.ENVIRONMENT == "development":
                warnings.warn("JWT_SECRET not set; using an ephemeral development secret.", stacklevel=1)
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_extensions(self) -> set[str]:
        return {e.strip().lower() for e in self.ALLOWED_UPLOAD_EXTENSIONS.split(",") if e.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
