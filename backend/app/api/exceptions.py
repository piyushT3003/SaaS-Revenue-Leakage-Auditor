"""Exception Management: list/filter, summary, investigate (evidence), assign, notes, lifecycle."""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from backend.app.api.common import J, Page, not_found, pagination
from backend.app.core.database import get_db
from backend.app.models import (
    AuditRun,
    Customer,
    ExceptionCase,
    ExceptionEvidence,
    ExceptionStatusHistory,
    InvestigationNote,
    Role,
    User,
)
from backend.app.models.investigation import EXCEPTION_CATEGORIES
from backend.app.security.auth import CurrentUser, require
from backend.app.services.tenancy import notify, record_audit

router = APIRouter()
TRANSITIONS = {
    "OPEN": {"IN_PROGRESS", "RESOLVED", "DISMISSED"},
    "IN_PROGRESS": {"OPEN", "RESOLVED", "DISMISSED"},
    "RESOLVED": {"OPEN"},
    "DISMISSED": {"OPEN"},
}
SEVERITY_ORDER = case({"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}, value=ExceptionCase.severity)
CATEGORY_LABELS = {
    "UNDERBILLING": "Underbilling", "OVERBILLING": "Overbilling", "MISSING_CHARGE": "Missing Charges",
    "DUPLICATE_INVOICE": "Duplicate Invoices", "DISCOUNT_DRIFT": "Discount Drift", "PRICING_MISMATCH": "Pricing Mismatch",
    "UNBILLED_USAGE": "Unbilled Usage", "PAYMENT_DISCREPANCY": "Payment Discrepancy",
}


def _base(user: CurrentUser, period_start: date | None, period_end: date | None):
    q = select(ExceptionCase).where(ExceptionCase.tenant_id == user.tenant_id)
    if period_start:
        q = q.where(ExceptionCase.period_start >= period_start)
    if period_end:
        q = q.where(ExceptionCase.period_start <= period_end)
    return q


def exception_dict(e: ExceptionCase, customer: Customer | None, owner: User | None) -> dict:
    return J({
        "id": e.id, "exception_code": e.exception_code, "category": e.category, "category_label": CATEGORY_LABELS[e.category],
        "customer": None if customer is None else {"id": customer.id, "code": customer.customer_code, "name": customer.name,
                                                   "segment": customer.segment},
        "period_start": e.period_start, "period_end": e.period_end, "financial_impact": e.financial_impact,
        "counts_toward_leakage": e.counts_toward_leakage, "severity": e.severity, "status": e.status,
        "owner": None if owner is None else {"id": owner.id, "name": owner.full_name},
        "title": e.title, "explanation": e.explanation, "detected_at": e.created_at, "updated_at": e.updated_at,
        "audit_run_id": e.audit_run_id, "last_seen_audit_run_id": e.last_seen_audit_run_id,
        "obligation_key": e.exposure_key if e.obligation_id else None, "resolved_at": e.resolved_at,
    })


@router.get("/summary")
def summary(period_start: date | None = None, period_end: date | None = None, user: CurrentUser = Depends(require("read")),
            db: Session = Depends(get_db)):
    q = _base(user, period_start, period_end).subquery()
    by_status = dict(db.execute(select(q.c.status, func.count()).group_by(q.c.status)).all())
    active = ("OPEN", "IN_PROGRESS")
    exposure = db.scalar(select(func.coalesce(func.sum(q.c.financial_impact), 0)).where(q.c.status.in_(active)))
    # unique leakage exposure: one amount per exposure key among leakage-type cases
    leak_sub = (select(q.c.exposure_key, func.max(q.c.financial_impact).label("amt"))
                .where(q.c.counts_toward_leakage.is_(True), q.c.status.in_(active)).group_by(q.c.exposure_key).subquery())
    leakage = db.scalar(select(func.coalesce(func.sum(leak_sub.c.amt), 0)))
    cats = {c: {"count": 0, "exposure": Decimal("0")} for c in EXCEPTION_CATEGORIES}
    for cat, n, amt in db.execute(select(q.c.category, func.count(), func.coalesce(func.sum(q.c.financial_impact), 0)).group_by(q.c.category)):
        cats[cat] = {"count": n, "exposure": amt}
    total = sum(by_status.values())
    return J({
        "total": total, "open": by_status.get("OPEN", 0), "in_progress": by_status.get("IN_PROGRESS", 0),
        "resolved": by_status.get("RESOLVED", 0), "dismissed": by_status.get("DISMISSED", 0),
        "financial_exposure": exposure, "unique_leakage_exposure": leakage,
        "by_category": [{"category": c, "label": CATEGORY_LABELS[c], "count": v["count"], "exposure": v["exposure"],
                         "share_pct": None if not total else round(v["count"] * 100 / total, 1)} for c, v in cats.items()],
        "exposure_basis": "Sum of financial impact of OPEN and IN_PROGRESS cases; leakage counts each obligation once",
    })


@router.get("")
def list_exceptions(category: str | None = None, severity: str | None = None, status: str | None = None,
                    customer_id: int | None = None, owner_id: int | None = None, period_start: date | None = None,
                    period_end: date | None = None, search: str | None = None,
                    sort: str = Query("-impact", pattern="^-?(impact|detected|severity|customer|code)$"),
                    page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    q = _base(user, period_start, period_end).outerjoin(Customer, Customer.id == ExceptionCase.customer_id)
    if category:
        q = q.where(ExceptionCase.category.in_([c.strip().upper() for c in category.split(",")]))
    if severity:
        q = q.where(ExceptionCase.severity.in_([c.strip().upper() for c in severity.split(",")]))
    if status:
        q = q.where(ExceptionCase.status.in_([c.strip().upper() for c in status.split(",")]))
    if customer_id:
        q = q.where(ExceptionCase.customer_id == customer_id)
    if owner_id:
        q = q.where(ExceptionCase.owner_user_id == owner_id)
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(Customer.name.ilike(like), ExceptionCase.exception_code.ilike(like), ExceptionCase.title.ilike(like)))
    col = {"impact": ExceptionCase.financial_impact, "detected": ExceptionCase.created_at, "severity": SEVERITY_ORDER,
           "customer": Customer.name, "code": ExceptionCase.id}[sort.lstrip("-")]
    q = q.order_by(col.desc() if sort.startswith("-") else col.asc(), ExceptionCase.id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    cases = db.scalars(q.offset(page.offset).limit(page.page_size)).all()
    customers = {c.id: c for c in db.scalars(select(Customer).where(Customer.id.in_({e.customer_id for e in cases if e.customer_id} or {0})))}
    owners = {u.id: u for u in db.scalars(select(User).where(User.id.in_({e.owner_user_id for e in cases if e.owner_user_id} or {0})))}
    return page.wrap([exception_dict(e, customers.get(e.customer_id), owners.get(e.owner_user_id)) for e in cases], total)


def _case(db: Session, user: CurrentUser, exception_id: int) -> ExceptionCase:
    e = db.get(ExceptionCase, exception_id)
    if e is None or e.tenant_id != user.tenant_id:
        raise not_found("Exception")
    return e


@router.get("/{exception_id}")
def detail(exception_id: int, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    e = _case(db, user, exception_id)
    cust = db.get(Customer, e.customer_id) if e.customer_id else None
    owner = db.get(User, e.owner_user_id) if e.owner_user_id else None
    names = dict(db.execute(select(User.id, User.full_name).where(User.tenant_id == user.tenant_id)).all())
    first, last = db.get(AuditRun, e.audit_run_id), db.get(AuditRun, e.last_seen_audit_run_id) if e.last_seen_audit_run_id else None
    return J({
        **exception_dict(e, cust, owner),
        "calculation": e.calculation, "resolution_reason": e.resolution_reason,
        "first_detected_in": {"id": first.id, "run_code": first.run_code},
        "last_seen_in": None if last is None else {"id": last.id, "run_code": last.run_code},
        "evidence": [{"id": ev.id, "type": ev.evidence_type, "table": ev.record_table, "record_id": ev.record_id,
                      "summary": ev.summary, "snapshot": ev.snapshot}
                     for ev in db.scalars(select(ExceptionEvidence).where(ExceptionEvidence.exception_id == e.id).order_by(ExceptionEvidence.id))],
        "notes": [{"id": n.id, "author": names.get(n.author_id), "body": n.body, "created_at": n.created_at}
                  for n in db.scalars(select(InvestigationNote).where(InvestigationNote.exception_id == e.id).order_by(InvestigationNote.created_at))],
        "history": [{"from": h.from_status, "to": h.to_status, "by": names.get(h.changed_by), "reason": h.reason, "at": h.changed_at}
                    for h in db.scalars(select(ExceptionStatusHistory).where(ExceptionStatusHistory.exception_id == e.id).order_by(ExceptionStatusHistory.id))],
    })


class AssignBody(BaseModel):
    user_id: int | None


@router.post("/{exception_id}/assign")
def assign(exception_id: int, body: AssignBody, user: CurrentUser = Depends(require("exception:write")), db: Session = Depends(get_db)):
    e = _case(db, user, exception_id)
    if body.user_id is not None:
        target = db.get(User, body.user_id)
        if target is None or target.tenant_id != user.tenant_id or not target.is_active or target.role.name == "VIEWER":
            raise HTTPException(422, "Assignee must be an active Admin or Analyst in this workspace")
    e.owner_user_id = body.user_id
    record_audit(db, user.tenant_id, user.id, "EXCEPTION_ASSIGNED", "exception", e.id, assignee=body.user_id)
    if body.user_id and body.user_id != user.id:
        notify(db, user.tenant_id, "EXCEPTION", f"{e.exception_code} assigned to you", e.title, link=f"/exceptions?id={e.id}",
               user_id=body.user_id)
    db.commit()
    return {"ok": True, "owner_user_id": e.owner_user_id}


class NoteBody(BaseModel):
    body: str = Field(min_length=2, max_length=5000)


@router.post("/{exception_id}/notes", status_code=201)
def add_note(exception_id: int, body: NoteBody, user: CurrentUser = Depends(require("exception:write")), db: Session = Depends(get_db)):
    e = _case(db, user, exception_id)
    n = InvestigationNote(tenant_id=user.tenant_id, exception_id=e.id, author_id=user.id, body=body.body.strip())
    db.add(n)
    record_audit(db, user.tenant_id, user.id, "EXCEPTION_NOTE_ADDED", "exception", e.id)
    db.commit()
    return J({"id": n.id, "author": user.full_name, "body": n.body, "created_at": n.created_at})


class StatusBody(BaseModel):
    status: str = Field(pattern="^(OPEN|IN_PROGRESS|RESOLVED|DISMISSED)$")
    reason: str = Field(default="", max_length=2000)


@router.post("/{exception_id}/status")
def change_status(exception_id: int, body: StatusBody, user: CurrentUser = Depends(require("exception:write")),
                  db: Session = Depends(get_db)):
    e = _case(db, user, exception_id)
    if body.status == e.status:
        raise HTTPException(409, f"Exception is already {e.status}")
    if body.status not in TRANSITIONS[e.status]:
        raise HTTPException(409, f"Cannot move from {e.status} to {body.status}")
    if body.status in ("RESOLVED", "DISMISSED") and len(body.reason.strip()) < 10:
        raise HTTPException(422, "A resolution reason of at least 10 characters is required")
    db.add(ExceptionStatusHistory(tenant_id=user.tenant_id, exception_id=e.id, from_status=e.status, to_status=body.status,
                                  changed_by=user.id, reason=body.reason.strip()))
    previous, e.status = e.status, body.status
    if body.status in ("RESOLVED", "DISMISSED"):
        e.resolved_at, e.resolution_reason = datetime.now(UTC), body.reason.strip()
    else:
        e.resolved_at = None
    if body.status == "IN_PROGRESS" and e.owner_user_id is None:
        e.owner_user_id = user.id
    record_audit(db, user.tenant_id, user.id, "EXCEPTION_STATUS_CHANGED", "exception", e.id, from_status=previous,
                 to_status=body.status, reason=body.reason.strip())
    db.commit()
    return {"ok": True, "status": e.status}


@router.get("/assignees/list")
def assignees(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    rows = db.execute(select(User.id, User.full_name, Role.name).join(Role).where(
        User.tenant_id == user.tenant_id, User.is_active.is_(True), Role.name.in_(("ADMIN", "ANALYST"))).order_by(User.full_name)).all()
    return [{"id": i, "name": n, "role": r} for i, n, r in rows]
