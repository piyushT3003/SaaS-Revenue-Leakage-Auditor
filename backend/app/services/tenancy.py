"""Tenant / role / bootstrap-admin provisioning and the audit trail writer."""
from __future__ import annotations

import secrets

from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.logging import log, request_id_var
from backend.app.models import AuditLog, Notification, Role, Tenant, User
from backend.app.security.auth import PERMISSIONS, ROLE_DESCRIPTIONS, hash_password


def ensure_roles(db: Session) -> dict[str, Role]:
    roles = {r.name: r for r in db.scalars(select(Role))}
    for name, perms in PERMISSIONS.items():
        if name not in roles:
            roles[name] = Role(name=name, description=ROLE_DESCRIPTIONS[name], permissions=sorted(perms))
            db.add(roles[name])
        else:
            roles[name].permissions = sorted(perms)
    db.flush()
    return roles


def ensure_tenant(db: Session, code: str | None = None, name: str = "SaaS Revenue Assurance — Demo Workspace") -> Tenant:
    code = code or settings.DEFAULT_TENANT_CODE
    tenant = db.scalar(select(Tenant).where(Tenant.code == code))
    if tenant is None:
        tenant = Tenant(code=code, name=name, base_currency=settings.BASE_CURRENCY)
        db.add(tenant)
        db.flush()
    return tenant


def bootstrap(db: Session) -> tuple[Tenant, str | None]:
    """Create roles, the default tenant and — only when no user exists — an admin account.

    Returns the tenant and, if a password had to be generated, that one-time password so it
    can be printed once to the server console. Nothing is hard-coded.
    """
    roles = ensure_roles(db)
    tenant = ensure_tenant(db)
    generated = None
    if db.scalar(select(func.count(User.id))) == 0:
        password = settings.BOOTSTRAP_ADMIN_PASSWORD or secrets.token_urlsafe(12)
        generated = None if settings.BOOTSTRAP_ADMIN_PASSWORD else password
        db.add(User(tenant_id=tenant.id, email=settings.BOOTSTRAP_ADMIN_EMAIL.lower(), full_name="Workspace Administrator",
                    title="Revenue Operations", password_hash=hash_password(password), role_id=roles["ADMIN"].id))
        db.flush()
        log.info("bootstrap admin created", extra={"user": settings.BOOTSTRAP_ADMIN_EMAIL})
    return tenant, generated


def record_audit(db: Session, tenant_id: int, user_id: int | None, action: str, entity_type: str = "",
                 entity_id: str | int = "", **details) -> None:
    """Append to the immutable audit trail (same transaction as the action itself)."""
    db.add(AuditLog(tenant_id=tenant_id, user_id=user_id, action=action, entity_type=entity_type,
                    entity_id=str(entity_id), details=details, request_id=request_id_var.get()))


EMAIL_ALERT_SEVERITIES = {"ERROR", "HIGH", "CRITICAL"}


def notify(db: Session, tenant_id: int, category: str, title: str, body: str = "", link: str = "",
           severity: str = "INFO", user_id: int | None = None) -> None:
    db.add(Notification(tenant_id=tenant_id, category=category, title=title, body=body, link=link,
                        severity=severity, user_id=user_id))
    if severity in EMAIL_ALERT_SEVERITIES:
        _queue_alert_email(db, tenant_id, title, body, link)


def _queue_alert_email(db: Session, tenant_id: int, title: str, body: str, link: str) -> None:
    """Email important alerts to the workspace's admins — only when an email provider is configured and the
    workspace has turned on Settings → Notifications → Email notifications. Sent after the transaction commits,
    so an alert is never emailed for work that was rolled back."""
    from backend.app.services.email import email_enabled
    from backend.app.services.settings import get_setting

    if not email_enabled() or not get_setting(db, tenant_id, "notifications").get("email_notifications"):
        return
    admins = db.scalars(select(User.email).join(Role).where(User.tenant_id == tenant_id, User.is_active.is_(True),
                                                            Role.name == "ADMIN")).all()
    url = f"{settings.APP_BASE_URL.rstrip('/')}{link}" if link else settings.APP_BASE_URL
    text = f"{body}\n\nOpen: {url}\n\nYou receive this because email notifications are on for this workspace " \
           "(Settings → Notifications)."
    db.info.setdefault("pending_emails", []).extend((to, f"[{settings.PROJECT_NAME}] {title}", text) for to in admins)


@event.listens_for(Session, "after_commit")
def _send_pending_emails(session: Session) -> None:
    pending = session.info.pop("pending_emails", None)
    if pending:
        from backend.app.services.email import send_email

        for to, subject, text in pending:
            send_email(to, subject, text)


@event.listens_for(Session, "after_rollback")
def _drop_pending_emails(session: Session) -> None:
    session.info.pop("pending_emails", None)
