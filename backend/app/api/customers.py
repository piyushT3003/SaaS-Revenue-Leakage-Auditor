"""Customer Intelligence: directory, summary, full financial profile, comparison."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.analytics import metrics as M
from backend.app.analytics.calculation import CalculationError, add_months, month_end, monthly_recurring_value
from backend.app.api.common import J, Page, not_found, pagination, parse_ids
from backend.app.core.database import get_db
from backend.app.core.money import D, money, pct
from backend.app.models import (
    Contract,
    ContractVersion,
    CreditAdjustment,
    Customer,
    ExceptionCase,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    PricingRule,
    Product,
    Subscription,
    Tenant,
    UsageEvent,
)
from backend.app.reconciliation.terms import subscription_terms, version_terms
from backend.app.security.auth import CurrentUser, require

router = APIRouter()


def _mrr_by_customer(db: Session, tenant_id: int, as_of: date, customer_ids: list[int] | None = None) -> dict[int, Decimal]:
    q = (select(Subscription).join(Product).where(Subscription.tenant_id == tenant_id, Product.charge_model == "RECURRING",
                                                  Subscription.status.in_(("ACTIVE", "CANCELLED")))
         .options(selectinload(Subscription.contract).selectinload(Contract.versions).selectinload(ContractVersion.pricing_rules)))
    if customer_ids:
        q = q.where(Subscription.customer_id.in_(customer_ids))
    out: dict[int, Decimal] = defaultdict(Decimal)
    for s in db.scalars(q):
        try:
            out[s.customer_id] += monthly_recurring_value(subscription_terms(s), [version_terms(v) for v in s.contract.versions], as_of)
        except CalculationError:
            continue
    return out


def _directory_rows(db: Session, tenant_id: int, period_start: date, period_end: date, as_of: date) -> list[dict]:
    customers = list(db.scalars(select(Customer).where(Customer.tenant_id == tenant_id)))
    mrr = _mrr_by_customer(db, tenant_id, period_end)
    _, contrib = M.contribution(db, tenant_id, period_start, period_end)
    contrib = {r["customer_id"]: r for r in contrib}
    balances: dict[int, Decimal] = defaultdict(Decimal)
    overdue60: set[int] = set()
    for r in M._invoice_balances(db, tenant_id, as_of):
        bal = D(r.total_amount) - D(r.credit) - D(r.paid)
        if bal > 0:
            balances[r.customer_id] += bal
            if (as_of - r.due_date).days > 60:
                overdue60.add(r.customer_id)
    open_ex = dict(db.execute(select(ExceptionCase.customer_id, func.count(ExceptionCase.id)).where(
        ExceptionCase.tenant_id == tenant_id, ExceptionCase.status.in_(("OPEN", "IN_PROGRESS"))).group_by(ExceptionCase.customer_id)).all())
    plans = defaultdict(set)
    for cid, name in db.execute(select(Subscription.customer_id, Product.name).join(Product).where(Subscription.tenant_id == tenant_id)):
        plans[cid].add(name)
    usage_rev = defaultdict(Decimal)
    for cid, amt in db.execute(select(Invoice.customer_id, func.sum(InvoiceLine.line_amount)).join(Invoice)
                               .where(Invoice.tenant_id == tenant_id, Invoice.status == "ISSUED", InvoiceLine.charge_type == "USAGE",
                                      InvoiceLine.period_start >= period_start, InvoiceLine.period_start <= period_end)
                               .group_by(Invoice.customer_id)):
        usage_rev[cid] = D(amt)
    rows = []
    for c in customers:
        cr = contrib.get(c.id)
        risk_reasons = []
        if cr and cr["segment"] in ("AT_RISK", "UNPROFITABLE"):
            risk_reasons.append(f"{cr['segment'].replace('_', '-').lower()} contribution margin")
        if c.id in overdue60:
            risk_reasons.append("invoice overdue > 60 days")
        if open_ex.get(c.id, 0) >= 2:
            risk_reasons.append(f"{open_ex[c.id]} open exceptions")
        rec = mrr.get(c.id, Decimal("0"))
        expansion = rec > 0 and usage_rev[c.id] >= rec * Decimal("0.20")
        rows.append({
            "id": c.id, "code": c.customer_code, "name": c.name, "segment": c.segment, "status": c.status, "region": c.region,
            "industry": c.industry, "account_owner": c.account_owner, "onboarded_on": c.onboarded_on,
            "mrr": money(rec), "net_revenue": cr["net_revenue"] if cr else Decimal("0.00"),
            "direct_cost": cr["direct_cost"] if cr else Decimal("0.00"), "contribution": cr["contribution"] if cr else Decimal("0.00"),
            "margin_pct": cr["margin_pct"] if cr else None, "profitability": cr["segment"] if cr else "NO_REVENUE",
            "outstanding": money(balances.get(c.id, Decimal("0"))), "open_exceptions": open_ex.get(c.id, 0),
            "plans": sorted(plans.get(c.id, [])), "at_risk": bool(risk_reasons), "risk_reasons": risk_reasons,
            "expansion_opportunity": expansion,
            "expansion_reason": f"usage charges {money(usage_rev[c.id])} ≥ 20% of MRR" if expansion else "",
        })
    return rows


@router.get("/customers/summary")
def summary(period_start: date, period_end: date, as_of: date | None = None, user: CurrentUser = Depends(require("read")),
            db: Session = Depends(get_db)):
    rows = _directory_rows(db, user.tenant_id, period_start, period_end, as_of or date.today())
    active = [r for r in rows if r["status"] == "ACTIVE"]
    seg_counts = defaultdict(int)
    for r in active:
        seg_counts[r["segment"]] += 1
    top = sorted(rows, key=lambda r: r["net_revenue"], reverse=True)[:5]
    return J({
        "total_customers": len(active),
        "new_customers": sum(1 for r in rows if r["onboarded_on"] and period_start <= r["onboarded_on"] <= period_end),
        "at_risk_customers": sum(1 for r in active if r["at_risk"]),
        "expansion_opportunities": sum(1 for r in active if r["expansion_opportunity"]),
        "by_segment": [{"segment": s, "count": seg_counts[s], "share_pct": pct(seg_counts[s], len(active))}
                       for s in ("ENTERPRISE", "MID_MARKET", "SMB")],
        "top_by_revenue": [{"id": r["id"], "name": r["name"], "net_revenue": r["net_revenue"]} for r in top],
        "definitions": {
            "at_risk": "AT_RISK/UNPROFITABLE contribution margin, an invoice > 60 days overdue, or ≥ 2 open exceptions",
            "expansion": "usage charges in the period ≥ 20% of recurring MRR (candidate for a larger plan)",
            "new": "onboarded within the selected period",
        },
    })


@router.get("/customers")
def directory(period_start: date, period_end: date, as_of: date | None = None, search: str | None = None,
              segment: str | None = None, status: str | None = None, plan: str | None = None, risk: bool | None = None,
              profitability: str | None = None,
              sort: str = Query("-net_revenue", pattern="^-?(name|net_revenue|mrr|margin_pct|outstanding|open_exceptions)$"),
              page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    rows = _directory_rows(db, user.tenant_id, period_start, period_end, as_of or date.today())
    if search:
        s = search.lower()
        rows = [r for r in rows if s in r["name"].lower() or s in r["code"].lower()]
    if segment:
        rows = [r for r in rows if r["segment"] in segment.upper().split(",")]
    if status:
        rows = [r for r in rows if r["status"] in status.upper().split(",")]
    if plan:
        rows = [r for r in rows if plan in r["plans"]]
    if risk is not None:
        rows = [r for r in rows if r["at_risk"] == risk]
    if profitability:
        rows = [r for r in rows if r["profitability"] in profitability.upper().split(",")]
    key = sort.lstrip("-")
    rows.sort(key=lambda r: (r[key] is None, r[key] if r[key] is not None else 0), reverse=sort.startswith("-"))
    if sort.startswith("-"):
        rows.sort(key=lambda r: r[key] is None)  # nulls last
    return page.wrap(J(rows[page.offset: page.offset + page.page_size]), len(rows))


@router.get("/customers/compare")
def compare(ids: str, period_start: date, period_end: date, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    wanted = parse_ids(ids) or []
    if not 2 <= len(wanted) <= 5:
        raise HTTPException(422, "Select between 2 and 5 customers to compare")
    rows = {r["id"]: r for r in _directory_rows(db, user.tenant_id, period_start, period_end, date.today()) if r["id"] in wanted}
    if len(rows) != len(wanted):
        raise not_found("Customer")
    return J([rows[i] for i in wanted])


@router.get("/customers/{customer_id}")
def profile(customer_id: int, period_start: date, period_end: date, user: CurrentUser = Depends(require("read")),
            db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if c is None or c.tenant_id != user.tenant_id:
        raise not_found("Customer")
    t = user.tenant_id
    tz = ZoneInfo(db.get(Tenant, t).timezone)
    as_of = date.today()
    row = next(r for r in _directory_rows(db, t, period_start, period_end, as_of) if r["id"] == c.id)

    contracts = []
    for ctr in db.scalars(select(Contract).where(Contract.customer_id == c.id).options(
            selectinload(Contract.versions).selectinload(ContractVersion.pricing_rules).selectinload(PricingRule.product))):
        contracts.append({"id": ctr.id, "number": ctr.contract_number, "start_date": ctr.start_date, "end_date": ctr.end_date,
                          "currency": ctr.currency, "billing_frequency": ctr.billing_frequency, "status": ctr.status,
                          "payment_terms_days": ctr.payment_terms_days,
                          "versions": [{"id": v.id, "version": v.version_number, "effective_from": v.effective_from,
                                        "effective_to": v.effective_to, "change_reason": v.change_reason,
                                        "current": v.effective_from <= as_of and (v.effective_to is None or v.effective_to >= as_of),
                                        "rules": [{"id": r.id, "rule_key": r.rule_key, "rule_version": r.rule_version,
                                                   "product": r.product.name, "charge_type": r.charge_type, "model": r.pricing_model,
                                                   "unit_price": r.unit_price, "included_units": r.included_units, "tiers": r.tiers,
                                                   "discount_pct": r.discount_pct, "status": r.status} for r in v.pricing_rules]}
                                       for v in ctr.versions]})

    subs = db.execute(select(Subscription, Product).join(Product).where(Subscription.customer_id == c.id).order_by(Subscription.id)).all()
    subscriptions = [{"id": s.id, "code": s.subscription_code, "product": p.name, "product_code": p.product_code,
                      "charge_model": p.charge_model, "plan": s.plan_name, "quantity": s.quantity, "status": s.status,
                      "start_date": s.start_date, "end_date": s.end_date, "billing_frequency": s.billing_frequency} for s, p in subs]

    # usage: per month and product, with allowance and excess
    usage = []
    m = add_months(period_end.replace(day=1), -5)
    while m <= period_end:
        lo, hi = datetime.combine(m, time.min, tz), datetime.combine(month_end(m) + timedelta(days=1), time.min, tz)
        for s, p in subs:
            if p.charge_model != "USAGE":
                continue
            used = D(db.scalar(select(func.coalesce(func.sum(UsageEvent.quantity), 0)).where(
                UsageEvent.subscription_id == s.id, UsageEvent.occurred_at >= lo, UsageEvent.occurred_at < hi)))
            ver = next((v for ctr in s.contract.versions for v in [ctr] if v.effective_from <= month_end(m)
                        and (v.effective_to is None or v.effective_to >= m)), None)
            rule = None if ver is None else next((r for r in ver.pricing_rules if r.product_id == p.id and r.charge_type == "USAGE"), None)
            included = D(rule.included_units) if rule else Decimal("0")
            usage.append({"month": m, "product": p.name, "unit": p.unit_name, "used": used, "included": included,
                          "excess": max(Decimal("0"), used - included)})
        m = add_months(m, 1)

    invoices = []
    balances = {r.id: r for r in M._invoice_balances(db, t, as_of, customer_ids=[c.id])}
    for inv in db.scalars(select(Invoice).where(Invoice.customer_id == c.id).order_by(Invoice.issue_date.desc()).limit(36)):
        b = balances.get(inv.id)
        bal = None if b is None else money(D(b.total_amount) - D(b.credit) - D(b.paid))
        invoices.append({"id": inv.id, "number": inv.invoice_number, "issue_date": inv.issue_date, "due_date": inv.due_date,
                         "status": inv.status, "total": inv.total_amount, "outstanding": bal})
    payments = [{"id": p.id, "number": p.payment_number, "received_on": p.received_on, "amount": p.amount, "method": p.method,
                 "reference": p.transaction_reference, "verification_status": p.verification_status,
                 "allocated": money(sum((D(a.amount) for a in p.allocations if a.reversed_at is None), Decimal("0")))}
                for p in db.scalars(select(Payment).where(Payment.customer_id == c.id).order_by(Payment.received_on.desc()).limit(36))]
    credits = [{"id": x.id, "number": x.credit_number, "type": x.adjustment_type, "amount": x.amount, "status": x.status,
                "reason": x.reason, "effective_date": x.effective_date}
               for x in db.scalars(select(CreditAdjustment).where(CreditAdjustment.customer_id == c.id))]
    exceptions = [{"id": e.id, "code": e.exception_code, "category": e.category, "title": e.title, "impact": e.financial_impact,
                   "severity": e.severity, "status": e.status, "period_start": e.period_start}
                  for e in db.scalars(select(ExceptionCase).where(ExceptionCase.customer_id == c.id).order_by(ExceptionCase.created_at.desc()))]
    monthly = []
    m = add_months(period_end.replace(day=1), -5)
    while m <= period_end:
        _, rows_m = M.contribution(db, t, m, month_end(m), [c.id])
        r = rows_m[0] if rows_m else None
        monthly.append({"month": m, "revenue": r["net_revenue"] if r else Decimal("0"), "cost": r["direct_cost"] if r else Decimal("0"),
                        "contribution": r["contribution"] if r else Decimal("0"), "margin_pct": r["margin_pct"] if r else None})
        m = add_months(m, 1)
    _, cur = M.contribution(db, t, period_start, period_end, [c.id])
    return J({"customer": row, "contracts": contracts, "subscriptions": subscriptions, "usage": usage, "invoices": invoices,
              "payments": payments, "credits": credits, "exceptions": exceptions,
              "profitability": {"period": cur[0] if cur else None, "monthly": monthly}})
