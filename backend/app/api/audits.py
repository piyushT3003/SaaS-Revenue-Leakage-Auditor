"""Revenue Reconciliation: readiness, run audit, audit history, results, payment results, compare runs."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.app.api.common import J, Page, not_found, pagination, parse_ids
from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models import (
    AuditRun,
    BillingObligation,
    BillingObligationComponent,
    Customer,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentReconciliationResult,
    Product,
    ReconciliationResult,
    Subscription,
)
from backend.app.reconciliation.readiness import assess_readiness
from backend.app.reconciliation.runner import AuditRequestError, create_audit_run, execute_audit_run, recover_stale_runs
from backend.app.security.auth import CurrentUser, require
from backend.app.services.fingerprint import data_fingerprint

router = APIRouter()

TAB_FILTERS = {
    # "Contract vs Usage": usage obligations — consumption vs entitlement/allowance
    "contract-usage": lambda q: q.where(ReconciliationResult.charge_type == "USAGE"),
    # "Usage vs Invoice": usage obligations that have invoice evidence or are missing
    "usage-invoice": lambda q: q.where(ReconciliationResult.charge_type == "USAGE",
                                       ReconciliationResult.status != "EXCLUDED"),
    "full": lambda q: q,
}


class AuditRequest(BaseModel):
    period_start: date
    period_end: date
    as_of_date: date | None = None
    customer_ids: list[int] | None = None
    product_ids: list[int] | None = None
    reuse_if_unchanged: bool = True

    @model_validator(mode="after")
    def _check(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self


def run_dict(r: AuditRun, current_fp: str | None = None) -> dict:
    d = J({
        "id": r.id, "run_code": r.run_code, "run_type": r.run_type, "status": r.status, "period_start": r.period_start,
        "period_end": r.period_end, "as_of_date": r.as_of_date, "scope": r.scope, "engine_version": r.engine_version,
        "expected_total": r.expected_total, "invoiced_total": r.invoiced_total, "variance_total": r.variance_total,
        "underbilled_total": r.underbilled_total, "overbilled_total": r.overbilled_total,
        "reconciliation_rate": r.reconciliation_rate, "summary": r.summary, "readiness": r.readiness,
        "error_message": r.error_message, "created_at": r.created_at, "started_at": r.started_at,
        "completed_at": r.completed_at, "replay_of_run_id": r.replay_of_run_id, "data_fingerprint": r.data_fingerprint,
    })
    if current_fp is not None:
        d["is_stale"] = r.data_fingerprint != current_fp
    return d


def _run(db: Session, user: CurrentUser, run_id: str) -> AuditRun:
    r = db.get(AuditRun, run_id)
    if r is None or r.tenant_id != user.tenant_id:
        raise not_found("Audit run")
    return r


@router.get("/readiness")
def readiness(period_start: date, period_end: date, customer_ids: str | None = None, product_ids: str | None = None,
              user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    if period_end < period_start:
        raise HTTPException(422, "period_end must be on or after period_start")
    return assess_readiness(db, user.tenant_id, period_start, period_end, parse_ids(customer_ids), parse_ids(product_ids))


@router.post("", status_code=202)
def start_audit(body: AuditRequest, background: BackgroundTasks, user: CurrentUser = Depends(require("audit:run")),
                db: Session = Depends(get_db)):
    # Default as-of date is today: cash and credits recorded up to today count towards the cohort.
    as_of = body.as_of_date or date.today()
    if as_of < body.period_start:
        raise HTTPException(422, "as_of_date cannot be before period_start")
    try:
        run, reused = create_audit_run(db, user.tenant_id, user.id, body.period_start, body.period_end, as_of,
                                       body.customer_ids, body.product_ids, body.reuse_if_unchanged)
    except AuditRequestError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.commit()
    if not reused:
        if settings.AUDIT_EXECUTION == "inline":
            # Serverless hosts may freeze the instance once the response is sent, so finish the audit first.
            execute_audit_run(run.id)
            db.expire_all()
            run = db.get(AuditRun, run.id)
        else:
            background.add_task(execute_audit_run, run.id)
    return {**run_dict(run), "reused": reused}


@router.get("")
def list_runs(period_start: date | None = None, status: str | None = None, page: Page = Depends(pagination),
              user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    if recover_stale_runs(db, user.tenant_id):  # cheap; keeps stuck runs from showing RUNNING forever
        db.commit()
    q = select(AuditRun).where(AuditRun.tenant_id == user.tenant_id)
    if period_start:
        q = q.where(AuditRun.period_start == period_start)
    if status:
        q = q.where(AuditRun.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    fp = data_fingerprint(db, user.tenant_id)
    runs = db.scalars(q.order_by(AuditRun.created_at.desc()).offset(page.offset).limit(page.page_size)).all()
    return page.wrap([run_dict(r, fp) for r in runs], total)


@router.get("/{run_id}")
def get_run(run_id: str, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    return run_dict(_run(db, user, run_id), data_fingerprint(db, user.tenant_id))


@router.get("/{run_id}/results")
def results(run_id: str, tab: str = Query("full", pattern="^(full|contract-usage|usage-invoice)$"),
            status: str | None = None, customer_id: int | None = None, product_id: int | None = None,
            search: str | None = None, sort: str = Query("variance", pattern="^-?(variance|expected|invoiced|customer|period)$"),
            page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    _run(db, user, run_id)
    R = ReconciliationResult
    q = (select(R, Customer.customer_code, Customer.name, Product.product_code, Product.name.label("product_name"))
         .join(Customer, Customer.id == R.customer_id).outerjoin(Product, Product.id == R.product_id)
         .where(R.audit_run_id == run_id))
    q = TAB_FILTERS[tab](q)
    if status:
        q = q.where(R.status.in_([s.strip().upper() for s in status.split(",")]))
    if customer_id:
        q = q.where(R.customer_id == customer_id)
    if product_id:
        q = q.where(R.product_id == product_id)
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(Customer.name.ilike(like), Customer.customer_code.ilike(like), R.details["obligation_key"].as_string().ilike(like)))
    col = {"variance": func.abs(R.variance), "expected": R.expected_amount, "invoiced": R.invoiced_amount,
           "customer": Customer.name, "period": R.period_start}[sort.lstrip("-")]
    q = q.order_by(col.asc() if sort.startswith("-") else col.desc(), R.id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = []
    for r, ccode, cname, pcode, pname in db.execute(q.offset(page.offset).limit(page.page_size)):
        items.append(J({
            "id": r.id, "obligation_id": r.obligation_id, "obligation_key": r.details.get("obligation_key"),
            "invoice_line_id": r.invoice_line_id, "customer": {"id": r.customer_id, "code": ccode, "name": cname},
            "product": {"id": r.product_id, "code": pcode, "name": pname}, "charge_type": r.charge_type,
            "period_start": r.period_start, "period_end": r.period_end, "status": r.status,
            "expected_amount": r.expected_amount, "invoiced_amount": r.invoiced_amount, "variance": r.variance,
            "expected_quantity": r.expected_quantity, "invoiced_quantity": r.invoiced_quantity,
            "expected_unit_price": r.expected_unit_price, "invoiced_unit_price": r.invoiced_unit_price,
            "expected_discount_pct": r.expected_discount_pct, "invoiced_discount_pct": r.invoiced_discount_pct,
            "match_method": r.match_method, "match_confidence": r.match_confidence, "explanation": r.explanation,
            "excluded_reason": r.excluded_reason, "subscription_code": r.details.get("subscription_code"),
            "invoice_numbers": r.details.get("invoice_numbers") or ([r.details["invoice_number"]] if r.details.get("invoice_number") else []),
        }))
    return page.wrap(items, total)


@router.get("/{run_id}/results/{result_id}")
def result_detail(run_id: str, result_id: int, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    """Full calculation trail for one obligation: components (with contract version and pricing
    rule used), matched invoice lines and the comparison."""
    run = _run(db, user, run_id)
    r = db.get(ReconciliationResult, result_id)
    if r is None or r.audit_run_id != run.id:
        raise not_found("Reconciliation result")
    cust = db.get(Customer, r.customer_id)
    comps, ob, sub = [], None, None
    if r.obligation_id:
        ob = db.get(BillingObligation, r.obligation_id)
        sub = db.get(Subscription, ob.subscription_id)
        comps = db.scalars(select(BillingObligationComponent).where(
            BillingObligationComponent.audit_run_id == run.id, BillingObligationComponent.obligation_id == r.obligation_id
        ).order_by(BillingObligationComponent.seq)).all()
    line_ids = r.matched_line_ids or []
    lines = db.execute(select(InvoiceLine, Invoice.invoice_number, Invoice.issue_date)
                       .join(Invoice, Invoice.id == InvoiceLine.invoice_id).where(InvoiceLine.id.in_(line_ids or [0]))).all()
    return J({
        "result": {c.key: getattr(r, c.key) for c in ReconciliationResult.__table__.columns},
        "customer": {"id": cust.id, "code": cust.customer_code, "name": cust.name, "segment": cust.segment},
        "obligation": None if ob is None else {"id": ob.id, "key": ob.obligation_key, "charge_type": ob.charge_type,
                                               "period_start": ob.period_start, "period_end": ob.period_end,
                                               "subscription_code": sub.subscription_code, "quantity": sub.quantity,
                                               "billing_frequency": sub.billing_frequency},
        "components": [{"seq": c.seq, "type": c.component_type, "segment_start": c.segment_start, "segment_end": c.segment_end,
                        "quantity": c.quantity, "unit_price": c.unit_price, "amount": c.amount, "formula": c.formula,
                        "contract_version_id": c.contract_version_id, "pricing_rule_id": c.pricing_rule_id, "inputs": c.inputs}
                       for c in comps],
        "expected_total": sum((c.amount for c in comps), Decimal("0")),
        "invoice_lines": [{"id": ln.id, "invoice_number": num, "issue_date": issued, "line_number": ln.line_number,
                           "description": ln.description, "period_start": ln.period_start, "period_end": ln.period_end,
                           "quantity": ln.quantity, "unit_price": ln.unit_price, "discount_pct": ln.discount_pct,
                           "discount_amount": ln.discount_amount, "line_amount": ln.line_amount,
                           "billing_obligation_ref": ln.billing_obligation_ref, "source_batch_id": ln.source_batch_id,
                           "source_row_number": ln.source_row_number}
                          for ln, num, issued in lines],
        "audit": {"id": run.id, "run_code": run.run_code, "engine_version": run.engine_version, "as_of_date": run.as_of_date},
    })


@router.get("/{run_id}/payments")
def payment_results(run_id: str, record_type: str = Query("INVOICE", pattern="^(INVOICE|PAYMENT)$"),
                    status: str | None = None, ageing_bucket: str | None = None, customer_id: int | None = None,
                    page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    _run(db, user, run_id)
    P = PaymentReconciliationResult
    q = (select(P, Customer.customer_code, Customer.name, Invoice.invoice_number, Payment.payment_number)
         .outerjoin(Customer, Customer.id == P.customer_id).outerjoin(Invoice, Invoice.id == P.invoice_id)
         .outerjoin(Payment, Payment.id == P.payment_id)
         .where(P.audit_run_id == run_id, P.record_type == record_type))
    if status:
        q = q.where(P.status.in_([s.strip().upper() for s in status.split(",")]))
    if ageing_bucket:
        q = q.where(P.ageing_bucket == ageing_bucket)
    if customer_id:
        q = q.where(P.customer_id == customer_id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    q = q.order_by(func.coalesce(P.outstanding, P.unallocated_amount).desc().nulls_last(), P.id)
    items = [J({**{c.key: getattr(p, c.key) for c in P.__table__.columns if c.key not in ("tenant_id",)},
                "customer": {"id": p.customer_id, "code": cc, "name": cn}, "invoice_number": inv, "payment_number": pay})
             for p, cc, cn, inv, pay in db.execute(q.offset(page.offset).limit(page.page_size))]
    return page.wrap(items, total)


@router.get("/{run_id}/compare/{other_id}")
def compare(run_id: str, other_id: str, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    """Compare two runs at obligation grain: resolved, remaining, newly detected, amount changes."""
    a, b = _run(db, user, run_id), _run(db, user, other_id)
    R = ReconciliationResult

    def load(run: AuditRun) -> dict:
        return {k: (s, e, i, v) for k, s, e, i, v in db.execute(
            select(R.details["obligation_key"].as_string(), R.status, R.expected_amount, R.invoiced_amount, R.variance)
            .where(R.audit_run_id == run.id, R.obligation_id.is_not(None)))}
    ra, rb = load(a), load(b)
    issue = lambda s: s not in ("MATCHED", "EXCLUDED")  # noqa: E731
    resolved = [k for k in ra if issue(ra[k][0]) and k in rb and not issue(rb[k][0])]
    remaining = [k for k in ra if issue(ra[k][0]) and k in rb and issue(rb[k][0])]
    new = [k for k in rb if issue(rb[k][0]) and (k not in ra or not issue(ra[k][0]))]
    changed = [k for k in ra if k in rb and (ra[k][1] != rb[k][1] or ra[k][2] != rb[k][2])]
    detail = lambda keys, src: [{"obligation_key": k, "status": src[k][0], "expected": src[k][1], "invoiced": src[k][2], "variance": src[k][3]} for k in keys[:200]]  # noqa: E731
    return J({
        "base": run_dict(a), "comparison": run_dict(b),
        "totals": {"expected_delta": b.expected_total - a.expected_total, "invoiced_delta": b.invoiced_total - a.invoiced_total,
                   "underbilled_delta": b.underbilled_total - a.underbilled_total, "overbilled_delta": b.overbilled_total - a.overbilled_total},
        "counts": {"resolved": len(resolved), "remaining": len(remaining), "newly_detected": len(new), "amount_changed": len(changed)},
        "resolved": detail(resolved, rb), "remaining": detail(remaining, rb), "newly_detected": detail(new, rb),
        "amount_changed": [{"obligation_key": k, "before": {"expected": ra[k][1], "invoiced": ra[k][2]},
                            "after": {"expected": rb[k][1], "invoiced": rb[k][2]}} for k in changed[:200]],
    })
