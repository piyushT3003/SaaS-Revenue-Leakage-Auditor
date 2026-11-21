"""Transaction data: usage, invoices, payments, allocations, credits."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, LineageMixin, Money, Percent, Quantity, TenantMixin, TimestampMixin, UnitRate
from backend.app.models.reference import CHARGE_TYPES, Customer, Product, Subscription, _in


class UsageBatch(Base, TenantMixin, TimestampMixin, LineageMixin):
    """A delivery of metered usage from a source system, with source-side control totals."""

    __tablename__ = "usage_batches"
    __table_args__ = (
        UniqueConstraint("tenant_id", "batch_code"),
        CheckConstraint(_in("status", ("RECEIVED", "PROCESSED", "FAILED", "REPROCESSED")), name="status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    batch_code: Mapped[str] = mapped_column(String(60), nullable=False)
    source_system: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    sequence_number: Mapped[int | None] = mapped_column(Integer)
    control_event_count: Mapped[int | None] = mapped_column(Integer)
    control_quantity: Mapped[Decimal | None] = mapped_column(Quantity)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="RECEIVED", nullable=False)
    failure_reason: Mapped[str] = mapped_column(Text, default="", nullable=False)


class UsageEvent(Base, TenantMixin, TimestampMixin, LineageMixin):
    __tablename__ = "usage_events"
    __table_args__ = (
        UniqueConstraint("tenant_id", "event_id"),
        CheckConstraint("quantity >= 0", name="quantity_nonneg"),
        Index("ix_usage_events_sub_time", "subscription_id", "occurred_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[str] = mapped_column(String(80), nullable=False)
    subscription_id: Mapped[int] = mapped_column(ForeignKey("subscriptions.id", ondelete="RESTRICT"), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    usage_batch_id: Mapped[int | None] = mapped_column(ForeignKey("usage_batches.id", ondelete="RESTRICT"), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Quantity, nullable=False)


class Invoice(Base, TenantMixin, TimestampMixin, LineageMixin):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "invoice_number"),
        CheckConstraint(_in("status", ("DRAFT", "ISSUED", "VOID")), name="status"),
        CheckConstraint("due_date >= issue_date", name="dates"),
        Index("ix_invoices_customer_issue", "customer_id", "issue_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False)
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.id", ondelete="RESTRICT"))
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="ISSUED", nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    replaces_invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"))
    void_reason: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    customer: Mapped[Customer] = relationship()
    lines: Mapped[list["InvoiceLine"]] = relationship(back_populates="invoice", order_by="InvoiceLine.line_number")


class InvoiceLine(Base, TenantMixin, TimestampMixin, LineageMixin):
    """``line_amount`` is the net, pre-tax amount: quantity × unit_price − discount_amount."""

    __tablename__ = "invoice_lines"
    __table_args__ = (
        UniqueConstraint("invoice_id", "line_number"),
        CheckConstraint(_in("charge_type", CHARGE_TYPES), name="charge_type"),
        Index("ix_invoice_lines_match", "subscription_id", "charge_type", "period_start"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("subscriptions.id", ondelete="RESTRICT"))
    charge_type: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    quantity: Mapped[Decimal] = mapped_column(Quantity, default=Decimal("1"), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(UnitRate, default=Decimal("0"), nullable=False)
    discount_pct: Mapped[Decimal] = mapped_column(Percent, default=Decimal("0"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    line_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    billing_obligation_ref: Mapped[str | None] = mapped_column(String(64), index=True)
    contract_ref: Mapped[str | None] = mapped_column(String(40))

    invoice: Mapped[Invoice] = relationship(back_populates="lines")
    product: Mapped[Product | None] = relationship()
    subscription: Mapped[Subscription | None] = relationship()


class InvoiceLineAllocation(Base, TenantMixin, TimestampMixin):
    """Explicit allocation rule for a consolidated line that legitimately covers several
    billing obligations (or part of one). Without such a rule the reconciler never splits
    a line across obligations on its own."""

    __tablename__ = "invoice_line_allocations"
    __table_args__ = (UniqueConstraint("invoice_line_id", "obligation_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_line_id: Mapped[int] = mapped_column(ForeignKey("invoice_lines.id", ondelete="CASCADE"), nullable=False)
    obligation_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    quantity: Mapped[Decimal | None] = mapped_column(Quantity)
    reason: Mapped[str] = mapped_column(String(255), default="", nullable=False)


class Payment(Base, TenantMixin, TimestampMixin, LineageMixin):
    """A recorded receipt. ``verification_status`` stays UNVERIFIED unless confirmed against a
    bank statement — manually entered or demo payments are never presented as bank-confirmed."""

    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "payment_number"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(_in("status", ("RECEIVED", "REVERSED")), name="status"),
        CheckConstraint(_in("verification_status", ("UNVERIFIED", "BANK_CONFIRMED")), name="verification"),
        CheckConstraint(_in("source", ("IMPORTED_FILE", "MANUAL_ENTRY", "SYNTHETIC_DEMO")), name="source"),
        Index("ix_payments_txn_ref", "transaction_reference"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    payment_number: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    received_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    method: Mapped[str] = mapped_column(String(24), default="BANK_TRANSFER", nullable=False)
    transaction_reference: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    remittance_invoice_ref: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    source: Mapped[str] = mapped_column(String(16), default="IMPORTED_FILE", nullable=False)
    verification_status: Mapped[str] = mapped_column(String(16), default="UNVERIFIED", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="RECEIVED", nullable=False)

    allocations: Mapped[list["PaymentAllocation"]] = relationship(back_populates="payment")


class PaymentAllocation(Base, TenantMixin, TimestampMixin, LineageMixin):
    __tablename__ = "payment_allocations"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id", ondelete="RESTRICT"), nullable=False, index=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    allocated_on: Mapped[date] = mapped_column(Date, nullable=False)
    allocated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    method: Mapped[str] = mapped_column(String(16), default="IMPORTED", nullable=False)
    # Allocations are append-only: a correction reverses the old row and adds a new one.
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reversal_reason: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    payment: Mapped[Payment] = relationship(back_populates="allocations")
    invoice: Mapped[Invoice] = relationship()


class CreditAdjustment(Base, TenantMixin, TimestampMixin, LineageMixin):
    __tablename__ = "credit_adjustments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "credit_number"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(_in("adjustment_type", ("CREDIT_NOTE", "DEBIT_ADJUSTMENT", "WRITE_OFF")), name="type"),
        CheckConstraint(_in("status", ("PENDING", "APPROVED", "REJECTED")), name="status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    credit_number: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id", ondelete="RESTRICT"), index=True)
    adjustment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="PENDING", nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
