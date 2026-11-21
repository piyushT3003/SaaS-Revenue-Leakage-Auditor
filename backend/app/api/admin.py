"""Settings, users & roles, audit logs and notifications."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from backend.app.api.common import J, Page, not_found, pagination
from backend.app.core.database import get_db
from backend.app.models import AuditLog, Notification, Role, User
from backend.app.security.auth import PERMISSIONS, CurrentUser, hash_password, require, validate_password_strength
from backend.app.services.settings import all_settings, update_setting
from backend.app.services.tenancy import record_audit

router = APIRouter()


# ----------------------------------------------------------------------------- settings
@router.get("/settings")
def get_settings(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    s = all_settings(db, user.tenant_id)
    if not user.can("settings:write"):
        s.pop("ai", None)
    s["ai"] = {**s.get("ai", {}), "api_key_configured": _ai_configured()} if user.can("settings:write") else {}
    return s


def _ai_configured() -> bool:
    from backend.app.core.config import settings

    return bool(settings.LLM_API_KEY and settings.LLM_PROVIDER)


@router.put("/settings/{key}")
def put_setting(key: str, body: dict, user: CurrentUser = Depends(require("settings:write")), db: Session = Depends(get_db)):
    if "api_key" in body:
        raise HTTPException(422, "LLM credentials are configured through environment variables, never stored via the API")
    try:
        value = update_setting(db, user.tenant_id, user.id, key, body)
    except KeyError:
        raise not_found("Setting section") from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if key == "revenue_rules" and "priority_weights" in body and sum(value["priority_weights"].values()) != 100:
        db.rollback()
        raise HTTPException(422, "Priority weights must sum to 100")
    db.commit()
    return value


# ----------------------------------------------------------------------------- users & roles
@router.get("/users")
def users(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    rows = db.execute(select(User, Role.name).join(Role).where(User.tenant_id == user.tenant_id).order_by(User.full_name)).all()
    return J([{"id": u.id, "email": u.email, "full_name": u.full_name, "title": u.title, "role": r, "is_active": u.is_active,
               "last_login_at": u.last_login_at} for u, r in rows])


@router.get("/roles")
def roles(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    return [{"name": r.name, "description": r.description, "permissions": sorted(PERMISSIONS.get(r.name, []))}
            for r in db.scalars(select(Role).order_by(Role.id))]


class NewUser(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+$", max_length=255)
    full_name: str = Field(min_length=2, max_length=200)
    title: str = Field(default="", max_length=120)
    role: str = Field(pattern="^(ADMIN|ANALYST|VIEWER)$")
    password: str = Field(min_length=10, max_length=200)


@router.post("/users", status_code=201)
def create_user(body: NewUser, user: CurrentUser = Depends(require("users:manage")), db: Session = Depends(get_db)):
    validate_password_strength(body.password)
    if db.scalar(select(User.id).where(User.tenant_id == user.tenant_id, User.email == body.email.lower())):
        raise HTTPException(409, "A user with this email already exists")
    role = db.scalar(select(Role).where(Role.name == body.role))
    u = User(tenant_id=user.tenant_id, email=body.email.lower(), full_name=body.full_name, title=body.title,
             password_hash=hash_password(body.password), role_id=role.id)
    db.add(u)
    db.flush()
    record_audit(db, user.tenant_id, user.id, "USER_CREATED", "user", u.id, email=u.email, role=body.role)
    db.commit()
    return {"id": u.id}


@router.post("/users/{user_id}/reset-link", status_code=201)
def admin_reset_link(user_id: int, user: CurrentUser = Depends(require("users:manage")), db: Session = Depends(get_db)):
    """One-time password-reset link for a user, shown once to the admin to pass on (used when email is not set up).
    Only the token's hash is stored."""
    from backend.app.api.auth import issue_reset_token, reset_link

    u = db.get(User, user_id)
    if u is None or u.tenant_id != user.tenant_id or not u.is_active:
        raise not_found("User")
    raw, expires = issue_reset_token(db, u, created_by=user.id)
    record_audit(db, user.tenant_id, user.id, "PASSWORD_RESET_LINK_ISSUED", "user", u.id, email=u.email)
    db.commit()
    return {"url": reset_link(raw), "expires_at": expires.isoformat(), "email": u.email}


class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(ADMIN|ANALYST|VIEWER)$")
    is_active: bool | None = None


@router.patch("/users/{user_id}")
def patch_user(user_id: int, body: UserPatch, user: CurrentUser = Depends(require("users:manage")), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None or u.tenant_id != user.tenant_id:
        raise not_found("User")
    if u.id == user.id and (body.is_active is False or (body.role and body.role != "ADMIN")):
        raise HTTPException(409, "You cannot deactivate or demote your own account")
    if body.role:
        u.role_id = db.scalar(select(Role.id).where(Role.name == body.role))
    if body.is_active is not None:
        u.is_active = body.is_active
        if not body.is_active:
            from backend.app.models import UserSession

            db.execute(update(UserSession).where(UserSession.user_id == u.id, UserSession.revoked_at.is_(None))
                       .values(revoked_at=datetime.now(UTC)))
    record_audit(db, user.tenant_id, user.id, "USER_UPDATED", "user", u.id, **body.model_dump(exclude_none=True))
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------------------------- audit logs
@router.get("/audit-logs")
def audit_logs(action: str | None = None, entity_type: str | None = None, user_id: int | None = None,
               page: Page = Depends(pagination), user: CurrentUser = Depends(require("settings:write")), db: Session = Depends(get_db)):
    q = select(AuditLog, User.full_name).outerjoin(User, User.id == AuditLog.user_id).where(AuditLog.tenant_id == user.tenant_id)
    if action:
        q = q.where(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(AuditLog.id.desc()).offset(page.offset).limit(page.page_size)).all()
    return page.wrap(J([{"id": a.id, "at": a.occurred_at, "user": n or "system", "action": a.action, "entity_type": a.entity_type,
                         "entity_id": a.entity_id, "details": a.details, "request_id": a.request_id} for a, n in rows]), total)


# ----------------------------------------------------------------------------- notifications
@router.get("/notifications")
def notifications(unread_only: bool = False, page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")),
                  db: Session = Depends(get_db)):
    q = select(Notification).where(Notification.tenant_id == user.tenant_id,
                                   or_(Notification.user_id.is_(None), Notification.user_id == user.id))
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    unread = db.scalar(select(func.count()).select_from(q.where(Notification.read_at.is_(None)).subquery()))
    rows = db.scalars(q.order_by(Notification.created_at.desc()).offset(page.offset).limit(page.page_size)).all()
    return {**page.wrap(J([{"id": n.id, "category": n.category, "severity": n.severity, "title": n.title, "body": n.body,
                            "link": n.link, "created_at": n.created_at, "read": n.read_at is not None} for n in rows]), total),
            "unread": unread}


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None or n.tenant_id != user.tenant_id or (n.user_id not in (None, user.id)):
        raise not_found("Notification")
    n.read_at = n.read_at or datetime.now(UTC)
    db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.tenant_id == user.tenant_id, Notification.read_at.is_(None),
                                          or_(Notification.user_id.is_(None), Notification.user_id == user.id))
               .values(read_at=datetime.now(UTC)))
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------------------------- reporting (Power BI)
@router.get("/reporting/status")
def reporting_status(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    from sqlalchemy import text as _t

    rows = db.execute(_t("""SELECT month_start, count(*) AS customers, max(refreshed_at) AS refreshed_at
                            FROM reporting.customer_economics_monthly WHERE tenant_id = :t GROUP BY 1 ORDER BY 1"""), {"t": user.tenant_id}).all()
    return J({"months": [dict(r._mapping) for r in rows],
              "views": ["dim_date", "dim_customer", "dim_product", "latest_audit", "fact_reconciliation", "fact_receivable",
                        "fact_payment_issue", "fact_exception", "fact_invoice_line", "fact_payment",
                        "customer_economics_monthly", "product_economics_monthly"],
              "note": "Snapshots refresh automatically when a full-scope audit completes."})


@router.post("/reporting/refresh")
def reporting_refresh(user: CurrentUser = Depends(require("settings:write")), db: Session = Depends(get_db)):
    from backend.app.reporting.refresh import refresh

    out = refresh(db, user.tenant_id)
    record_audit(db, user.tenant_id, user.id, "REPORTING_REFRESHED", "reporting", "customer_economics_monthly", months=len(out))
    db.commit()
    return {"ok": True, "refreshed": out}


# --- Company data rights: export everything, or erase all business data -------------------------------------
ERASE_PHRASE = "ERASE ALL COMPANY DATA"


class EraseRequest(BaseModel):
    confirm: str = Field(max_length=100)
    password: str = Field(min_length=1, max_length=200)


@router.get("/admin/data-export")
def data_export(user: CurrentUser = Depends(require("users:manage")), db: Session = Depends(get_db)):
    """ZIP with one CSV per table of this workspace's data (no password hashes or tokens)."""
    from fastapi.responses import Response

    from backend.app.services.data_rights import export_zip

    payload = export_zip(db, user.tenant_id)
    record_audit(db, user.tenant_id, user.id, "COMPANY_DATA_EXPORTED", "tenant", user.tenant_id, bytes=len(payload))
    db.commit()
    name = f"company_data_{datetime.now(UTC):%Y%m%d_%H%M}.zip"
    return Response(payload, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/admin/data-erase")
def data_erase(body: EraseRequest, user: CurrentUser = Depends(require("users:manage")), db: Session = Depends(get_db)):
    """Irreversibly delete all business data of this workspace (users and settings are kept). Requires the admin's
    password and the exact confirmation phrase. Download an export first if you may need the data."""
    from backend.app.security.auth import verify_password
    from backend.app.services.data_rights import erase_business_data

    if body.confirm.strip() != ERASE_PHRASE:
        raise HTTPException(422, f'Type "{ERASE_PHRASE}" to confirm')
    admin = db.get(User, user.id)
    if not verify_password(body.password, admin.password_hash):
        raise HTTPException(403, "Password is incorrect")
    counts = erase_business_data(db, user.tenant_id)
    record_audit(db, user.tenant_id, user.id, "COMPANY_DATA_ERASED", "tenant", user.tenant_id,
                 rows=sum(counts.values()))
    db.commit()
    return {"ok": True, "deleted_rows": sum(counts.values()), "by_table": counts}
