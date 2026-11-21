"""Audit runs and calculated results (the 'analytical' layer).

Completed audit runs, their obligation components and their reconciliation results are
immutable: database triggers (see the initial migration) reject UPDATE/DELETE on result rows,
and the service layer never mutates a COMPLETED run.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, Money, Percent, Quantity, TenantMixin, TimestampMixin, UnitRate, new_uuid
from backend.app.models.identity import JSONType
from backend.app.models.reference import CHARGE_TYPES, _in

AUDIT_STATUSES = ("QUEUED", "RUNNING", "COMPLETED", "COMPLETED_WITH_EXCLUSIONS", "FAILED")
OBLIGATION_STATUSES = (
    "MATCHED",
    "PARTIALLY_MATCHED",
    "UNDERBILLED",
    "OVERBILLED",
    "MISSING_CHARGE",
    "PENDING_REVIEW",
    "EXCLUDED",
)
PAYMENT_RESULT_STATUSES = ("PAID", "PARTIALLY_PAID", "UNPAID", "OVER_APPLIED", "CREDITED", "ALLOCATED", "PARTIALLY_ALLOCATED", "UNALLOCATED", "DISCREPANCY")


class AuditRun(Base, TenantMixin):
    __tablename__ = "audit_runs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "run_code"),
        CheckConstraint(_in("status", AUDIT_STATUSES), name="status"),
        CheckConstraint(_in("run_type", ("STANDARD", "REPLAY")), name="run_type"),
        CheckConstraint("period_end >= period_start", name="period"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    run_code: Mapped[str] = mapped_column(String(40), nullable=False)
    run_type: Mapped[str] = mapped_column(String(16), default="STANDARD", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="QUEUED", nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    scope: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)  # customer_ids / product_ids
    replay_of_run_id: Mapped[str | None] = mapped_column(ForeignKey("audit_runs.id"))
    data_fingerprint: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    engine_version: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    readiness: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    summary: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    expected_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    invoiced_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    variance_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    underbilled_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    overbilled_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    reconciliation_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    error_message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    triggered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BillingObligation(Base, TenantMixin):
    """Stable identity of something that must be billed exactly once.

    ``obligation_key`` is deterministic (customer/subscription/charge/period) so the same
    obligation keeps the same identity across audit runs and can be referenced from invoice
    lines — which is what prevents it being billed twice unnoticed. Amounts are *not* stored
    here; they are calculated per audit run (components / results)."""

    __tablename__ = "billing_obligations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "obligation_key"),
        CheckConstraint(_in("charge_type", CHARGE_TYPES), name="charge_type"),
        Index("ix_obligations_sub_period", "subscription_id", "charge_type", "period_start"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    obligation_key: Mapped[str] = mapped_column(String(64), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="RESTRICT"), nullable=False)
    subscription_id: Mapped[int] = mapped_column(ForeignKey("subscriptions.id", ondelete="RESTRICT"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    charge_type: Mapped[str] = mapped_column(String(16), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    first_seen_audit_run_id: Mapped[str | None] = mapped_column(ForeignKey("audit_runs.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BillingObligationComponent(Base, TenantMixin):
    __tablename__ = "billing_obligation_components"
    __table_args__ = (UniqueConstraint("audit_run_id", "obligation_id", "seq"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    audit_run_id: Mapped[str] = mapped_column(ForeignKey("audit_runs.id", ondelete="RESTRICT"), nullable=False, index=True)
    obligation_id: Mapped[int] = mapped_column(ForeignKey("billing_obligations.id", ondelete="RESTRICT"), nullable=False, index=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    component_type: Mapped[str] = mapped_column(String(24), nullable=False)  # BASE / USAGE / DISCOUNT / ONE_TIME / MINIMUM_TRUE_UP
    contract_version_id: Mapped[int | None] = mapped_column(ForeignKey("contract_versions.id"))
    pricing_rule_id: Mapped[int | None] = mapped_column(ForeignKey("pricing_rules.id"))
    segment_start: Mapped[date] = mapped_column(Date, nullable=False)
    segment_end: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Quantity, default=Decimal("0"), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(UnitRate, default=Decimal("0"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    formula: Mapped[str] = mapped_column(Text, nullable=False)
    inputs: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)


class ReconciliationResult(Base, TenantMixin):
    """Billing reconciliation outcome at billing-obligation grain.

    ``variance = invoiced_amount − expected_amount`` (negative = underbilled)."""

    __tablename__ = "reconciliation_results"
    __table_args__ = (
        CheckConstraint(_in("status", OBLIGATION_STATUSES), name="status"),
        Index("uq_recon_run_obligation", "audit_run_id", "obligation_id", unique=True,
              postgresql_where=text("obligation_id IS NOT NULL")),
        Index("ix_recon_run_status", "audit_run_id", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    audit_run_id: Mapped[str] = mapped_column(ForeignKey("audit_runs.id", ondelete="RESTRICT"), nullable=False)
    obligation_id: Mapped[int | None] = mapped_column(ForeignKey("billing_obligations.id", ondelete="RESTRICT"))
    invoice_line_id: Mapped[int | None] = mapped_column(ForeignKey("invoice_lines.id", ondelete="RESTRICT"))  # orphan lines
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    charge_type: Mapped[str] = mapped_column(String(16), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    expected_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    invoiced_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    variance: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    expected_quantity: Mapped[Decimal | None] = mapped_column(Quantity)
    invoiced_quantity: Mapped[Decimal | None] = mapped_column(Quantity)
    expected_unit_price: Mapped[Decimal | None] = mapped_column(UnitRate)
    invoiced_unit_price: Mapped[Decimal | None] = mapped_column(UnitRate)
    expected_discount_pct: Mapped[Decimal | None] = mapped_column(Percent)
    invoiced_discount_pct: Mapped[Decimal | None] = mapped_column(Percent)
    match_method: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    match_confidence: Mapped[str] = mapped_column(String(16), default="", nullable=False)  # HIGH / MEDIUM / NONE
    matched_line_ids: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    excluded_reason: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    explanation: Mapped[str] = mapped_column(Text, default="", nullable=False)
    details: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)


class PaymentReconciliationResult(Base, TenantMixin):
    """Invoice-to-cash outcome, produced independently of billing reconciliation."""

    __tablename__ = "payment_reconciliation_results"
    __table_args__ = (
        CheckConstraint(_in("record_type", ("INVOICE", "PAYMENT")), name="record_type"),
        CheckConstraint(_in("status", PAYMENT_RESULT_STATUSES), name="status"),
        Index("ix_payrecon_run_type", "audit_run_id", "record_type", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    audit_run_id: Mapped[str] = mapped_column(ForeignKey("audit_runs.id", ondelete="RESTRICT"), nullable=False)
    record_type: Mapped[str] = mapped_column(String(16), nullable=False)
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"))
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    issue_code: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    invoice_total: Mapped[Decimal | None] = mapped_column(Money)
    credits_applied: Mapped[Decimal | None] = mapped_column(Money)
    payments_allocated: Mapped[Decimal | None] = mapped_column(Money)
    outstanding: Mapped[Decimal | None] = mapped_column(Money)
    payment_amount: Mapped[Decimal | None] = mapped_column(Money)
    unallocated_amount: Mapped[Decimal | None] = mapped_column(Money)
    days_past_due: Mapped[int | None] = mapped_column(Integer)
    ageing_bucket: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    explanation: Mapped[str] = mapped_column(Text, default="", nullable=False)
    details: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)


class Job(Base, TenantMixin, TimestampMixin):
    """Background job tracking (imports, audits) with retry bookkeeping."""

    __tablename__ = "jobs"
    __table_args__ = (CheckConstraint(_in("status", ("QUEUED", "RUNNING", "SUCCEEDED", "FAILED")), name="status"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    job_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="QUEUED", nullable=False, index=True)
    reference_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    error: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
