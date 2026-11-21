"""Controlled, read-only tools for the AI Investigation Assistant.

Design rules (spec §AI):
* The assistant never writes SQL. It can only call the functions registered here.
* Every tool is tenant-scoped by the caller's session, validates its arguments with Pydantic,
  caps row counts, and only reads (the session is rolled back after the answer).
* Every tool returns the rows it used, the source tables and the metric definition, so each
  figure in an answer can be traced to stored records.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Callable

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.analytics import metrics as M
from backend.app.core.money import D, money
from backend.app.models import AuditRun, Customer, ExceptionCase, ReconciliationResult
from backend.app.analytics.calculation import add_months, month_end

CATEGORY_LABEL = {
    "UNDERBILLING": "Underbilling", "OVERBILLING": "Overbilling", "MISSING_CHARGE": "Missing charges",
    "DUPLICATE_INVOICE": "Duplicate invoices", "DISCOUNT_DRIFT": "Discount drift", "PRICING_MISMATCH": "Pricing mismatch",
    "UNBILLED_USAGE": "Unbilled usage", "PAYMENT_DISCREPANCY": "Payment discrepancies",
}


@dataclass
class ToolResult:
    summary: dict
    rows: list[dict] = field(default_factory=list)
    source: list[str] = field(default_factory=list)
    definition: str = ""
    block: dict | None = None  # how the UI should render the rows


class PeriodArgs(BaseModel):
    period_start: date
    period_end: date


class LimitArgs(PeriodArgs):
    limit: int = Field(default=5, ge=1, le=25)


class MarginArgs(LimitArgs):
    segment: str = Field(default="UNPROFITABLE", pattern="^(UNPROFITABLE|AT_RISK|PROFITABLE)$")


class OutstandingArgs(BaseModel):
    as_of: date
    limit: int = Field(default=10, ge=1, le=25)


class CustomerArgs(PeriodArgs):
    customer_id: int


class ExceptionArgs(BaseModel):
    exception_code: str = Field(pattern=r"^EX-\d{1,8}$")


def previous_period(start: date, end: date) -> tuple[date, date]:
    months = (end.year - start.year) * 12 + end.month - start.month + 1
    ps = add_months(start, -months)
    return ps, month_end(add_months(ps, months - 1))


def _names(db: Session, tid: int) -> dict[int, str]:
    return dict(db.execute(select(Customer.id, Customer.name).where(Customer.tenant_id == tid)).all())


def _cases(db: Session, tid: int, start: date, end: date):
    return list(db.scalars(select(ExceptionCase).where(ExceptionCase.tenant_id == tid, ExceptionCase.status != "DISMISSED",
                                                       ExceptionCase.period_start >= start, ExceptionCase.period_start <= end)))


# ----------------------------------------------------------------------------- tools
def kpi_snapshot(db: Session, tid: int, a: PeriodArgs) -> ToolResult:
    run = M.latest_audit(db, tid, a.period_start, a.period_end)
    ps, pe = previous_period(a.period_start, a.period_end)
    prev = M.latest_audit(db, tid, ps, pe)
    mrr, mrr_prev = M.mrr(db, tid, a.period_end), M.mrr(db, tid, pe)
    contrib = M.contribution(db, tid, a.period_start, a.period_end)[0]
    out = M.outstanding(db, tid, a.period_end)
    active = M.active_customers(db, tid, a.period_end)
    s = {"mrr": mrr.value, "mrr_previous": mrr_prev.value, "leakage": None if run is None else run.underbilled_total,
         "leakage_previous": None if prev is None else prev.underbilled_total, "outstanding": out.value,
         "active_customers": active.value, "contribution_margin_pct": contrib.value,
         "reconciliation_rate": None if run is None else run.reconciliation_rate, "audit": None if run is None else run.run_code}
    items = [{"label": "MRR", "value": s["mrr"], "unit": "CURRENCY"}, {"label": "Revenue leakage", "value": s["leakage"], "unit": "CURRENCY"},
             {"label": "Outstanding", "value": s["outstanding"], "unit": "CURRENCY"}, {"label": "Contribution margin", "value": s["contribution_margin_pct"], "unit": "PERCENT"}]
    return ToolResult(s, [], ["subscriptions", "pricing_rules", "audit_runs", "invoices", "payment_allocations", "product_costs"],
                      f"MRR: {mrr.formula}. Leakage: unique underbilling from the latest completed audit. Margin: {contrib.formula}.",
                      {"type": "kpis", "items": items})


def leakage_by_category(db: Session, tid: int, a: PeriodArgs) -> ToolResult:
    agg: dict[str, dict] = {}
    for c in _cases(db, tid, a.period_start, a.period_end):
        x = agg.setdefault(c.category, {"category": c.category, "label": CATEGORY_LABEL.get(c.category, c.category), "cases": 0,
                                        "exposure": Decimal("0"), "counts_toward_leakage": c.counts_toward_leakage})
        x["cases"] += 1
        x["exposure"] += D(c.financial_impact)
    rows = sorted(({**v, "exposure": money(v["exposure"])} for v in agg.values()), key=lambda r: -r["exposure"])
    run = M.latest_audit(db, tid, a.period_start, a.period_end)
    return ToolResult({"cases": sum(r["cases"] for r in rows), "categories": len(rows), "unique_leakage": None if run is None else run.underbilled_total},
                      rows, ["exceptions", "audit_runs"],
                      "Exposure per category is the sum of each exception's financial impact. Categories can share an exposure "
                      "(a missing charge and its unbilled usage), so headline leakage uses the audit's unique underbilling instead.",
                      {"type": "bar", "x": "label", "y": "exposure", "format": "inr"})


def leakage_change(db: Session, tid: int, a: PeriodArgs) -> ToolResult:
    ps, pe = previous_period(a.period_start, a.period_end)
    cur_run, prev_run = M.latest_audit(db, tid, a.period_start, a.period_end), M.latest_audit(db, tid, ps, pe)
    by = defaultdict(lambda: {"current": Decimal("0"), "previous": Decimal("0"), "current_cases": 0, "previous_cases": 0})
    names = _names(db, tid)
    cur_cases = _cases(db, tid, a.period_start, a.period_end)
    for c in cur_cases:
        if c.counts_toward_leakage:
            by[c.category]["current"] += D(c.financial_impact)
            by[c.category]["current_cases"] += 1
    for c in _cases(db, tid, ps, pe):
        if c.counts_toward_leakage:
            by[c.category]["previous"] += D(c.financial_impact)
            by[c.category]["previous_cases"] += 1
    rows = sorted(({"category": k, "label": CATEGORY_LABEL.get(k, k), "current": money(v["current"]), "previous": money(v["previous"]),
                    "change": money(v["current"] - v["previous"]), "current_cases": v["current_cases"], "previous_cases": v["previous_cases"]}
                   for k, v in by.items()), key=lambda r: -r["change"])
    top = sorted((c for c in cur_cases if c.counts_toward_leakage), key=lambda c: -D(c.financial_impact))[:3]
    s = {"current": None if cur_run is None else cur_run.underbilled_total, "previous": None if prev_run is None else prev_run.underbilled_total,
         "current_audit": None if cur_run is None else cur_run.run_code, "previous_audit": None if prev_run is None else prev_run.run_code,
         "previous_period": f"{ps}..{pe}",
         "top_cases": [{"code": c.exception_code, "category": CATEGORY_LABEL.get(c.category, c.category), "customer": names.get(c.customer_id),
                        "impact": c.financial_impact, "title": c.title} for c in top]}
    return ToolResult(s, rows, ["audit_runs", "exceptions"],
                      "Change = leakage-counting exception exposure this period minus the previous period, by category. "
                      "Headline values are each period's unique underbilling from its latest completed full audit.",
                      {"type": "table", "columns": [{"key": "label", "label": "Category"}, {"key": "previous", "label": "Previous", "format": "inr"},
                                                    {"key": "current", "label": "Current", "format": "inr"}, {"key": "change", "label": "Change", "format": "inr_sign"}]})


def top_underbilled_customers(db: Session, tid: int, a: LimitArgs) -> ToolResult:
    run = M.latest_audit(db, tid, a.period_start, a.period_end)
    if run is None:
        return ToolResult({"audit": None}, [], ["audit_runs"], "No completed audit covers this period.")
    R = ReconciliationResult
    gap = func.sum(func.greatest(R.expected_amount - R.invoiced_amount, 0))
    q = (select(R.customer_id, gap.label("underbilled"), func.count().filter(R.expected_amount > R.invoiced_amount).label("obligations"))
         .where(R.audit_run_id == run.id, R.obligation_id.is_not(None), R.status.in_(("UNDERBILLED", "MISSING_CHARGE", "PARTIALLY_MATCHED")))
         .group_by(R.customer_id).having(gap > 0).order_by(gap.desc()).limit(a.limit))
    names = _names(db, tid)
    rows = [{"customer_id": cid, "customer": names.get(cid), "underbilled": money(D(u)), "obligations": n} for cid, u, n in db.execute(q)]
    return ToolResult({"audit": run.run_code, "total_underbilled": run.underbilled_total, "shown": len(rows)}, rows,
                      ["reconciliation_results", "audit_runs", "customers"],
                      "Per customer: Σ max(0, expected − invoiced) over underbilled, missing-charge and partially matched obligations in the latest completed audit.",
                      {"type": "table", "columns": [{"key": "customer", "label": "Customer"}, {"key": "obligations", "label": "Obligations"},
                                                    {"key": "underbilled", "label": "Underbilled", "format": "inr"}]})


def margin_customers(db: Session, tid: int, a: MarginArgs) -> ToolResult:
    metric, rows = M.contribution(db, tid, a.period_start, a.period_end)
    names = _names(db, tid)
    pick = [r for r in rows if r["segment"] == a.segment]
    pick.sort(key=lambda r: r["contribution"])
    if a.segment == "PROFITABLE":
        pick.reverse()
    out = [{"customer_id": r["customer_id"], "customer": names.get(r["customer_id"]), "net_revenue": r["net_revenue"],
            "direct_cost": r["direct_cost"], "contribution": r["contribution"], "margin_pct": r["margin_pct"]} for r in pick[: a.limit]]
    return ToolResult({"segment": a.segment, "count": len(pick), "customers": len(rows), "portfolio_margin_pct": metric.value}, out,
                      metric.source, f"{metric.formula}. {metric.details.get('segment_rule', '')}",
                      {"type": "table", "columns": [{"key": "customer", "label": "Customer"}, {"key": "net_revenue", "label": "Revenue", "format": "inr"},
                                                    {"key": "direct_cost", "label": "Direct cost", "format": "inr"},
                                                    {"key": "contribution", "label": "Contribution", "format": "inr"}, {"key": "margin_pct", "label": "Margin", "format": "pct"}]})


def outstanding_invoices(db: Session, tid: int, a: OutstandingArgs) -> ToolResult:
    names = _names(db, tid)
    per = defaultdict(lambda: {"balance": Decimal("0"), "overdue": Decimal("0"), "invoices": 0, "oldest_due": None})
    for r in M._invoice_balances(db, tid, a.as_of):
        bal = money(D(r.total_amount) - D(r.credit) - D(r.paid))
        if bal <= 0:
            continue
        x = per[r.customer_id]
        x["balance"] += bal
        x["invoices"] += 1
        if r.due_date < a.as_of:
            x["overdue"] += bal
            x["oldest_due"] = min(x["oldest_due"] or r.due_date, r.due_date)
    rows = sorted(({"customer_id": k, "customer": names.get(k), "balance": money(v["balance"]), "overdue": money(v["overdue"]),
                    "invoices": v["invoices"], "days_overdue": (a.as_of - v["oldest_due"]).days if v["oldest_due"] else 0}
                   for k, v in per.items()), key=lambda r: -r["balance"])
    total = sum((r["balance"] for r in rows), Decimal("0"))
    overdue = sum((r["overdue"] for r in rows), Decimal("0"))
    return ToolResult({"as_of": a.as_of, "outstanding": money(total), "overdue": money(overdue), "customers": len(rows)}, rows[: a.limit],
                      ["invoices", "payment_allocations", "payments", "credit_adjustments"],
                      "Balance = issued invoice total − approved credits − allocated received payments, as of the date. Overdue = balance on invoices past due.",
                      {"type": "table", "columns": [{"key": "customer", "label": "Customer"}, {"key": "invoices", "label": "Open invoices"},
                                                    {"key": "balance", "label": "Balance", "format": "inr"}, {"key": "overdue", "label": "Overdue", "format": "inr"},
                                                    {"key": "days_overdue", "label": "Oldest overdue (days)"}]})


def customer_overview(db: Session, tid: int, a: CustomerArgs) -> ToolResult:
    c = db.get(Customer, a.customer_id)
    if c is None or c.tenant_id != tid:
        raise LookupError("customer not found")
    mrr = M.mrr(db, tid, a.period_end, [c.id])
    out = M.outstanding(db, tid, a.period_end, [c.id])
    _, rows = M.contribution(db, tid, a.period_start, a.period_end, [c.id])
    r = rows[0] if rows else {}
    cases = list(db.scalars(select(ExceptionCase).where(ExceptionCase.tenant_id == tid, ExceptionCase.customer_id == c.id,
                                                        ExceptionCase.status.in_(("OPEN", "IN_PROGRESS"))).order_by(ExceptionCase.financial_impact.desc())))
    s = {"customer": c.name, "code": c.customer_code, "segment": c.segment, "region": c.region, "mrr": mrr.value, "outstanding": out.value,
         "net_revenue": r.get("net_revenue"), "contribution": r.get("contribution"), "margin_pct": r.get("margin_pct"),
         "profitability": r.get("segment"), "open_exceptions": len(cases),
         "open_exposure": money(sum((D(x.financial_impact) for x in cases), Decimal("0")))}
    return ToolResult(s, [{"code": x.exception_code, "category": CATEGORY_LABEL.get(x.category, x.category), "title": x.title,
                           "impact": x.financial_impact, "status": x.status, "period": x.period_start} for x in cases[:10]],
                      ["customers", "subscriptions", "invoices", "product_costs", "exceptions"],
                      "Customer-level MRR, balance, contribution and open exceptions for the period.",
                      {"type": "table", "columns": [{"key": "code", "label": "Exception"}, {"key": "category", "label": "Type"},
                                                    {"key": "title", "label": "Description"}, {"key": "impact", "label": "Impact", "format": "inr"}]})


def exception_detail(db: Session, tid: int, a: ExceptionArgs) -> ToolResult:
    e = db.scalar(select(ExceptionCase).where(ExceptionCase.tenant_id == tid, ExceptionCase.exception_code == a.exception_code))
    if e is None:
        raise LookupError(f"{a.exception_code} not found")
    run = db.get(AuditRun, e.last_seen_audit_run_id or e.audit_run_id)
    s = {"code": e.exception_code, "category": CATEGORY_LABEL.get(e.category, e.category), "customer": _names(db, tid).get(e.customer_id),
         "title": e.title, "explanation": e.explanation, "impact": e.financial_impact, "status": e.status, "severity": e.severity,
         "period": e.period_start, "counts_toward_leakage": e.counts_toward_leakage, "last_seen_in": run.run_code if run else None,
         "calculation": e.calculation, "id": e.id}
    return ToolResult(s, [], ["exceptions", "exception_evidence", "audit_runs"], "Stored exception record and its calculation.", None)


def audit_status(db: Session, tid: int, a: PeriodArgs) -> ToolResult:
    run = M.latest_audit(db, tid, a.period_start, a.period_end)
    if run is None:
        return ToolResult({"audit": None}, [], ["audit_runs"], "No completed full-scope audit for this period.")
    s = {"audit": run.run_code, "status": run.status, "completed_at": run.completed_at, "expected": run.expected_total, "invoiced": run.invoiced_total,
         "underbilled": run.underbilled_total, "overbilled": run.overbilled_total, "reconciliation_rate": run.reconciliation_rate,
         "status_counts": (run.summary or {}).get("status_counts", {})}
    return ToolResult(s, [{"status": k, "obligations": v} for k, v in s["status_counts"].items()], ["audit_runs", "reconciliation_results"],
                      "Latest completed full-scope audit for the period.", {"type": "bar", "x": "status", "y": "obligations", "format": "num"})


@dataclass
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    fn: Callable[[Session, int, BaseModel], ToolResult]


TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool("kpi_snapshot", "Headline KPIs (MRR, leakage, outstanding, contribution margin) for a period, with previous-period MRR and leakage.", PeriodArgs, kpi_snapshot),
    Tool("leakage_by_category", "Exception exposure and counts by anomaly category for a period.", PeriodArgs, leakage_by_category),
    Tool("leakage_change", "Explain how revenue leakage changed versus the previous period: per-category change and the largest current cases.", PeriodArgs, leakage_change),
    Tool("top_underbilled_customers", "Customers with the largest underbilling in the latest audit for a period.", LimitArgs, top_underbilled_customers),
    Tool("margin_customers", "Customers in a contribution-margin segment (UNPROFITABLE = negative margin, AT_RISK = 0–15%, PROFITABLE ≥ 15%).", MarginArgs, margin_customers),
    Tool("outstanding_invoices", "Outstanding and overdue receivables by customer as of a date.", OutstandingArgs, outstanding_invoices),
    Tool("customer_overview", "One customer's MRR, balance, contribution margin and open exceptions.", CustomerArgs, customer_overview),
    Tool("exception_detail", "One exception case by code (e.g. EX-1029), including its stored calculation.", ExceptionArgs, exception_detail),
    Tool("audit_status", "The latest completed audit for a period: totals, reconciliation rate and status counts.", PeriodArgs, audit_status),
]}


def run_tool(db: Session, tenant_id: int, name: str, raw_args: dict) -> tuple[dict, ToolResult]:
    """Validate and execute one registered tool. Unknown tools and invalid arguments raise ValueError."""
    tool = TOOLS.get(name)
    if tool is None:
        raise ValueError(f"Unknown tool {name!r}")
    args = tool.args.model_validate(raw_args)
    return args.model_dump(mode="json"), tool.fn(db, tenant_id, args)
