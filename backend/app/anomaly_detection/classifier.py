"""STAGE 8 — eight explainable anomaly rules applied to a completed audit run.

Rules (deterministic, evaluated on billing-obligation / payment grain):

01 UNDERBILLING       expected > comparable invoiced, rates and discount as contracted
02 OVERBILLING        comparable invoiced > expected, rates and discount as contracted
03 MISSING_CHARGE     a non-usage obligation has no invoice charge at all
04 DUPLICATE_INVOICE  the same obligation is charged in full on more than one invoice
05 DISCOUNT_DRIFT     invoice discount % differs from the contractual discount %
06 PRICING_MISMATCH   invoice unit rate differs from the contractual rate
07 UNBILLED_USAGE     a usage obligation with billable usage has no invoice charge
08 PAYMENT_DISCREPANCY invalid / duplicated / unmatched / incorrectly allocated payments

No double counting: each billing obligation yields at most one exception (fingerprint =
obligation key), so a missing charge and the unbilled usage behind it can never both be
counted. ``exposure_key`` + ``counts_toward_leakage`` let leakage be summed uniquely.
No duplicates across runs: fingerprints are unique per tenant; a repeated audit updates the
existing case (``last_seen_audit_run_id``) instead of creating another.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.money import D, money
from backend.app.models import (
    AuditRun,
    BillingObligation,
    BillingObligationComponent,
    ContractVersion,
    ExceptionCase,
    ExceptionEvidence,
    ExceptionStatusHistory,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    PaymentReconciliationResult,
    PricingRule,
    ReconciliationResult,
    Subscription,
    Tenant,
    UsageEvent,
)
from backend.app.services.settings import get_setting

ISSUE_STATUSES = ("UNDERBILLED", "OVERBILLED", "MISSING_CHARGE", "PARTIALLY_MATCHED")
LEAKAGE_CATEGORIES = ("UNDERBILLING", "MISSING_CHARGE", "UNBILLED_USAGE", "DISCOUNT_DRIFT", "PRICING_MISMATCH")


def fmt_inr(v: Decimal | None) -> str:
    """Indian digit grouping (₹1,24,80,000) for human-readable titles."""
    if v is None:
        return "—"
    v = money(v)
    neg = v < 0
    whole, frac = f"{abs(v):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups) + "," + tail
    s = f"₹{whole}" + (f".{frac}" if frac != "00" else "")
    return f"-{s}" if neg else s


def _num(v) -> str:
    d = D(v).normalize()
    return f"{d:,f}" if d == d.to_integral_value() else f"{D(v):,.2f}"


@dataclass
class Candidate:
    category: str
    fingerprint: str
    exposure_key: str
    counts_toward_leakage: bool
    impact: Decimal
    customer_id: int | None
    title: str
    explanation: str
    period_start: date | None = None
    period_end: date | None = None
    contract_id: int | None = None
    subscription_id: int | None = None
    obligation_id: int | None = None
    invoice_id: int | None = None
    payment_id: int | None = None
    calculation: dict = field(default_factory=dict)
    evidence: list[dict] = field(default_factory=list)


def _fp(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()[:40]


def severity_for(impact: Decimal, thresholds: dict) -> str:
    for level in ("CRITICAL", "HIGH", "MEDIUM"):
        if abs(impact) >= D(thresholds[level]):
            return level
    return "LOW"


# ----------------------------------------------------------------------------- billing rules
def classify_billing(r: ReconciliationResult) -> tuple[str, str]:
    """Return (category, title) for one non-matched obligation result."""
    exp_d, inv_d = r.expected_discount_pct, r.invoiced_discount_pct
    exp_p, inv_p = r.expected_unit_price, r.invoiced_unit_price
    if r.status == "MISSING_CHARGE":
        if r.charge_type == "USAGE":
            qty = r.expected_quantity
            return "UNBILLED_USAGE", (f"{_num(qty)} billable units of usage not invoiced" if qty else "Billable usage not invoiced")
        return "MISSING_CHARGE", f"Expected {fmt_inr(r.expected_amount)} {r.charge_type.lower()} charge not invoiced"
    if exp_d is not None and inv_d is not None and D(exp_d) != D(inv_d):
        return "DISCOUNT_DRIFT", f"{_num(inv_d)}% discount applied vs {_num(exp_d)}% in contract"
    if exp_p is not None and inv_p is not None and D(exp_p) != D(inv_p):
        return "PRICING_MISMATCH", f"Invoiced at {fmt_inr(inv_p)}/unit vs contract {fmt_inr(exp_p)}/unit"
    if r.variance < 0:
        return "UNDERBILLING", f"Billed {fmt_inr(r.invoiced_amount)} vs expected {fmt_inr(r.expected_amount)}"
    return "OVERBILLING", f"Billed {fmt_inr(r.invoiced_amount)} vs expected {fmt_inr(r.expected_amount)}"


def _billing_evidence(db: Session, run: AuditRun, r: ReconciliationResult, ob: BillingObligation) -> list[dict]:
    ev: list[dict] = []
    comps = db.scalars(select(BillingObligationComponent).where(
        BillingObligationComponent.audit_run_id == run.id, BillingObligationComponent.obligation_id == ob.id
    ).order_by(BillingObligationComponent.seq)).all()
    for c in comps:
        ev.append({"evidence_type": "CALCULATION", "record_table": "billing_obligation_components", "record_id": str(c.id),
                   "summary": f"{c.component_type}: {c.formula} = {fmt_inr(c.amount)}",
                   "snapshot": {"type": c.component_type, "formula": c.formula, "amount": str(c.amount),
                                "segment": f"{c.segment_start}..{c.segment_end}", "inputs": c.inputs}})
    for vid in sorted({c.contract_version_id for c in comps if c.contract_version_id}):
        v = db.get(ContractVersion, vid)
        ev.append({"evidence_type": "CONTRACT_VERSION", "record_table": "contract_versions", "record_id": str(v.id),
                   "summary": f"Contract version v{v.version_number} effective {v.effective_from}..{v.effective_to or 'open'}",
                   "snapshot": {"version": v.version_number, "effective_from": str(v.effective_from),
                                "effective_to": str(v.effective_to) if v.effective_to else None, "reason": v.change_reason}})
    for rid in sorted({c.pricing_rule_id for c in comps if c.pricing_rule_id}):
        p = db.get(PricingRule, rid)
        ev.append({"evidence_type": "PRICING_RULE", "record_table": "pricing_rules", "record_id": str(p.id),
                   "summary": f"{p.rule_key} v{p.rule_version}: {p.pricing_model} {fmt_inr(p.unit_price)}"
                              f"{f', {_num(p.discount_pct)}% discount' if p.discount_pct else ''}",
                   "snapshot": {"rule_key": p.rule_key, "rule_version": p.rule_version, "model": p.pricing_model,
                                "unit_price": str(p.unit_price), "included_units": str(p.included_units),
                                "discount_pct": str(p.discount_pct), "tiers": p.tiers}})
    for ln, num in db.execute(select(InvoiceLine, Invoice.invoice_number).join(Invoice).where(InvoiceLine.id.in_(r.matched_line_ids or [0]))):
        ev.append({"evidence_type": "INVOICE_LINE", "record_table": "invoice_lines", "record_id": str(ln.id),
                   "summary": f"{num} line {ln.line_number}: {_num(ln.quantity)} × {fmt_inr(ln.unit_price)}"
                              f"{f' − {_num(ln.discount_pct)}%' if ln.discount_pct else ''} = {fmt_inr(ln.line_amount)}",
                   "snapshot": {"invoice_number": num, "line": ln.line_number, "quantity": str(ln.quantity),
                                "unit_price": str(ln.unit_price), "discount_pct": str(ln.discount_pct),
                                "line_amount": str(ln.line_amount), "period": f"{ln.period_start}..{ln.period_end}",
                                "source_batch_id": ln.source_batch_id, "source_row_number": ln.source_row_number}})
    if ob.charge_type == "USAGE":
        tz = ZoneInfo(db.get(Tenant, run.tenant_id).timezone)
        lo = datetime.combine(ob.period_start, time.min, tz)
        hi = datetime.combine(ob.period_end + timedelta(days=1), time.min, tz)
        n, q, first, last = db.execute(select(func.count(UsageEvent.id), func.coalesce(func.sum(UsageEvent.quantity), 0),
                                              func.min(UsageEvent.event_id), func.max(UsageEvent.event_id))
                                       .where(UsageEvent.subscription_id == ob.subscription_id,
                                              UsageEvent.occurred_at >= lo, UsageEvent.occurred_at < hi)).one()
        ev.append({"evidence_type": "USAGE_SUMMARY", "record_table": "usage_events", "record_id": f"subscription:{ob.subscription_id}",
                   "summary": f"{n} usage events totalling {_num(q)} units in {ob.period_start:%b %Y}",
                   "snapshot": {"events": n, "quantity": str(q), "first_event": first, "last_event": last}})
    return ev


# ----------------------------------------------------------------------------- detection
def detect(db: Session, run: AuditRun) -> list[Candidate]:
    out: list[Candidate] = []
    rows = db.execute(select(ReconciliationResult, BillingObligation, Subscription.contract_id)
                      .join(BillingObligation, BillingObligation.id == ReconciliationResult.obligation_id)
                      .join(Subscription, Subscription.id == BillingObligation.subscription_id)
                      .where(ReconciliationResult.audit_run_id == run.id, ReconciliationResult.status.in_(ISSUE_STATUSES))).all()

    duplicate_groups: dict[tuple, list] = defaultdict(list)
    for r, ob, contract_id in rows:
        if r.details.get("duplicate_candidate"):
            duplicate_groups[(r.customer_id, tuple(sorted(r.details.get("invoice_numbers", []))))].append((r, ob, contract_id))
            continue
        category, title = classify_billing(r)
        impact = money(abs(r.variance))
        out.append(Candidate(
            category=category, fingerprint=_fp(f"OBL|{ob.obligation_key}"), exposure_key=ob.obligation_key,
            counts_toward_leakage=r.variance < 0, impact=impact, customer_id=r.customer_id, title=title,
            explanation=r.explanation, period_start=ob.period_start, period_end=ob.period_end, contract_id=contract_id,
            subscription_id=ob.subscription_id, obligation_id=ob.id,
            calculation={"expected": str(r.expected_amount), "invoiced": str(r.invoiced_amount), "variance": str(r.variance),
                         "expected_quantity": str(r.expected_quantity) if r.expected_quantity is not None else None,
                         "invoiced_quantity": str(r.invoiced_quantity) if r.invoiced_quantity is not None else None,
                         "expected_unit_price": str(r.expected_unit_price) if r.expected_unit_price is not None else None,
                         "invoiced_unit_price": str(r.invoiced_unit_price) if r.invoiced_unit_price is not None else None,
                         "expected_discount_pct": str(r.expected_discount_pct) if r.expected_discount_pct is not None else None,
                         "invoiced_discount_pct": str(r.invoiced_discount_pct) if r.invoiced_discount_pct is not None else None,
                         "rule": category, "obligation_key": ob.obligation_key, "reconciliation_result_id": r.id},
            evidence=_billing_evidence(db, run, r, ob),
        ))

    for (customer_id, invoices), items in duplicate_groups.items():
        over = money(sum((max(Decimal("0"), r.variance) for r, _, _ in items), Decimal("0")))
        first_ob = items[0][1]
        dup_invoices = list(invoices[1:]) if len(invoices) > 1 else list(invoices)
        inv_id = db.scalar(select(Invoice.id).where(Invoice.tenant_id == run.tenant_id, Invoice.invoice_number == dup_invoices[-1]))
        ev = []
        for r, ob, _ in items:
            ev.extend(_billing_evidence(db, run, r, ob))
        out.append(Candidate(
            category="DUPLICATE_INVOICE", fingerprint=_fp(f"DUP|{customer_id}|{'|'.join(invoices)}"),
            exposure_key=f"DUP|{'|'.join(invoices)}", counts_toward_leakage=False, impact=over, customer_id=customer_id,
            title=f"{len(items)} charge(s) billed again on {', '.join(dup_invoices)}",
            explanation=f"The same billing obligations were charged in full on invoices {', '.join(invoices)}; "
                        f"{fmt_inr(over)} has been billed twice.",
            period_start=first_ob.period_start, period_end=first_ob.period_end, contract_id=items[0][2], invoice_id=inv_id,
            calculation={"invoices": list(invoices), "obligations": [ob.obligation_key for _, ob, _ in items],
                         "duplicated_amount": str(over), "rule": "DUPLICATE_INVOICE"},
            evidence=ev,
        ))

    # ---- payments
    pay_rows = db.execute(select(PaymentReconciliationResult, Payment).join(Payment, Payment.id == PaymentReconciliationResult.payment_id)
                          .where(PaymentReconciliationResult.audit_run_id == run.id,
                                 PaymentReconciliationResult.status == "DISCREPANCY")).all()
    flagged_payments = set()
    for pr, p in pay_rows:
        flagged_payments.add(p.id)
        issues = pr.details.get("issues", [])
        code = pr.issue_code
        if code == "UNALLOCATED_CASH":
            impact = pr.unallocated_amount
        elif code == "PAYMENT_OVER_ALLOCATED":
            impact = -pr.unallocated_amount
        elif code == "CROSS_CUSTOMER_ALLOCATION":
            impact = pr.payments_allocated
        else:
            impact = pr.payment_amount
        allocs = db.scalars(select(PaymentAllocation).where(PaymentAllocation.payment_id == p.id, PaymentAllocation.reversed_at.is_(None))).all()
        ev = [{"evidence_type": "PAYMENT", "record_table": "payments", "record_id": str(p.id),
               "summary": f"{p.payment_number}: {fmt_inr(p.amount)} received {p.received_on} ref {p.transaction_reference or '—'} "
                          f"({p.verification_status.lower()})",
               "snapshot": {"payment_number": p.payment_number, "amount": str(p.amount), "received_on": str(p.received_on),
                            "transaction_reference": p.transaction_reference, "remittance": p.remittance_invoice_ref,
                            "verification_status": p.verification_status, "source": p.source}}]
        for a in allocs:
            inv = db.get(Invoice, a.invoice_id)
            ev.append({"evidence_type": "PAYMENT_ALLOCATION", "record_table": "payment_allocations", "record_id": str(a.id),
                       "summary": f"{fmt_inr(a.amount)} allocated to {inv.invoice_number} on {a.allocated_on}",
                       "snapshot": {"invoice_number": inv.invoice_number, "invoice_customer_id": inv.customer_id,
                                    "amount": str(a.amount), "allocated_on": str(a.allocated_on)}})
        out.append(Candidate(
            category="PAYMENT_DISCREPANCY", fingerprint=_fp(f"PAY|{p.payment_number}"), exposure_key=f"PAY|{p.payment_number}",
            counts_toward_leakage=False, impact=money(abs(impact or 0)), customer_id=p.customer_id,
            title={"UNALLOCATED_CASH": "Payment received but not allocated", "DUPLICATE_TRANSACTION_REFERENCE": "Duplicate payment entry",
                   "CROSS_CUSTOMER_ALLOCATION": "Payment allocated to another customer's invoice",
                   "INVALID_INVOICE_REFERENCE": "Remittance references an unknown invoice",
                   "PAYMENT_OVER_ALLOCATED": "Allocations exceed payment amount",
                   "UNIDENTIFIED_PAYER": "Payment from unidentified payer",
                   "INVALID_ALLOCATION_TARGET": "Allocated to a void or draft invoice"}.get(code, "Payment discrepancy"),
            explanation=pr.explanation, period_start=run.period_start, period_end=run.period_end, payment_id=p.id,
            calculation={"issue_code": code, "issues": issues, "payment_amount": str(pr.payment_amount),
                         "allocated": str(pr.payments_allocated), "unallocated": str(pr.unallocated_amount), "rule": "PAYMENT_DISCREPANCY"},
            evidence=ev,
        ))
    # Over-applied invoices whose cause is not already a flagged payment
    for pr, inv in db.execute(select(PaymentReconciliationResult, Invoice).join(Invoice, Invoice.id == PaymentReconciliationResult.invoice_id)
                              .where(PaymentReconciliationResult.audit_run_id == run.id,
                                     PaymentReconciliationResult.status == "OVER_APPLIED")).all():
        pids = set(db.scalars(select(PaymentAllocation.payment_id).where(PaymentAllocation.invoice_id == inv.id)))
        if pids & flagged_payments or _has_duplicate_payment(db, pids):
            continue  # the cause is a payment-level discrepancy (flagged in the payment's own audit window)
        out.append(Candidate(
            category="PAYMENT_DISCREPANCY", fingerprint=_fp(f"INVPAY|{inv.invoice_number}"), exposure_key=f"INVPAY|{inv.invoice_number}",
            counts_toward_leakage=False, impact=money(abs(pr.outstanding)), customer_id=inv.customer_id,
            title=f"Invoice {inv.invoice_number} over-applied by {fmt_inr(abs(pr.outstanding))}", explanation=pr.explanation,
            period_start=run.period_start, period_end=run.period_end, invoice_id=inv.id,
            calculation={"invoice_total": str(pr.invoice_total), "credits": str(pr.credits_applied),
                         "allocated": str(pr.payments_allocated), "outstanding": str(pr.outstanding), "rule": "PAYMENT_DISCREPANCY"},
            evidence=[{"evidence_type": "INVOICE", "record_table": "invoices", "record_id": str(inv.id),
                       "summary": f"{inv.invoice_number} total {fmt_inr(inv.total_amount)}", "snapshot": {"total": str(inv.total_amount)}}],
        ))
    return out


def _has_duplicate_payment(db: Session, payment_ids: set[int]) -> bool:
    for p in db.scalars(select(Payment).where(Payment.id.in_(payment_ids or {0}))):
        if p.transaction_reference and db.scalar(select(func.count(Payment.id)).where(
                Payment.tenant_id == p.tenant_id, Payment.id != p.id, Payment.status == "RECEIVED",
                Payment.customer_id == p.customer_id, Payment.transaction_reference == p.transaction_reference,
                Payment.amount == p.amount)):
            return True
    return False


def persist_exceptions(db: Session, run: AuditRun) -> dict:
    """Create or refresh exception cases for a completed run. Idempotent."""
    thresholds = get_setting(db, run.tenant_id, "revenue_rules")["severity_thresholds"]
    candidates = detect(db, run)
    existing = {e.fingerprint: e for e in db.scalars(select(ExceptionCase).where(
        ExceptionCase.tenant_id == run.tenant_id, ExceptionCase.fingerprint.in_([c.fingerprint for c in candidates] or [""])))}
    seq = db.scalar(select(func.count(ExceptionCase.id)).where(ExceptionCase.tenant_id == run.tenant_id)) or 0
    created = refreshed = reopened = 0
    for c in candidates:
        sev = severity_for(c.impact, thresholds)
        e = existing.get(c.fingerprint)
        if e is None:
            seq += 1
            e = ExceptionCase(tenant_id=run.tenant_id, exception_code=f"EX-{1000 + seq}", fingerprint=c.fingerprint,
                              audit_run_id=run.id, status="OPEN")
            db.add(e)
            created += 1
            new = True
        else:
            refreshed += 1
            new = False
            if e.status in ("RESOLVED", "DISMISSED"):
                db.add(ExceptionStatusHistory(tenant_id=run.tenant_id, exception_id=e.id, from_status=e.status,
                                              to_status="OPEN", reason=f"Re-detected by audit {run.run_code}"))
                e.status, e.resolved_at = "OPEN", None
                reopened += 1
        e.last_seen_audit_run_id = run.id
        for attr in ("category", "exposure_key", "counts_toward_leakage", "customer_id", "contract_id", "subscription_id",
                     "obligation_id", "invoice_id", "payment_id", "period_start", "period_end", "title", "explanation", "calculation"):
            setattr(e, attr, getattr(c, attr))
        e.financial_impact, e.severity = c.impact, sev
        db.flush()
        if new:
            db.add(ExceptionStatusHistory(tenant_id=run.tenant_id, exception_id=e.id, from_status="", to_status="OPEN",
                                          reason=f"Detected by audit {run.run_code}"))
            for ev in c.evidence:
                db.add(ExceptionEvidence(tenant_id=run.tenant_id, exception_id=e.id, **ev))
    return {"candidates": len(candidates), "created": created, "refreshed": refreshed, "reopened": reopened}
