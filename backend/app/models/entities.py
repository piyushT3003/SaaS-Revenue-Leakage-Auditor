import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    Column, String, Integer, Numeric, Boolean, Date, DateTime, 
    ForeignKey, Text, Index
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="Analyst", nullable=False)  # Admin, Analyst, Viewer
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    assigned_exceptions = relationship("ExceptionRecord", back_populates="assigned_to", foreign_keys="ExceptionRecord.assigned_to_id")
    investigation_notes = relationship("InvestigationNote", back_populates="user")


class Customer(Base):
    __tablename__ = "customers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    customer_code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    domain = Column(String(255), nullable=True)
    segment = Column(String(64), nullable=False, index=True)  # Enterprise, Mid-Market, SMB, Startup
    plan_tier = Column(String(64), nullable=False)  # Enterprise, Professional, Growth, Starter
    status = Column(String(32), default="Active", nullable=False, index=True)  # Active, At-Risk, Churned, Suspended
    billing_currency = Column(String(10), default="INR", nullable=False)
    payment_terms_days = Column(Integer, default=30, nullable=False)
    health_score = Column(Numeric(5, 2), default=Decimal("85.00"), nullable=False)  # 0.00 - 100.00
    health_status = Column(String(32), default="Healthy", nullable=False)  # Healthy, Attention, Critical
    contact_email = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    contracts = relationship("Contract", back_populates="customer", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="customer", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="customer", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="customer", cascade="all, delete-orphan")
    exceptions = relationship("ExceptionRecord", back_populates="customer", cascade="all, delete-orphan")
    product_costs = relationship("ProductCost", back_populates="customer", cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    product_code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(64), nullable=False)  # Platform, API Services, Storage, Analytics, Add-on
    base_fee = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    metered_unit = Column(String(64), nullable=True)  # API Calls, Active Users, GB Stored, Compute Hours
    rate_per_unit = Column(Numeric(14, 4), default=Decimal("0.0000"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    subscriptions = relationship("Subscription", back_populates="product")
    product_costs = relationship("ProductCost", back_populates="product")


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    contract_number = Column(String(64), unique=True, nullable=False, index=True)
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    auto_renew = Column(Boolean, default=True, nullable=False)
    status = Column(String(32), default="Active", nullable=False)  # Active, Expired, Terminated, Superseded
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="contracts")
    versions = relationship("ContractVersion", back_populates="contract", cascade="all, delete-orphan")


class ContractVersion(Base):
    __tablename__ = "contract_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    contract_id = Column(String(36), ForeignKey("contracts.id"), nullable=False, index=True)
    version_number = Column(Integer, default=1, nullable=False)
    effective_from = Column(Date, nullable=False, index=True)
    effective_to = Column(Date, nullable=False, index=True)
    fixed_fee = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    included_units = Column(Integer, default=0, nullable=False)
    overage_rate = Column(Numeric(14, 4), default=Decimal("0.0000"), nullable=False)
    tier_config_json = Column(Text, nullable=True)  # JSON tiered pricing
    discount_pct = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)  # e.g. 10.00%
    status = Column(String(32), default="Active", nullable=False)
    is_current = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    contract = relationship("Contract", back_populates="versions")
    subscriptions = relationship("Subscription", back_populates="contract_version")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    contract_version_id = Column(String(36), ForeignKey("contract_versions.id"), nullable=True, index=True)
    billing_cycle = Column(String(32), default="Monthly", nullable=False)  # Monthly, Quarterly, Annual
    status = Column(String(32), default="Active", nullable=False)  # Active, Paused, Cancelled
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    mrr = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="subscriptions")
    product = relationship("Product", back_populates="subscriptions")
    contract_version = relationship("ContractVersion", back_populates="subscriptions")


class UsageEvent(Base):
    __tablename__ = "usage_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    usage_date = Column(Date, nullable=False, index=True)
    metric_name = Column(String(64), nullable=False)
    quantity = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    processed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    invoice_number = Column(String(64), unique=True, nullable=False, index=True)
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    billing_period_start = Column(Date, nullable=False, index=True)
    billing_period_end = Column(Date, nullable=False, index=True)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    subtotal = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    tax_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    paid_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    balance_due = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    status = Column(String(32), default="Issued", nullable=False, index=True)  # Draft, Issued, Paid, Partial, Overdue, Cancelled
    pdf_path = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="invoices")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    allocations = relationship("PaymentAllocation", back_populates="invoice")
    credit_adjustments = relationship("CreditAdjustment", back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=True)
    description = Column(String(255), nullable=False)
    quantity = Column(Numeric(14, 2), default=Decimal("1.00"), nullable=False)
    unit_price = Column(Numeric(14, 4), default=Decimal("0.0000"), nullable=False)
    discount_pct = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    line_total = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    line_type = Column(String(32), default="Fixed", nullable=False)  # Fixed, Usage, Overage, Adjustment, Tax

    invoice = relationship("Invoice", back_populates="lines")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    payment_reference = Column(String(64), unique=True, nullable=False, index=True)
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    payment_date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    payment_method = Column(String(64), default="Bank Transfer", nullable=False)
    allocated_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    unallocated_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    status = Column(String(32), default="Processed", nullable=False)  # Processed, Pending, Failed, Refunded
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="payments")
    allocations = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    payment_id = Column(String(36), ForeignKey("payments.id"), nullable=False, index=True)
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=False, index=True)
    allocated_amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    allocated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    payment = relationship("Payment", back_populates="allocations")
    invoice = relationship("Invoice", back_populates="allocations")


class CreditAdjustment(Base):
    __tablename__ = "credits_adjustments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    invoice_id = Column(String(36), ForeignKey("invoices.id"), nullable=True, index=True)
    amount = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    reason = Column(String(255), nullable=False)
    authorized_by = Column(String(100), default="Billing Operations", nullable=False)
    status = Column(String(32), default="Applied", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    invoice = relationship("Invoice", back_populates="credit_adjustments")


class ProductCost(Base):
    __tablename__ = "product_costs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    period = Column(String(10), nullable=False, index=True)  # e.g. "2026-10"
    infrastructure_cost = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    compute_cost = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    support_cost = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    third_party_cost = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_direct_cost = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="product_costs")
    product = relationship("Product", back_populates="product_costs")


class ExceptionRecord(Base):
    __tablename__ = "exceptions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    exception_code = Column(String(64), unique=True, nullable=False, index=True)  # e.g. EXC-2026-1001
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    issue_type = Column(String(64), nullable=False, index=True)
    # 8 Categories: Underbilling, Overbilling, Missing Charges, Duplicate Invoices,
    # Discount Drift, Pricing Mismatch, Unbilled Usage, Payment Discrepancies
    severity = Column(String(32), default="High", nullable=False, index=True)  # Critical, High, Medium, Low
    financial_impact = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    status = Column(String(32), default="Open", nullable=False, index=True)  # Open, In Progress, Resolved
    assigned_to_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    description = Column(String(255), nullable=False)
    calculation_explanation = Column(Text, nullable=False)
    source_records_json = Column(Text, nullable=True)  # JSON with source IDs
    resolved_reason = Column(Text, nullable=True)
    resolved_by_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    is_synthetic_ground_truth = Column(Boolean, default=False, nullable=False)

    customer = relationship("Customer", back_populates="exceptions")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id], back_populates="assigned_exceptions")
    evidence = relationship("ExceptionEvidence", back_populates="exception", cascade="all, delete-orphan")
    notes = relationship("InvestigationNote", back_populates="exception", cascade="all, delete-orphan")


class ExceptionEvidence(Base):
    __tablename__ = "exception_evidence"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    exception_id = Column(String(36), ForeignKey("exceptions.id"), nullable=False, index=True)
    evidence_type = Column(String(64), nullable=False)  # Contract, Invoice, Usage, Payment, Calculation
    title = Column(String(255), nullable=False)
    data_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    exception = relationship("ExceptionRecord", back_populates="evidence")


class InvestigationNote(Base):
    __tablename__ = "investigation_notes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    exception_id = Column(String(36), ForeignKey("exceptions.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    note_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    exception = relationship("ExceptionRecord", back_populates="notes")
    user = relationship("User", back_populates="investigation_notes")


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    batch_id = Column(String(64), unique=True, nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    data_type = Column(String(64), nullable=False)  # Usage, Invoices, Contracts, Payments, DirectCosts
    total_rows = Column(Integer, default=0, nullable=False)
    accepted_rows = Column(Integer, default=0, nullable=False)
    rejected_rows = Column(Integer, default=0, nullable=False)
    status = Column(String(32), default="Pending", nullable=False)  # Previewed, Imported, RolledBack, Failed
    rejected_records_json = Column(Text, nullable=True)
    uploaded_by_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=True, index=True)
    action = Column(String(64), nullable=False)  # RESOLVE_EXCEPTION, ASSIGN_EXCEPTION, ADD_NOTE, CREATE_INVOICE, RECORD_PAYMENT, BATCH_IMPORT, BATCH_ROLLBACK, UPDATE_SETTINGS
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(String(64), nullable=False)
    details = Column(Text, nullable=False)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class NotificationEvent(Base):
    __tablename__ = "notification_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String(32), default="Warning", nullable=False)  # Critical, Warning, Info
    entity_type = Column(String(64), nullable=True)
    entity_id = Column(String(64), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    run_number = Column(String(64), unique=True, nullable=False, index=True)
    period = Column(String(10), nullable=False, index=True)  # e.g. "2026-10"
    customer_id = Column(String(36), nullable=True)
    product_id = Column(String(36), nullable=True)
    total_eligible_obligations = Column(Integer, default=0, nullable=False)
    matched_obligations = Column(Integer, default=0, nullable=False)
    mismatched_obligations = Column(Integer, default=0, nullable=False)
    expected_total = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    invoiced_total = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    variance_total = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    reconciliation_rate = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    status = Column(String(32), default="Completed", nullable=False)  # Running, Completed, Failed
    summary_json = Column(Text, nullable=True)
    run_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    key = Column(String(64), unique=True, nullable=False, index=True)
    value_json = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
