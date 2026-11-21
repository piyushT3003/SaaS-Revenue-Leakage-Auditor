"""KPI endpoints backed exclusively by the central metric service."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.analytics import metrics as M
from backend.app.analytics.calculation import add_months, month_end
from backend.app.api.common import J, parse_ids
from backend.app.core.database import get_db
from backend.app.core.money import D, pct
from backend.app.models import AuditRun, Customer, ImportBatch, Product
from backend.app.security.auth import CurrentUser, require
from backend.app.services.fingerprint import data_fingerprint

router = APIRouter()


def _previous(period_start: date, period_end: date) -> tuple[date, date]:
    if period_start.day == 1 and period_end == month_end(period_end):
        months = (period_end.year - period_start.year) * 12 + period_end.month - period_start.month + 1
        p_start = add_months(period_start, -months)
        return p_start, month_end(add_months(p_start, months - 1))
    length = (period_end - period_start).days + 1
    return period_start - timedelta(days=length), period_start - timedelta(days=1)


def _delta(cur, prev, unit: str) -> dict | None:
    if cur is None or prev is None:
        return None
    if unit == "PERCENT":
        return {"type": "pp", "value": J(D(cur) - D(prev))}
    return {"type": "pct", "value": J(pct(D(cur) - D(prev), D(prev))) if D(prev) != 0 else None}


@router.get("/summary")
def summary(period_start: date, period_end: date, as_of: date | None = None, user: CurrentUser = Depends(require("read")),
            db: Session = Depends(get_db)):
    if period_end < period_start:
        raise HTTPException(422, "period_end must be on or after period_start")
    tid = user.tenant_id
    # Balances are point-in-time: default to today; the comparison uses the same offset one period earlier.
    as_of = as_of or date.today()
    p_start, p_end = _previous(period_start, period_end)
    prev_as_of = as_of - (period_end - p_end)
    run, prev_run = M.latest_audit(db, tid, period_start, period_end), M.latest_audit(db, tid, p_start, p_end)
    cards = []
    pairs = [
        (M.mrr(db, tid, period_end), M.mrr(db, tid, p_end)),
        (M.leakage(db, tid, run), M.leakage(db, tid, prev_run)),
        (M.outstanding(db, tid, as_of), M.outstanding(db, tid, prev_as_of)),
        (M.active_customers(db, tid, period_end), M.active_customers(db, tid, p_end)),
        (M.contribution(db, tid, period_start, period_end)[0], M.contribution(db, tid, p_start, p_end)[0]),
        (M.collection_rate(db, tid, period_start, period_end, as_of), None),
    ]
    for cur, prev in pairs:
        d = cur.to_dict()
        d["previous"] = None if prev is None else J(prev.value)
        d["delta"] = None if prev is None else _delta(cur.value, prev.value, cur.unit)
        cards.append(d)
    fp = data_fingerprint(db, tid)
    return J({
        "period_start": period_start, "period_end": period_end, "as_of": as_of,
        "comparison_period": {"start": p_start, "end": p_end},
        "metrics": {c["key"]: c for c in cards},
        "revenue_health": revenue_health(db, tid, run, fp),
    })


def revenue_health(db: Session, tenant_id: int, run: AuditRun | None, fp: str) -> dict:
    """Separate, explainable indicators — deliberately no single blended 'health %'."""
    totals = db.execute(select(func.coalesce(func.sum(ImportBatch.total_rows), 0), func.coalesce(func.sum(ImportBatch.accepted_rows), 0))
                        .where(ImportBatch.tenant_id == tenant_id, ImportBatch.status.in_(("IMPORTED", "VALIDATED")))).one()
    latest_any = db.scalar(select(AuditRun).where(AuditRun.tenant_id == tenant_id,
                                                  AuditRun.status.in_(("COMPLETED", "COMPLETED_WITH_EXCLUSIONS")))
                           .order_by(AuditRun.completed_at.desc()))
    ref = run or latest_any
    return J({
        "data_quality": {
            "value": pct(totals[1], totals[0]), "unit": "PERCENT",
            "basis": f"{totals[1]} of {totals[0]} uploaded rows passed validation (imported or awaiting confirmation)",
        },
        "reconciliation_rate": {
            "value": None if ref is None else ref.reconciliation_rate, "unit": "PERCENT",
            "basis": "No completed audit yet" if ref is None else
            f"Obligations fully matched in {ref.run_code} ({ref.summary.get('matched_records')} of {ref.summary.get('obligations_in_scope')})",
        },
        "latest_audit": None if ref is None else {"id": ref.id, "run_code": ref.run_code, "status": ref.status,
                                                  "period_start": ref.period_start, "period_end": ref.period_end,
                                                  "completed_at": ref.completed_at},
        "freshness": {
            "status": "NO_AUDIT" if ref is None else ("STALE" if ref.data_fingerprint != fp else "CURRENT"),
            "basis": "Run an audit for this period" if ref is None else
            ("Source data changed after this audit; results may be out of date" if ref.data_fingerprint != fp
             else "No source data has changed since this audit"),
        },
        "period_audit_available": run is not None,
    })


@router.get("/contribution")
def contribution(period_start: date, period_end: date, customer_ids: str | None = None,
                 user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    metric, rows = M.contribution(db, user.tenant_id, period_start, period_end, parse_ids(customer_ids))
    names = dict(db.execute(select(Customer.id, Customer.name).where(Customer.tenant_id == user.tenant_id)).all())
    for r in rows:
        r["customer_name"] = names.get(r["customer_id"])
    return J({"metric": metric.to_dict(), "customers": rows})


@router.get("/definitions")
def definitions(user: CurrentUser = Depends(require("read"))):
    return [
        {"key": "mrr", "formula": "Σ monthly unit price × quantity × (1 − discount%) for active recurring subscriptions"},
        {"key": "expected_billable", "formula": "base recurring + billable usage + contractual one-time − discounts (+ minimum true-ups)"},
        {"key": "underbilling", "formula": "max(0, expected − comparable invoiced) per billing obligation"},
        {"key": "overbilling", "formula": "max(0, comparable invoiced − expected) per billing obligation"},
        {"key": "revenue_leakage", "formula": "unique underbilling exposure from the latest completed audit"},
        {"key": "outstanding", "formula": "invoice total − approved credits + debit adjustments − allocated payments (as of date)"},
        {"key": "collection_rate", "formula": "cash allocated to cohort ÷ cohort collectible value × 100"},
        {"key": "contribution", "formula": "net billed service revenue − allocated direct service costs"},
        {"key": "contribution_margin", "formula": "contribution ÷ net billed service revenue × 100"},
    ]


@router.get("/reference")
def reference(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    """Lightweight lists for filters (customer / product scope pickers)."""
    customers = db.execute(select(Customer.id, Customer.customer_code, Customer.name, Customer.segment, Customer.status)
                           .where(Customer.tenant_id == user.tenant_id).order_by(Customer.name)).all()
    products = db.execute(select(Product.id, Product.product_code, Product.name, Product.charge_model)
                          .where(Product.tenant_id == user.tenant_id).order_by(Product.name)).all()
    return {"customers": [dict(r._mapping) for r in customers], "products": [dict(r._mapping) for r in products]}
