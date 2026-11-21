"""Authentication, server-side sessions and role-based permissions."""
from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models import User, UserSession

# --- Role → permission matrix (enforced server-side on every protected endpoint) ---
PERMISSIONS: dict[str, set[str]] = {
    "VIEWER": {"read"},
    "ANALYST": {"read", "import:write", "audit:run", "exception:write", "simulation:write", "ai:query", "export"},
    "ADMIN": {
        "read", "import:write", "import:rollback", "audit:run", "exception:write", "simulation:write", "ai:query",
        "export", "finance:correct", "finance:approve", "settings:write", "users:manage", "rules:approve",
    },
}

ROLE_DESCRIPTIONS = {
    "ADMIN": "Full access including approvals, financial corrections, users and settings",
    "ANALYST": "Run imports and audits, investigate exceptions, run simulations",
    "VIEWER": "Read-only access to dashboards and reports",
}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def validate_password_strength(password: str) -> None:
    if len(password) < 10 or password.isalpha() or password.isdigit():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password must be at least 10 characters and mix letters and digits")


def issue_token(db: Session, user: User, user_agent: str = "") -> tuple[str, datetime]:
    jti = secrets.token_hex(16)
    expires = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    db.add(UserSession(jti=jti, user_id=user.id, expires_at=expires, user_agent=user_agent[:255]))
    token = jwt.encode(
        {"sub": str(user.id), "tid": user.tenant_id, "role": user.role.name, "jti": jti, "exp": expires},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    return token, expires


@dataclass(frozen=True)
class CurrentUser:
    id: int
    tenant_id: int
    email: str
    full_name: str
    role: str
    jti: str

    def can(self, permission: str) -> bool:
        return permission in PERMISSIONS.get(self.role, set())


_bearer = HTTPBearer(auto_error=False)
_unauth = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> CurrentUser:
    token = creds.credentials if creds else request.cookies.get("sra_token")
    if not token:
        raise _unauth
    try:
        claims = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise _unauth from None
    session = db.scalar(select(UserSession).where(UserSession.jti == claims.get("jti")))
    now = datetime.now(UTC)
    if session is None or session.revoked_at is not None or session.expires_at < now:
        raise _unauth
    last = session.last_seen_at or session.issued_at
    if now - last > timedelta(minutes=settings.SESSION_IDLE_MINUTES):
        session.revoked_at = now
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired after inactivity",
                            headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        raise _unauth
    if now - last > timedelta(seconds=60):  # record activity at most once a minute
        session.last_seen_at = now
        db.commit()
    return CurrentUser(user.id, user.tenant_id, user.email, user.full_name, user.role.name, session.jti)


def require(permission: str):
    """Dependency factory: ``Depends(require("audit:run"))``."""

    def _checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.can(permission):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Your role ({user.role}) lacks permission '{permission}'")
        return user

    return _checker
