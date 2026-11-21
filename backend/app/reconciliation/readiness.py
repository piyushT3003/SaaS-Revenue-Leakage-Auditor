"""STAGE 4 — data readiness. Explains what is missing before (and inside) an audit so an
incomplete scope never looks like a complete one."""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models import Customer, ImportBatch, Invoice, UsageBatch, UsageEvent
from backend.app.reconciliation.obligations import BuildResult, build_expected_obligations
from backend.app.replay.asof import issued_invoice_clause

EXCLUSION_TITLES = {
    "VERSION_GAP": "Contract version does not cover the billing period",
    "MISSING_PRICING_RULE": "Pricing rule missing for a subscribed product",
    "AMBIGUOUS_PRICING_RULE": "Conflicting pricing rules",
    "MISSING_TIERS": "Tiered pricing rule without tiers",
    "NO_USAGE_SIGNAL": "No usage data received",
    "CURRENCY_UNSUPPORTED": "Contract currency not supported",
    "BAD_FREQUENCY": "Unsupported billing frequency",
}


def _names(db: Session, ids: set[int], limit: int = 8) -> list[dict]:
    if not ids:
        return []
    rows = db.execute(select(Customer.id, Customer.customer_code, Customer.name).where(Customer.id.in_(list(ids)[:limit])))
    return [{"id": r.id, "code": r.customer_code, "name": r.name} for r in rows]


def assess_readiness(db: Session, tenant_id: int, window_start: date, window_end: date,
                     customer_ids: list[int] | None = None, product_ids: list[int] | None = None,
                     build: BuildResult | None = None) -> dict:
    build = build or build_expected_obligations(db, tenant_id, window_start, window_end, customer_ids, product_ids)
    checks: list[dict] = []
    obligations = build.obligations
    scope_customers = {o.customer_id for o in obligations}

    # 1. reference data: customers / contracts / subscriptions present
    checks.append({
        "code": "SUBSCRIPTIONS_IN_SCOPE", "severity": "OK" if build.subscriptions_considered else "ERROR",
        "title": "Subscriptions in scope",
        "message": f"{build.subscriptions_considered} subscriptions across {len(scope_customers)} customers produce billing obligations"
        if build.subscriptions_considered else "No billable subscriptions found for this period and scope",
        "count": build.subscriptions_considered,
    })

    # 2. calculation gaps (contract versions, pricing rules, usage signal, currency)
    by_code: dict[str, list] = defaultdict(list)
    for o in obligations:
        if o.excluded:
            by_code[o.exclusion_code].append(o)
    for code, obs in sorted(by_code.items()):
        custs = {o.customer_id for o in obs}
        checks.append({
            "code": code, "severity": "WARNING", "title": EXCLUSION_TITLES.get(code, code),
            "message": f"{len(obs)} obligation(s) for {len(custs)} customer(s) will be excluded with a reason. Example: {obs[0].exclusion_reason}",
            "count": len(obs), "affected_customers": _names(db, custs),
        })
    if not by_code:
        checks.append({"code": "TERMS_COMPLETE", "severity": "OK", "title": "Contract terms and pricing",
                       "message": "Every obligation could be calculated from an effective contract version and pricing rule", "count": 0})

    # 3. invoices for the period
    inv_q = select(func.count(Invoice.id)).where(Invoice.tenant_id == tenant_id, issued_invoice_clause(Invoice),
                                                 Invoice.issue_date >= window_start, Invoice.issue_date <= window_end)
    if customer_ids:
        inv_q = inv_q.where(Invoice.customer_id.in_(customer_ids))
    inv_count = db.scalar(inv_q) or 0
    checks.append({
        "code": "INVOICES_PRESENT", "severity": "OK" if inv_count else "ERROR", "title": "Invoices for the period",
        "message": f"{inv_count} issued invoices found" if inv_count else
        "No issued invoices exist for this period — every obligation would appear unbilled. Import invoices first.",
        "count": inv_count,
    })

    # 4. usage completeness signal and control totals
    uncovered = [m for m, s in build.usage_signal.items() if not s["covered"]]
    failed = sorted({b for s in build.usage_signal.values() for b in s["failed"]})
    if uncovered or failed:
        checks.append({"code": "USAGE_BATCHES", "severity": "WARNING", "title": "Usage delivery completeness",
                       "message": ("Months without any usage batch: " + ", ".join(uncovered) + ". " if uncovered else "")
                       + ("Failed batches excluded from billing: " + ", ".join(failed) if failed else ""),
                       "count": len(uncovered) + len(failed)})
    else:
        checks.append({"code": "USAGE_BATCHES", "severity": "OK", "title": "Usage delivery completeness",
                       "message": "Every month in the period has at least one processed usage batch", "count": 0})
    actual = (select(UsageEvent.usage_batch_id, func.count(UsageEvent.id).label("n"))
              .where(UsageEvent.tenant_id == tenant_id).group_by(UsageEvent.usage_batch_id).subquery())
    mismatches = db.execute(
        select(UsageBatch.batch_code, UsageBatch.control_event_count, func.coalesce(actual.c.n, 0))
        .outerjoin(actual, actual.c.usage_batch_id == UsageBatch.id)
        .where(UsageBatch.tenant_id == tenant_id, UsageBatch.period_start <= window_end, UsageBatch.period_end >= window_start,
               UsageBatch.control_event_count.is_not(None), UsageBatch.control_event_count != func.coalesce(actual.c.n, 0))
    ).all()
    if mismatches:
        checks.append({"code": "USAGE_CONTROL_TOTALS", "severity": "WARNING", "title": "Usage control totals",
                       "message": "; ".join(f"{c}: source reported {exp} events, {got} ingested" for c, exp, got in mismatches[:5]),
                       "count": len(mismatches)})

    # 5. unconfirmed imports that might change the result
    pending = db.scalar(select(func.count(ImportBatch.id)).where(ImportBatch.tenant_id == tenant_id, ImportBatch.status == "VALIDATED")) or 0
    if pending:
        checks.append({"code": "PENDING_IMPORTS", "severity": "INFO", "title": "Validated imports awaiting confirmation",
                       "message": f"{pending} validated import batch(es) have not been confirmed and are not part of this audit",
                       "count": pending})

    severities = {c["severity"] for c in checks}
    status = "INCOMPLETE" if "ERROR" in severities else "READY_WITH_WARNINGS" if "WARNING" in severities else "READY"
    excluded = sum(1 for o in obligations if o.excluded)
    return {
        "status": status,
        "period_start": window_start.isoformat(),
        "period_end": window_end.isoformat(),
        "obligations": len(obligations),
        "excluded_obligations": excluded,
        "customers_in_scope": len(scope_customers),
        "customers_with_exclusions": len({o.customer_id for o in obligations if o.excluded}),
        "checks": checks,
    }
