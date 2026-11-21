"""Systemic root-cause analysis — groups exceptions that *may* share an underlying cause.

Grouping keys (each needs ≥ 2 exceptions to form a cluster):
* PRICING_RULE      — the same pricing-rule key/version was used for every affected obligation
* PRICING_CONFIG    — same product + same contractual unit price + same anomaly category
* PRODUCT_CATEGORY  — same product and anomaly category within the period
* USAGE_BATCH       — usage exceptions whose month had a usage-integrity issue
* INVOICE_RUN       — same anomaly category on invoices issued the same day
* PAYMENT_SOURCE    — payment discrepancies of the same issue code

Every cluster is reported as a POTENTIAL shared cause with its rationale; it becomes CONFIRMED
only when a person confirms it. Blast radius sums each exposure key once (no double counting).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.money import D, money
from backend.app.models import (
    BillingObligationComponent,
    ExceptionCase,
    ExceptionEvidence,
    Invoice,
    InvoiceLine,
    PricingRule,
    Product,
    RootCauseInvestigation,
)

LABELS = {
    "PRICING_RULE": "Same pricing rule version", "PRICING_CONFIG": "Same contractual rate & anomaly",
    "PRODUCT_CATEGORY": "Same product & anomaly type", "USAGE_BATCH": "Usage delivery issue in the same month",
    "INVOICE_RUN": "Same invoice run", "PAYMENT_SOURCE": "Same payment-processing issue",
}


def analyse(db: Session, tenant_id: int, period_start: date, period_end: date, min_size: int = 2) -> list[dict]:
    cases = list(db.scalars(select(ExceptionCase).where(ExceptionCase.tenant_id == tenant_id, ExceptionCase.period_start >= period_start,
                                                        ExceptionCase.period_start <= period_end,
                                                        ExceptionCase.status.in_(("OPEN", "IN_PROGRESS", "RESOLVED")))))
    products = dict(db.execute(select(Product.id, Product.name)).all())
    groups: dict[tuple, list[ExceptionCase]] = defaultdict(list)
    for e in cases:
        if e.category == "PAYMENT_DISCREPANCY":
            groups[("PAYMENT_SOURCE", e.calculation.get("issue_code", "OTHER"))].append(e)
            continue
        rules = [ev.snapshot for ev in db.scalars(select(ExceptionEvidence).where(ExceptionEvidence.exception_id == e.id,
                                                                                   ExceptionEvidence.evidence_type == "PRICING_RULE"))]
        for r in rules:
            groups[("PRICING_RULE", f"{r.get('rule_key')}@v{r.get('rule_version')}")].append(e)
        product_id = None
        if e.obligation_id:
            comp = db.scalar(select(BillingObligationComponent).where(BillingObligationComponent.obligation_id == e.obligation_id)
                             .order_by(BillingObligationComponent.id.desc()).limit(1))
            if comp and comp.pricing_rule_id:
                rule = db.get(PricingRule, comp.pricing_rule_id)
                product_id = rule.product_id
                groups[("PRICING_CONFIG", f"{products.get(rule.product_id)} @ {rule.unit_price} · {e.category}")].append(e)
            groups[("PRODUCT_CATEGORY", f"{products.get(product_id, '?')} · {e.category}")].append(e)
        if e.category in ("UNBILLED_USAGE",) or (e.calculation.get("expected_quantity") and e.category == "UNDERBILLING"):
            groups[("USAGE_BATCH", f"{e.period_start:%Y-%m}")].append(e)
        inv_ids = {e.invoice_id} if e.invoice_id else set()
        for ev in db.scalars(select(ExceptionEvidence).where(ExceptionEvidence.exception_id == e.id, ExceptionEvidence.evidence_type == "INVOICE_LINE")):
            ln = db.get(InvoiceLine, int(ev.record_id))
            if ln:
                inv_ids.add(ln.invoice_id)
        for iid in inv_ids:
            inv = db.get(Invoice, iid)
            if inv:
                groups[("INVOICE_RUN", f"{inv.issue_date} · {e.category}")].append(e)
    clusters = []
    for (ctype, ref), members in groups.items():
        uniq = {m.id: m for m in members}
        if len(uniq) < min_size:
            continue
        members = list(uniq.values())
        exposure = {}
        for m in members:  # each exposure key once
            exposure[m.exposure_key] = max(exposure.get(m.exposure_key, Decimal("0")), D(m.financial_impact))
        leakage = money(sum((D(m.financial_impact) for m in members if m.counts_toward_leakage), Decimal("0")))
        clusters.append({
            "cause_type": ctype, "cause_label": LABELS[ctype], "cause_reference": ref, "confidence": "POTENTIAL",
            "exception_ids": sorted(uniq), "exception_codes": sorted(m.exception_code for m in members),
            "categories": sorted({m.category for m in members}),
            "unique_exposure": money(sum(exposure.values(), Decimal("0"))), "leakage_exposure": leakage,
            "blast_radius": {"exceptions": len(members), "customers": len({m.customer_id for m in members if m.customer_id}),
                             "subscriptions": len({m.subscription_id for m in members if m.subscription_id}),
                             "invoices": len({m.invoice_id for m in members if m.invoice_id}),
                             "periods": sorted({m.period_start.isoformat() for m in members if m.period_start})},
            "rationale": f"{len(members)} exceptions share: {LABELS[ctype].lower()} ({ref}). This indicates a possible common "
                         f"source; it is not proof of causation until confirmed by an investigator.",
        })
    # broader, more specific causes first
    order = {"PRICING_RULE": 0, "PRICING_CONFIG": 1, "USAGE_BATCH": 2, "INVOICE_RUN": 3, "PAYMENT_SOURCE": 4, "PRODUCT_CATEGORY": 5}
    clusters.sort(key=lambda c: (order[c["cause_type"]], -c["blast_radius"]["customers"], -c["unique_exposure"]))
    return clusters


def persist(db: Session, tenant_id: int, audit_run_id: str, clusters: list[dict]) -> None:
    db.query(RootCauseInvestigation).filter(RootCauseInvestigation.audit_run_id == audit_run_id,
                                            RootCauseInvestigation.confidence == "POTENTIAL").delete()
    for c in clusters:
        db.add(RootCauseInvestigation(tenant_id=tenant_id, audit_run_id=audit_run_id, cause_type=c["cause_type"],
                                      cause_reference=c["cause_reference"][:80], confidence="POTENTIAL", exception_ids=c["exception_ids"],
                                      unique_exposure=c["unique_exposure"], blast_radius=c["blast_radius"], rationale=c["rationale"]))
