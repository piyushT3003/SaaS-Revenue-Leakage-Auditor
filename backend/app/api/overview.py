"""Executive Overview aggregates (trend, distribution, profitability) and global search."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.app.analytics import metrics as M
from backend.app.analytics.calculation import add_months, month_end
from backend.app.api.common import J
from backend.app.core.database import get_db
from backend.app.core.money import money, pct
from backend.app.models import AuditRun, Contract, Customer, ExceptionCase, Invoice
from backend.app.security.auth import CurrentUser, require

router = APIRouter()


@router.get("/overview/trend")
def trend(end: date, months: int = Query(6, ge=1, le=24), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    """Per month: expected vs invoiced (from the latest completed audit of that month) and leakage.
    Months without an audit report billed revenue only and say so — expected values are never invented."""
    out = []
    start = add_months(end.replace(day=1), -(months - 1))
    m = start
    while m <= end:
        m_end = month_end(m)
        run = M.latest_audit(db, user.tenant_id, m, m_end)
        rev = M.billed_revenue_by_customer(db, user.tenant_id, m, m_end)
        billed = money(sum((v["gross"] for v in rev.values()), Decimal("0")))
        margin = M.contribution(db, user.tenant_id, m, m_end)[0]
        out.append({
            "month": m, "label": f"{m:%b}", "billed": billed,
            "mrr": M.mrr(db, user.tenant_id, m_end).value,
            "outstanding": M.outstanding(db, user.tenant_id, m_end).value,
            "active_customers": M.active_customers(db, user.tenant_id, m_end).value,
            "margin_pct": margin.value,
            "expected": None if run is None else run.expected_total,
            "invoiced": None if run is None else run.invoiced_total,
            "leakage": None if run is None else run.underbilled_total,
            "overbilled": None if run is None else run.overbilled_total,
            "audit_run_id": None if run is None else run.id, "run_code": None if run is None else run.run_code,
        })
        m = add_months(m, 1)
    return J({"months": out, "basis": "Expected/invoiced/leakage come from the latest completed audit of each month; "
                                      "'billed' is pre-tax invoice lines by service period"})


@router.get("/overview/profitability")
def profitability(period_start: date, period_end: date, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    metric, rows = M.contribution(db, user.tenant_id, period_start, period_end)
    total = len([r for r in rows if r["segment"] != "NO_REVENUE"])
    segs = []
    for key, label in (("PROFITABLE", "Profitable Customers"), ("AT_RISK", "At-Risk Customers"), ("UNPROFITABLE", "Unprofitable Customers")):
        n = sum(1 for r in rows if r["segment"] == key)
        segs.append({"segment": key, "label": label, "count": n, "share_pct": pct(n, total),
                     "contribution": money(sum((r["contribution"] for r in rows if r["segment"] == key), Decimal("0")))})
    return J({"segments": segs, "customers": total, "metric": metric.to_dict()})


@router.get("/search")
def search(q: str = Query(min_length=2, max_length=80), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    like = f"%{q.strip()}%"
    t = user.tenant_id
    customers = db.execute(select(Customer.id, Customer.customer_code, Customer.name, Customer.segment)
                           .where(Customer.tenant_id == t, or_(Customer.name.ilike(like), Customer.customer_code.ilike(like)))
                           .order_by(Customer.name).limit(6)).all()
    contracts = db.execute(select(Contract.id, Contract.contract_number, Customer.name, Customer.id)
                           .join(Customer).where(Contract.tenant_id == t, Contract.contract_number.ilike(like)).limit(5)).all()
    invoices = db.execute(select(Invoice.id, Invoice.invoice_number, Customer.name, Invoice.total_amount, Invoice.status)
                          .join(Customer).where(Invoice.tenant_id == t, Invoice.invoice_number.ilike(like)).limit(5)).all()
    exceptions = db.execute(select(ExceptionCase.id, ExceptionCase.exception_code, ExceptionCase.title, ExceptionCase.status)
                            .where(ExceptionCase.tenant_id == t, or_(ExceptionCase.exception_code.ilike(like), ExceptionCase.title.ilike(like)))
                            .limit(5)).all()
    return J({
        "customers": [{"id": i, "code": c, "name": n, "segment": s, "link": f"/customers/{i}"} for i, c, n, s in customers],
        "contracts": [{"id": i, "number": n, "customer": cn, "link": f"/customers/{cid}?tab=contracts"} for i, n, cn, cid in contracts],
        "invoices": [{"id": i, "number": n, "customer": cn, "total": tot, "status": st, "link": f"/billing?invoice={i}"}
                     for i, n, cn, tot, st in invoices],
        "exceptions": [{"id": i, "code": c, "title": ti, "status": st, "link": f"/exceptions?id={i}"} for i, c, ti, st in exceptions],
    })


@router.get("/audits-index")
def audits_index(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    """Months that have a completed audit (for period pickers)."""
    rows = db.execute(select(AuditRun.period_start, AuditRun.period_end, func.max(AuditRun.completed_at))
                      .where(AuditRun.tenant_id == user.tenant_id, AuditRun.status.in_(("COMPLETED", "COMPLETED_WITH_EXCLUSIONS")))
                      .group_by(AuditRun.period_start, AuditRun.period_end).order_by(AuditRun.period_start.desc())).all()
    return J([{"period_start": s, "period_end": e, "last_completed_at": c} for s, e, c in rows])


@router.get("/reports/executive")
def executive_report(period_start: date, period_end: date, as_of: date | None = None,
                     fmt: str = Query("pdf", pattern="^(pdf|xlsx)$"), user: CurrentUser = Depends(require("export")),
                     db: Session = Depends(get_db)):
    from fastapi.responses import Response

    from backend.app.exports.executive import collect, executive_pdf, executive_xlsx
    from backend.app.services.tenancy import record_audit

    data = collect(db, user.tenant_id, period_start, period_end, as_of or date.today())
    record_audit(db, user.tenant_id, user.id, "REPORT_EXPORTED", "report", "executive", format=fmt,
                 period=f"{period_start}..{period_end}")
    db.commit()
    name = f"executive_report_{period_start}_{period_end}.{fmt}"
    if fmt == "pdf":
        return Response(executive_pdf(data), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})
    return Response(executive_xlsx(data), headers={"Content-Disposition": f'attachment; filename="{name}"'},
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@router.get("/onboarding/status")
def onboarding_status(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    """First-run checklist: what has been loaded, in the order the audit needs it, and whether an audit has run.
    The UI shows a "Get started" guide until the first audit completes."""
    from backend.app.models import Payment, PricingRule, Product, Subscription

    tid = user.tenant_id

    def count(model) -> int:
        return db.scalar(select(func.count()).select_from(model).where(model.tenant_id == tid)) or 0

    steps = [
        {"key": "customers", "label": "Customers", "dataset": "customers", "count": count(Customer)},
        {"key": "products", "label": "Products", "dataset": "products", "count": count(Product)},
        {"key": "contracts", "label": "Contracts and contract versions", "dataset": "contracts", "count": count(Contract)},
        {"key": "pricing_rules", "label": "Pricing rules", "dataset": "pricing_rules", "count": count(PricingRule)},
        {"key": "subscriptions", "label": "Subscriptions", "dataset": "subscriptions", "count": count(Subscription)},
        {"key": "invoices", "label": "Invoices and invoice lines", "dataset": "invoices", "count": count(Invoice)},
        {"key": "payments", "label": "Payments (optional, for collections)", "dataset": "payments", "count": count(Payment),
         "optional": True},
    ]
    audits = db.scalar(select(func.count(AuditRun.id)).where(
        AuditRun.tenant_id == tid, AuditRun.status.in_(("COMPLETED", "COMPLETED_WITH_EXCLUSIONS")))) or 0
    from backend.app.services.settings import get_setting

    general = get_setting(db, tid, "general")
    return {
        "company": general.get("workspace_name") or "your workspace", "base_currency": general.get("currency"),
        "timezone": general.get("timezone"),
        "steps": steps, "completed_audits": audits,
        "ready_to_audit": all(s["count"] > 0 for s in steps if not s.get("optional")),
        "complete": audits > 0,
    }
