"""Tenants, users, roles, sessions, audit logs and notifications."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, TenantMixin, TimestampMixin

JSONType = JSON().with_variant(JSONB(), "postgresql")


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)


class Role(Base, TimestampMixin):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)  # ADMIN / ANALYST / VIEWER
    description: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    permissions: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)


class User(Base, TenantMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    role: Mapped[Role] = relationship(lazy="joined")


class UserSession(Base):
    """Server-side session registry so tokens can be revoked (logout, deactivation)."""

    __tablename__ = "user_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # idle-timeout tracking


class PasswordResetToken(Base):
    """One-time password reset. Only the SHA-256 of the token is stored; the token itself is sent once."""

    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))  # admin-issued link


class LoginAttempt(Base):
    """Login throttle shared by every process / serverless instance (an in-memory counter is not)."""

    __tablename__ = "login_attempts"
    __table_args__ = (Index("ix_login_attempts_key_time", "key", "attempted_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(320), nullable=False)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuditLog(Base, TenantMixin):
    """Append-only trail of important actions (a DB trigger blocks UPDATE/DELETE)."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_entity", "entity_type", "entity_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    details: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    request_id: Mapped[str] = mapped_column(String(32), default="", nullable=False)


class Notification(Base, TenantMixin):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # null = broadcast to tenant
    category: Mapped[str] = mapped_column(String(32), nullable=False)  # AUDIT / IMPORT / EXCEPTION / SYSTEM
    severity: Mapped[str] = mapped_column(String(16), default="INFO", nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    link: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TenantSetting(Base, TenantMixin, TimestampMixin):
    """Versionless key/value configuration per tenant (thresholds, preferences). Every change is
    also written to the audit log by the settings service."""

    __tablename__ = "tenant_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    value: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
