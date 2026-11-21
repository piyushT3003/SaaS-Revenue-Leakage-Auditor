"""STAGE 7 — payment reconciliation, independent of billing reconciliation.

Outstanding balance (as of a date) = valid invoice total
                                    − approved credit notes / write-offs applied to it
                                    + approved debit adjustments applied to it
                                    − payment allocations made on or before the date.

Overdue balances are *not* discrepancies; they are reported through the ageing bucket.
Discrepancies are limited to: over-allocation, unallocated / unidentified cash, duplicate
transaction references, invalid remittance references, allocations to another customer's
invoice and allocations to void/draft invoices.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.money import D, money
from backend.app.models import CreditAdjustment, Invoice, Payment, PaymentAllocation
from backend.app.replay.asof import active_allocation_clause, current_cutoff, issued_invoice_clause


def is_issued(inv: Invoice) -> bool:
    ts = current_cutoff()
    return inv.status == "ISSUED" or (ts is not None and inv.status == "VOID" and inv.voided_at is not None and inv.voided_at > ts)

AGEING_BUCKETS = ("CURRENT", "1-30", "31-60", "61-90", "90+")


def ageing_bucket(due_date: date, as_of: date) -> tuple[str, int]:
    days = (as_of - due_date).days
    if days <= 0:
        return "CURRENT", max(days, 0)
    if days <= 30:
        return "1-30", days
    if days <= 60:
        return "31-60", days
    if days <= 90:
        return "61-90", days
    return "90+", days


def invoice_outstanding(total: Decimal, credits: Decimal, debits: Decimal, allocated: Decimal) -> Decimal:
    return money(D(total) - D(credits) + D(debits) - D(allocated))


@dataclass
class PaymentRecon:
    record_type: str
    status: str
    issue_code: str = ""
    invoice_id: int | None = None
    payment_id: int | None = None
    customer_id: int | None = None
    invoice_total: Decimal | None = None
    credits_applied: Decimal | None = None
    payments_allocated: Decimal | None = None
    outstanding: Decimal | None = None
    payment_amount: Decimal | None = None
    unallocated_amount: Decimal | None = None
    days_past_due: int | None = None
    ageing_bucket: str = ""
    explanation: str = ""
    details: dict = field(default_factory=dict)


def reconcile_payments(db: Session, tenant_id: int, window_start: date, window_end: date, as_of: date,
                       customer_ids: set[int] | None = None) -> list[PaymentRecon]:
    out: list[PaymentRecon] = []

    # ---------------------------------------------------------------- invoices (cohort issued in window)
    iq = select(Invoice).where(Invoice.tenant_id == tenant_id, issued_invoice_clause(Invoice),
                               Invoice.issue_date >= window_start, Invoice.issue_date <= window_end)
    if customer_ids:
        iq = iq.where(Invoice.customer_id.in_(customer_ids))
    invoices = list(db.scalars(iq))
    inv_ids = [i.id for i in invoices]
    alloc_by_inv: dict[int, list[PaymentAllocation]] = defaultdict(list)
    credits_by_inv: dict[int, list[CreditAdjustment]] = defaultdict(list)
    if inv_ids:
        for a in db.scalars(select(PaymentAllocation).join(Payment).where(
                PaymentAllocation.invoice_id.in_(inv_ids), PaymentAllocation.allocated_on <= as_of, Payment.status == "RECEIVED",
                active_allocation_clause(PaymentAllocation))):
            alloc_by_inv[a.invoice_id].append(a)
        for c in db.scalars(select(CreditAdjustment).where(
                CreditAdjustment.invoice_id.in_(inv_ids), CreditAdjustment.status == "APPROVED",
                CreditAdjustment.effective_date <= as_of)):
            credits_by_inv[c.invoice_id].append(c)

    for inv in invoices:
        credits = sum((D(c.amount) for c in credits_by_inv[inv.id] if c.adjustment_type in ("CREDIT_NOTE", "WRITE_OFF")), Decimal("0"))
        debits = sum((D(c.amount) for c in credits_by_inv[inv.id] if c.adjustment_type == "DEBIT_ADJUSTMENT"), Decimal("0"))
        allocated = sum((D(a.amount) for a in alloc_by_inv[inv.id]), Decimal("0"))
        outstanding = invoice_outstanding(inv.total_amount, credits, debits, allocated)
        bucket, dpd = ageing_bucket(inv.due_date, as_of)
        rec = PaymentRecon(
            record_type="INVOICE", status="", invoice_id=inv.id, customer_id=inv.customer_id,
            invoice_total=money(inv.total_amount), credits_applied=money(credits - debits), payments_allocated=money(allocated),
            outstanding=outstanding, details={"invoice_number": inv.invoice_number, "due_date": inv.due_date.isoformat(),
                                              "allocation_ids": [a.id for a in alloc_by_inv[inv.id]],
                                              "credit_ids": [c.id for c in credits_by_inv[inv.id]]},
        )
        if outstanding < 0:
            rec.status, rec.issue_code = "OVER_APPLIED", "INVOICE_OVER_ALLOCATED"
            rec.explanation = (f"Payments {money(allocated)} and credits {money(credits)} exceed the invoice total "
                               f"{money(inv.total_amount)} by {-outstanding}")
        elif outstanding == 0:
            rec.status = "PAID" if allocated > 0 else "CREDITED"
            rec.explanation = "Fully settled" if allocated > 0 else "Settled by credit"
        else:
            rec.status = "PARTIALLY_PAID" if allocated > 0 or credits > 0 else "UNPAID"
            rec.days_past_due, rec.ageing_bucket = dpd, bucket
            rec.explanation = f"Outstanding {outstanding} ({bucket}{' days past due' if bucket != 'CURRENT' else ''})"
        out.append(rec)

    # ---------------------------------------------------------------- payments received in window
    pq = select(Payment).where(Payment.tenant_id == tenant_id, Payment.status == "RECEIVED",
                               Payment.received_on >= window_start, Payment.received_on <= window_end)
    if customer_ids:
        pq = pq.where((Payment.customer_id.in_(customer_ids)) | (Payment.customer_id.is_(None)))
    payments = list(db.scalars(pq.order_by(Payment.received_on, Payment.id)))
    pay_ids = [p.id for p in payments]
    allocs: dict[int, list[PaymentAllocation]] = defaultdict(list)
    target_invoices: dict[int, Invoice] = {}
    if pay_ids:
        rows = list(db.scalars(select(PaymentAllocation).where(PaymentAllocation.payment_id.in_(pay_ids),
                                                               PaymentAllocation.allocated_on <= as_of,
                                                               active_allocation_clause(PaymentAllocation))))
        for a in rows:
            allocs[a.payment_id].append(a)
        tids = {a.invoice_id for a in rows}
        if tids:
            target_invoices = {i.id: i for i in db.scalars(select(Invoice).where(Invoice.id.in_(tids)))}
    known_numbers = set()
    refs = {p.remittance_invoice_ref for p in payments if p.remittance_invoice_ref}
    if refs:
        known_numbers = set(db.scalars(select(Invoice.invoice_number).where(Invoice.tenant_id == tenant_id, Invoice.invoice_number.in_(refs))))
    # duplicate references are checked against *all* received payments, not just this window
    seen_refs: dict[tuple, str] = {}
    ref_keys = {p.transaction_reference for p in payments if p.transaction_reference}
    if ref_keys:
        for p in db.scalars(select(Payment).where(Payment.tenant_id == tenant_id, Payment.status == "RECEIVED",
                                                  Payment.transaction_reference.in_(ref_keys)).order_by(Payment.received_on, Payment.id)):
            seen_refs.setdefault((p.customer_id, p.transaction_reference, money(p.amount)), p.payment_number)

    for p in payments:
        allocated = money(sum((D(a.amount) for a in allocs[p.id]), Decimal("0")))
        unallocated = money(D(p.amount) - allocated)
        rec = PaymentRecon(record_type="PAYMENT", status="", payment_id=p.id, customer_id=p.customer_id,
                           payment_amount=money(p.amount), payments_allocated=allocated, unallocated_amount=unallocated,
                           details={"payment_number": p.payment_number, "transaction_reference": p.transaction_reference,
                                    "verification_status": p.verification_status, "source": p.source,
                                    "allocation_ids": [a.id for a in allocs[p.id]]})
        issues: list[tuple[str, str]] = []
        first = seen_refs.get((p.customer_id, p.transaction_reference, money(p.amount))) if p.transaction_reference else None
        if first and first != p.payment_number:
            issues.append(("DUPLICATE_TRANSACTION_REFERENCE",
                           f"Same customer, reference {p.transaction_reference} and amount as payment {first}"))
        if p.customer_id is None:
            issues.append(("UNIDENTIFIED_PAYER", "Payment is not linked to any customer"))
        if p.remittance_invoice_ref and p.remittance_invoice_ref not in known_numbers:
            issues.append(("INVALID_INVOICE_REFERENCE", f"Remittance references unknown invoice {p.remittance_invoice_ref}"))
        for a in allocs[p.id]:
            inv = target_invoices.get(a.invoice_id)
            if inv is not None and p.customer_id is not None and inv.customer_id != p.customer_id:
                issues.append(("CROSS_CUSTOMER_ALLOCATION", f"Allocated {money(a.amount)} to invoice {inv.invoice_number} of another customer"))
            if inv is not None and not is_issued(inv):
                issues.append(("INVALID_ALLOCATION_TARGET", f"Allocated to {inv.status.lower()} invoice {inv.invoice_number}"))
        if allocated > D(p.amount):
            issues.append(("PAYMENT_OVER_ALLOCATED", f"Allocations {allocated} exceed payment amount {money(p.amount)}"))
        elif allocated == 0:
            issues.append(("UNALLOCATED_CASH", f"No part of the {money(p.amount)} payment is applied to an invoice"))
        if issues:
            rec.status = "DISCREPANCY"
            rec.issue_code = issues[0][0]
            rec.explanation = "; ".join(msg for _, msg in issues)
            rec.details["issues"] = [{"code": c, "message": m} for c, m in issues]
        elif unallocated > 0:
            rec.status = "PARTIALLY_ALLOCATED"
            rec.explanation = f"{unallocated} of the payment remains unapplied (on account)"
        else:
            rec.status = "ALLOCATED"
            rec.explanation = "Fully applied to invoices"
        out.append(rec)
    return out
