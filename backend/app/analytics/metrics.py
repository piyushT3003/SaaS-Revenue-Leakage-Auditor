"""Central financial metric service — the single place every KPI is calculated.

Pages, exports, the AI assistant and the Power BI views all use these definitions; no page
recalculates a KPI on its own. Every metric returns its value together with its formula,
period, currency, source tables and calculation basis.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from backend.app.analytics.calculation import CalculationError, add_months, month_end, monthly_recurring_value
from backend.app.core.money import D, money, pct, to_json
from backend.app.models import (
    AuditRun,
    CreditAdjustment,
    Customer,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    ProductCost,
    Subscription,
    Tenant,
    UsageEvent,
)
from backend.app.reconciliation.terms import load_subscriptions, subscription_terms, version_terms
from backend.app.replay.asof import active_allocation_clause, issued_invoice_clause

PROFITABLE_MARGIN_PCT = Decimal("15")  # >= 15% contribution margin
AT_RISK_MARGIN_PCT = Decimal("0")  # 0% .. 15%  (below 0% = unprofitable)


@dataclass
class MetricResult:
    key: str
    label: str
    value: Decimal | int | None
    unit: str  # CURRENCY / PERCENT / COUNT
    formula: str
    period: str
    currency: str | None
    source: list[str]
    basis: str
    as_of: str
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        if isinstance(self.value, Decimal):
            d["value"] = to_json(self.value)
        return d


def _currency(db: Session, tenant_id: int) -> str:
    return db.get(Tenant, tenant_id).base_currency


# ----------------------------------------------------------------------------- MRR / customers
def mrr(db: Session, tenant_id: int, as_of: date, customer_ids: list[int] | None = None) -> MetricResult:
    subs = load_subscriptions(db, tenant_id, as_of, as_of, customer_ids)
    total, by_customer, gaps = Decimal("0"), defaultdict(Decimal), []
    for s in subs:
        if s.product.charge_model != "RECURRING":
            continue
        try:
            v = monthly_recurring_value(subscription_terms(s), [version_terms(x) for x in s.contract.versions], as_of)
        except CalculationError as err:
            gaps.append({"subscription": s.subscription_code, "reason": str(err)})
            continue
        total += v
        by_customer[s.customer_id] += v
    return MetricResult(
        "mrr", "Monthly Recurring Revenue", money(total), "CURRENCY",
        "Σ active recurring subscriptions: monthly unit price × quantity × (1 − contractual discount %)",
        f"as of {as_of}", _currency(db, tenant_id), ["subscriptions", "contract_versions", "pricing_rules"],
        "Contracted recurring value normalised to one month (quarterly/annual prices are per-month in the rule). "
        "Excludes usage, one-time charges, taxes. Not billed revenue and not cash.",
        as_of.isoformat(),
        {"customers": len(by_customer), "excluded_subscriptions": gaps[:20], "excluded_count": len(gaps)},
    )


def active_customers(db: Session, tenant_id: int, as_of: date) -> MetricResult:
    q = (select(func.count(func.distinct(Subscription.customer_id)))
         .join(Customer, Customer.id == Subscription.customer_id)
         .where(Subscription.tenant_id == tenant_id, Customer.status == "ACTIVE",
                Subscription.status.in_(("ACTIVE", "CANCELLED")), Subscription.start_date <= as_of,
                or_(Subscription.end_date.is_(None), Subscription.end_date >= as_of)))
    n = db.scalar(q) or 0
    return MetricResult("active_customers", "Active Customers", n, "COUNT",
                        "count(distinct customers with ≥1 non-trial subscription active on the date)",
                        f"as of {as_of}", None, ["customers", "subscriptions"],
                        "Eligible billable customers; trials and paused subscriptions excluded", as_of.isoformat())


# ----------------------------------------------------------------------------- receivables
def _invoice_balances(db: Session, tenant_id: int, as_of: date, issued_from: date | None = None,
                      issued_to: date | None = None, customer_ids: list[int] | None = None):
    alloc = (select(PaymentAllocation.invoice_id, func.sum(PaymentAllocation.amount).label("paid"))
             .join(Payment, Payment.id == PaymentAllocation.payment_id)
             .where(PaymentAllocation.tenant_id == tenant_id, PaymentAllocation.allocated_on <= as_of, Payment.status == "RECEIVED",
                    active_allocation_clause(PaymentAllocation))
             .group_by(PaymentAllocation.invoice_id).subquery())
    cred = (select(CreditAdjustment.invoice_id,
                   func.sum(case((CreditAdjustment.adjustment_type == "DEBIT_ADJUSTMENT", -CreditAdjustment.amount),
                                 else_=CreditAdjustment.amount)).label("credit"))
            .where(CreditAdjustment.tenant_id == tenant_id, CreditAdjustment.status == "APPROVED",
                   CreditAdjustment.effective_date <= as_of, CreditAdjustment.invoice_id.is_not(None))
            .group_by(CreditAdjustment.invoice_id).subquery())
    q = (select(Invoice.id, Invoice.customer_id, Invoice.total_amount, Invoice.due_date,
                func.coalesce(cred.c.credit, 0).label("credit"), func.coalesce(alloc.c.paid, 0).label("paid"))
         .outerjoin(alloc, alloc.c.invoice_id == Invoice.id).outerjoin(cred, cred.c.invoice_id == Invoice.id)
         .where(Invoice.tenant_id == tenant_id, issued_invoice_clause(Invoice), Invoice.issue_date <= as_of))
    if issued_from:
        q = q.where(Invoice.issue_date >= issued_from)
    if issued_to:
        q = q.where(Invoice.issue_date <= issued_to)
    if customer_ids:
        q = q.where(Invoice.customer_id.in_(customer_ids))
    return db.execute(q).all()


def outstanding(db: Session, tenant_id: int, as_of: date, customer_ids: list[int] | None = None) -> MetricResult:
    total = over = Decimal("0")
    overdue = Decimal("0")
    n = 0
    for r in _invoice_balances(db, tenant_id, as_of, customer_ids=customer_ids):
        bal = money(D(r.total_amount) - D(r.credit) - D(r.paid))
        if bal > 0:
            total += bal
            n += 1
            if r.due_date < as_of:
                overdue += bal
        elif bal < 0:
            over += -bal
    return MetricResult(
        "outstanding", "Outstanding Payments", money(total), "CURRENCY",
        "Σ over issued invoices of max(0, invoice total − approved credits + approved debit adjustments − payments allocated)",
        f"as of {as_of}", _currency(db, tenant_id), ["invoices", "credit_adjustments", "payment_allocations", "payments"],
        "Valid (ISSUED) invoices only; draft/void excluded; allocations dated after the as-of date ignored. "
        "Unapplied cash does not reduce a balance until it is allocated.",
        as_of.isoformat(), {"open_invoices": n, "overdue": to_json(money(overdue)), "over_applied": to_json(money(over))},
    )


def collection_rate(db: Session, tenant_id: int, period_start: date, period_end: date, as_of: date,
                    customer_ids: list[int] | None = None) -> MetricResult:
    collectible = collected = Decimal("0")
    rows = _invoice_balances(db, tenant_id, as_of, period_start, period_end, customer_ids)
    for r in rows:
        collectible += D(r.total_amount) - D(r.credit)
        collected += D(r.paid)
    return MetricResult(
        "collection_rate", "Collection Rate", pct(collected, collectible), "PERCENT",
        "cash allocated to the invoice cohort ÷ (cohort invoice total − approved credits) × 100",
        f"invoices issued {period_start}..{period_end}", None, ["invoices", "payment_allocations", "credit_adjustments"],
        f"Cohort = ISSUED invoices dated {period_start}..{period_end}; cash counted if allocated on or before {as_of}",
        as_of.isoformat(), {"collectible": to_json(money(collectible)), "collected": to_json(money(collected)), "invoices": len(rows)},
    )


# ----------------------------------------------------------------------------- revenue / costs / contribution
def billed_revenue_by_customer(db: Session, tenant_id: int, period_start: date, period_end: date,
                               customer_ids: list[int] | None = None) -> dict[int, dict[str, Decimal]]:
    """Net billed service revenue: pre-tax invoice line amounts for service periods starting in
    the window, less approved credit notes effective in the window."""
    product = func.coalesce(InvoiceLine.product_id, Subscription.product_id)
    q = (select(Invoice.customer_id, product, func.sum(InvoiceLine.line_amount))
         .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
         .outerjoin(Subscription, Subscription.id == InvoiceLine.subscription_id)
         .where(Invoice.tenant_id == tenant_id, issued_invoice_clause(Invoice),
                func.coalesce(InvoiceLine.period_start, Invoice.issue_date) >= period_start,
                func.coalesce(InvoiceLine.period_start, Invoice.issue_date) <= period_end)
         .group_by(Invoice.customer_id, product))
    if customer_ids:
        q = q.where(Invoice.customer_id.in_(customer_ids))
    out: dict[int, dict[str, Decimal]] = defaultdict(lambda: {"gross": Decimal("0"), "credits": Decimal("0"), "by_product": {}})
    for cid, pid, amt in db.execute(q):
        out[cid]["gross"] += D(amt)
        out[cid]["by_product"][pid] = out[cid]["by_product"].get(pid, Decimal("0")) + D(amt)
    cq = (select(CreditAdjustment.customer_id, func.sum(CreditAdjustment.amount))
          .where(CreditAdjustment.tenant_id == tenant_id, CreditAdjustment.status == "APPROVED",
                 CreditAdjustment.adjustment_type == "CREDIT_NOTE",
                 CreditAdjustment.effective_date >= period_start, CreditAdjustment.effective_date <= period_end)
          .group_by(CreditAdjustment.customer_id))
    if customer_ids:
        cq = cq.where(CreditAdjustment.customer_id.in_(customer_ids))
    for cid, amt in db.execute(cq):
        out[cid]["credits"] += D(amt)
    for v in out.values():
        v["net"] = money(v["gross"] - v["credits"])
    return out


def _months(period_start: date, period_end: date) -> list[date]:
    out, m = [], period_start.replace(day=1)
    while m <= period_end:
        out.append(m)
        m = add_months(m, 1)
    return out


def direct_costs_by_customer(db: Session, tenant_id: int, period_start: date, period_end: date,
                             revenue: dict[int, dict] | None = None) -> tuple[dict[int, dict[str, Decimal]], dict]:
    """Allocate direct service costs to customers.

    * customer-specific cost rows → that customer (basis DIRECT);
    * product-level pools → customers using that product in that month, in proportion to
      usage units (USAGE), subscribed quantity (SEATS) or billed revenue (REVENUE).
    Pools with no allocation basis in a month are reported as unallocated, never spread evenly.
    """
    tz = ZoneInfo(db.get(Tenant, tenant_id).timezone)
    costs: dict[int, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    unallocated = Decimal("0")
    revenue = revenue if revenue is not None else billed_revenue_by_customer(db, tenant_id, period_start, period_end)
    rows = list(db.scalars(select(ProductCost).where(ProductCost.tenant_id == tenant_id,
                                                     ProductCost.period_month >= period_start.replace(day=1),
                                                     ProductCost.period_month <= period_end)))
    basis_cache: dict[tuple, dict[int, Decimal]] = {}

    def basis(kind: str, product_id: int, month: date) -> dict[int, Decimal]:
        key = (kind, product_id, month)
        if key in basis_cache:
            return basis_cache[key]
        m_end = month_end(month)
        shares: dict[int, Decimal] = {}
        if kind == "USAGE":
            lo, hi = datetime.combine(month, time.min, tz), datetime.combine(m_end + timedelta(days=1), time.min, tz)
            for cid, q in db.execute(select(UsageEvent.customer_id, func.sum(UsageEvent.quantity)).where(
                    UsageEvent.tenant_id == tenant_id, UsageEvent.product_id == product_id,
                    UsageEvent.occurred_at >= lo, UsageEvent.occurred_at < hi).group_by(UsageEvent.customer_id)):
                shares[cid] = D(q)
        elif kind == "SEATS":
            for cid, q in db.execute(select(Subscription.customer_id, func.sum(Subscription.quantity)).where(
                    Subscription.tenant_id == tenant_id, Subscription.product_id == product_id,
                    Subscription.status.in_(("ACTIVE", "CANCELLED")), Subscription.start_date <= m_end,
                    or_(Subscription.end_date.is_(None), Subscription.end_date >= month)).group_by(Subscription.customer_id)):
                shares[cid] = D(q)
        else:  # REVENUE
            month_rev = billed_revenue_by_customer(db, tenant_id, month, m_end)
            shares = {cid: v["by_product"].get(product_id, Decimal("0")) for cid, v in month_rev.items()}
        shares = {k: v for k, v in shares.items() if v > 0}
        basis_cache[key] = shares
        return shares

    for r in rows:
        amt = D(r.amount)
        if r.customer_id is not None:
            costs[r.customer_id][r.cost_type] += amt
            continue
        shares = basis(r.allocation_basis if r.allocation_basis != "DIRECT" else "USAGE", r.product_id, r.period_month)
        total = sum(shares.values(), Decimal("0"))
        if total == 0:
            unallocated += amt
            continue
        for cid, share in shares.items():
            costs[cid][r.cost_type] += amt * share / total
    rounded = {cid: {k: money(v) for k, v in d.items()} for cid, d in costs.items()}
    return rounded, {"unallocated_pool_costs": to_json(money(unallocated))}


def classify_margin(margin: Decimal | None) -> str:
    if margin is None:
        return "NO_REVENUE"
    if margin >= PROFITABLE_MARGIN_PCT:
        return "PROFITABLE"
    if margin >= AT_RISK_MARGIN_PCT:
        return "AT_RISK"
    return "UNPROFITABLE"


def contribution(db: Session, tenant_id: int, period_start: date, period_end: date,
                 customer_ids: list[int] | None = None) -> tuple[MetricResult, list[dict]]:
    rev = billed_revenue_by_customer(db, tenant_id, period_start, period_end, customer_ids)
    costs, cost_meta = direct_costs_by_customer(db, tenant_id, period_start, period_end, rev)
    ids = set(rev) | set(costs)
    if customer_ids:
        ids &= set(customer_ids)
    rows, tot_rev, tot_cost = [], Decimal("0"), Decimal("0")
    for cid in sorted(ids):
        net = rev[cid]["net"] if cid in rev else Decimal("0")
        c = sum(costs.get(cid, {}).values(), Decimal("0"))
        contrib = money(net - c)
        margin = pct(contrib, net) if net > 0 else None
        tot_rev += net
        tot_cost += c
        rows.append({"customer_id": cid, "net_revenue": net, "direct_cost": money(c), "contribution": contrib,
                     "margin_pct": margin, "segment": classify_margin(margin),
                     "cost_breakdown": {k: v for k, v in costs.get(cid, {}).items()}})
    contrib_total = money(tot_rev - tot_cost)
    seg_counts = defaultdict(int)
    for r in rows:
        seg_counts[r["segment"]] += 1
    metric = MetricResult(
        "contribution_margin", "Contribution Margin", pct(contrib_total, tot_rev), "PERCENT",
        "(net billed service revenue − allocated direct service costs) ÷ net billed service revenue × 100",
        f"{period_start}..{period_end}", _currency(db, tenant_id),
        ["invoice_lines", "invoices", "credit_adjustments", "product_costs", "usage_events", "subscriptions"],
        "Customer-level contribution, not accounting profit or recognised revenue. Revenue = pre-tax invoice lines for "
        "service periods in the window less approved credit notes. Direct costs = customer-specific costs plus product "
        "cost pools allocated by usage, seats or revenue share (see METRIC_DEFINITIONS.md).",
        period_end.isoformat(),
        {"net_revenue": to_json(money(tot_rev)), "direct_cost": to_json(money(tot_cost)), "contribution": to_json(contrib_total),
         "customers": len(rows), "segments": dict(seg_counts), **cost_meta,
         "segment_rule": f"PROFITABLE ≥ {PROFITABLE_MARGIN_PCT}% > AT_RISK ≥ {AT_RISK_MARGIN_PCT}% > UNPROFITABLE"},
    )
    return metric, rows


# ----------------------------------------------------------------------------- audit-derived
def latest_audit(db: Session, tenant_id: int, period_start: date, period_end: date) -> AuditRun | None:
    return db.scalar(select(AuditRun).where(
        AuditRun.tenant_id == tenant_id, AuditRun.run_type == "STANDARD",
        AuditRun.status.in_(("COMPLETED", "COMPLETED_WITH_EXCLUSIONS")),
        AuditRun.period_start == period_start, AuditRun.period_end == period_end,
        func.jsonb_array_length(AuditRun.scope["customer_ids"]) == 0,
        func.jsonb_array_length(AuditRun.scope["product_ids"]) == 0,
    ).order_by(AuditRun.completed_at.desc()))


def leakage(db: Session, tenant_id: int, run: AuditRun | None) -> MetricResult:
    value = None if run is None else run.underbilled_total
    return MetricResult(
        "revenue_leakage", "Revenue Leakage", value, "CURRENCY",
        "Σ over in-scope billing obligations of max(0, expected − comparable invoiced)",
        "" if run is None else f"{run.period_start}..{run.period_end}", _currency(db, tenant_id),
        ["reconciliation_results", "billing_obligation_components"],
        "Unique underbilling exposure from the latest completed audit. Each obligation is counted once, so a missing charge "
        "and the unbilled usage behind it are never added twice. Excluded and pending-review obligations are not counted.",
        "" if run is None else run.as_of_date.isoformat(),
        {} if run is None else {"audit_run_id": run.id, "run_code": run.run_code, "overbilled": to_json(run.overbilled_total)},
    )
