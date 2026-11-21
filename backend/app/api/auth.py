"""Authentication: login, logout, current user, password change, password reset, optional read-only demo login."""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models import LoginAttempt, PasswordResetToken, SyntheticGroundTruth, Tenant, User, UserSession
from backend.app.security.auth import (
    PERMISSIONS, CurrentUser, get_current_user, hash_password, issue_token, validate_password_strength, verify_password,
)
from backend.app.services.email import email_enabled, send_email
from backend.app.services.tenancy import record_audit

router = APIRouter()
EMAIL = r"^[^@\s]+@[^@\s]+$"


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255, pattern=EMAIL)
    password: str = Field(min_length=1, max_length=200)


class ChangePassword(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


class ForgotPassword(BaseModel):
    email: str = Field(min_length=3, max_length=255, pattern=EMAIL)


class ResetPassword(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


def _client(request: Request) -> str:
    # Behind a proxy (Vercel, nginx) the socket peer is the proxy; the first X-Forwarded-For hop is the caller.
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "-")


def _throttle(db: Session, key: str, limit: int | None = None) -> None:
    """Shared, database-backed rate limit: works across processes and serverless instances."""
    now = datetime.now(UTC)
    db.execute(delete(LoginAttempt).where(LoginAttempt.attempted_at < now - timedelta(hours=1)))
    recent = db.scalar(select(func.count(LoginAttempt.id)).where(LoginAttempt.key == key,
                                                                LoginAttempt.attempted_at > now - timedelta(minutes=1)))
    if (recent or 0) >= (limit or settings.LOGIN_MAX_ATTEMPTS_PER_MINUTE):
        db.commit()
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts; try again in a minute")
    db.add(LoginAttempt(key=key[:320]))
    db.commit()


def _tenant_user(db: Session, email: str) -> User | None:
    tenant = db.scalar(select(Tenant).where(Tenant.code == settings.DEFAULT_TENANT_CODE))
    return None if tenant is None else db.scalar(select(User).where(User.tenant_id == tenant.id, User.email == email.lower()))


def _start_session(db: Session, user: User, request: Request, response: Response, action: str = "LOGIN") -> dict:
    token, expires = issue_token(db, user, request.headers.get("user-agent", ""))
    user.last_login_at = datetime.now(UTC)
    record_audit(db, user.tenant_id, user.id, action, "user", user.id)
    db.commit()
    response.set_cookie("sra_token", token, httponly=True, samesite="strict", secure=settings.ENVIRONMENT == "production",
                        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    return {"access_token": token, "token_type": "bearer", "expires_at": expires.isoformat(), "user": _user_dict(user)}


def _revoke_sessions(db: Session, user_id: int, keep_jti: str | None = None) -> None:
    q = update(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    if keep_jti:
        q = q.where(UserSession.jti != keep_jti)
    db.execute(q.values(revoked_at=datetime.now(UTC)))


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_reset_token(db: Session, user: User, created_by: int | None = None) -> tuple[str, datetime]:
    """Create a one-time reset token (earlier unused tokens for the user stop working). Returns the raw token."""
    now = datetime.now(UTC)
    db.execute(update(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
               .values(used_at=now))
    raw = secrets.token_urlsafe(32)
    expires = now + timedelta(minutes=settings.PASSWORD_RESET_MINUTES)
    db.add(PasswordResetToken(user_id=user.id, token_hash=_hash(raw), expires_at=expires, created_by=created_by))
    return raw, expires


def reset_link(raw: str) -> str:
    return f"{settings.APP_BASE_URL.rstrip('/')}/reset-password?token={raw}"


@router.get("/options")
def options(db: Session = Depends(get_db)):
    """Public: which sign-in features are available, so the login page only offers what works, and whether the
    workspace holds synthetic demo data (so the "synthetic data" notice is shown only when it is true)."""
    synthetic = db.scalar(select(func.count()).select_from(SyntheticGroundTruth)) or 0
    demo = bool(settings.DEMO_LOGIN_EMAIL)
    return {"password_reset_email": email_enabled(), "demo_login": demo,
            "demo_auto": demo and settings.DEMO_AUTO_LOGIN,
            "demo_email": settings.DEMO_LOGIN_EMAIL.lower() if demo else None,
            "synthetic_data": synthetic > 0,
            "operator": {"name": settings.OPERATOR_NAME, "contact": settings.CONTACT_EMAIL,
                         "email_provider": settings.EMAIL_PROVIDER if email_enabled() else "",
                         "error_monitoring": bool(settings.SENTRY_DSN or settings.SENTRY_FRONTEND_DSN),
                         "llm_provider": settings.LLM_PROVIDER},
            "sentry": {"dsn": settings.SENTRY_FRONTEND_DSN, "environment": settings.ENVIRONMENT,
                       "release": settings.APP_VERSION} if settings.SENTRY_FRONTEND_DSN else None}


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    # Per account (cannot be bypassed by spoofing X-Forwarded-For) and per client address (looser: shared offices).
    _throttle(db, f"login:{body.email.lower()}")
    _throttle(db, f"login-ip:{_client(request)}", settings.LOGIN_MAX_ATTEMPTS_PER_MINUTE * 3)
    user = _tenant_user(db, body.email)
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return _start_session(db, user, request, response)


@router.post("/demo-login")
def demo_login(request: Request, response: Response, db: Session = Depends(get_db)):
    """Public read-only demo. Disabled unless DEMO_LOGIN_EMAIL is set, and refused unless that account is a VIEWER,
    so the button can never hand out write access."""
    if not settings.DEMO_LOGIN_EMAIL:
        raise HTTPException(404, "Demo sign-in is not enabled")
    _throttle(db, f"demo:{_client(request)}", settings.LOGIN_MAX_ATTEMPTS_PER_MINUTE * 3)
    user = _tenant_user(db, settings.DEMO_LOGIN_EMAIL)
    if user is None or not user.is_active or user.role.name != "VIEWER":
        raise HTTPException(403, "The demo account must be an active read-only (VIEWER) user")
    # Every anonymous visit creates a session; prune the demo account's long-expired ones so the table stays small.
    db.execute(delete(UserSession).where(UserSession.user_id == user.id,
                                         UserSession.expires_at < datetime.now(UTC) - timedelta(days=1)))
    return _start_session(db, user, request, response, action="DEMO_LOGIN")


@router.post("/logout")
def logout(response: Response, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.scalar(select(UserSession).where(UserSession.jti == user.jti))
    if session:
        session.revoked_at = datetime.now(UTC)
    record_audit(db, user.tenant_id, user.id, "LOGOUT", "user", user.id)
    db.commit()
    response.delete_cookie("sra_token")
    return {"ok": True}


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return _user_dict(db.get(User, user.id))


@router.post("/change-password")
def change_password(body: ChangePassword, request: Request, user: CurrentUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    _throttle(db, f"change:{user.id}")
    u = db.get(User, user.id)
    if settings.DEMO_LOGIN_EMAIL and u.email.lower() == settings.DEMO_LOGIN_EMAIL.lower():
        raise HTTPException(403, "The shared demo account's password cannot be changed")
    if not verify_password(body.current_password, u.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if body.new_password == body.current_password:
        raise HTTPException(422, "The new password must be different from the current one")
    validate_password_strength(body.new_password)
    u.password_hash = hash_password(body.new_password)
    _revoke_sessions(db, u.id, keep_jti=user.jti)  # sign out every other device
    record_audit(db, u.tenant_id, u.id, "PASSWORD_CHANGED", "user", u.id)
    db.commit()
    return {"ok": True, "message": "Password changed. Other devices have been signed out."}


@router.post("/forgot-password", status_code=202)
def forgot_password(body: ForgotPassword, request: Request, db: Session = Depends(get_db)):
    """Always the same reply, whether or not the account exists, so this cannot be used to discover accounts."""
    _throttle(db, f"forgot:{_client(request)}")
    reply = {"ok": True, "message": "If that address belongs to an active account, a reset link has been sent."}
    if not email_enabled():
        return {**reply, "message": "Email is not configured here. Ask an administrator for a reset link."}
    user = _tenant_user(db, body.email)
    if user is not None and user.is_active:
        raw, expires = issue_reset_token(db, user)
        record_audit(db, user.tenant_id, user.id, "PASSWORD_RESET_REQUESTED", "user", user.id)
        db.commit()
        send_email(user.email, f"{settings.PROJECT_NAME}: reset your password",
                   f"Hello {user.full_name},\n\nUse this link to choose a new password. It works once and expires at "
                   f"{expires:%Y-%m-%d %H:%M} UTC:\n\n{reset_link(raw)}\n\nIf you did not ask for this, ignore this email; "
                   "your password has not changed.\n")
    return reply


@router.post("/reset-password")
def reset_password(body: ResetPassword, request: Request, db: Session = Depends(get_db)):
    _throttle(db, f"reset:{_client(request)}")
    now = datetime.now(UTC)
    t = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash(body.token)).with_for_update())
    if t is None or t.used_at is not None or t.expires_at < now:
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    u = db.get(User, t.user_id)
    if u is None or not u.is_active:
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    validate_password_strength(body.new_password)
    u.password_hash = hash_password(body.new_password)
    t.used_at = now
    _revoke_sessions(db, u.id)
    record_audit(db, u.tenant_id, u.id, "PASSWORD_RESET_COMPLETED", "user", u.id)
    db.commit()
    return {"ok": True, "message": "Password updated. Sign in with your new password."}


def _user_dict(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "title": u.title, "role": u.role.name,
            "permissions": sorted(PERMISSIONS.get(u.role.name, set())),
            "initials": "".join(p[0] for p in u.full_name.split()[:2]).upper()}
