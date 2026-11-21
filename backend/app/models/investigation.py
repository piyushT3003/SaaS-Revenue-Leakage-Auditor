"""Exceptions, evidence, notes and the advanced-module persistence tables.

The advanced-module tables (root cause, simulation, regression, evidence packs) are created in
the initial schema so the data model is complete; their services arrive in later phases.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base, Money, TenantMixin, TimestampMixin, new_uuid
from backend.app.models.identity import JSONType
from backend.app.models.reference import _in

EXCEPTION_CATEGORIES = (
    "UNDERBILLING",
    "OVERBILLING",
    "MISSING_CHARGE",
    "DUPLICATE_INVOICE",
    "DISCOUNT_DRIFT",
    "PRICING_MISMATCH",
    "UNBILLED_USAGE",
    "PAYMENT_DISCREPANCY",
)
EXCEPTION_STATUSES = ("OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED")
SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")


class ExceptionCase(Base, TenantMixin, TimestampMixin):
    __tablename__ = "exceptions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "exception_code"),
        UniqueConstraint("tenant_id", "fingerprint"),
        CheckConstraint(_in("category", EXCEPTION_CATEGORIES), name="category"),
        CheckConstraint(_in("status", EXCEPTION_STATUSES), name="status"),
        CheckConstraint(_in("severity", SEVERITIES), name="severity"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    exception_code: Mapped[str] = mapped_column(String(20), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    audit_run_id: Mapped[str] = mapped_column(ForeignKey("audit_runs.id"), nullable=False, index=True)
    last_seen_audit_run_id: Mapped[str | None] = mapped_column(ForeignKey("audit_runs.id"))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), index=True)
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.id"))
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("subscriptions.id"))
    obligation_id: Mapped[int | None] = mapped_column(ForeignKey("billing_obligations.id"))
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"))
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"))
    category: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    financial_impact: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    exposure_key: Mapped[str] = mapped_column(String(64), default="", nullable=False, index=True)
    counts_toward_leakage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), default="MEDIUM", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="OPEN", nullable=False, index=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    calculation: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_reason: Mapped[str] = mapped_column(Text, default="", nullable=False)


class ExceptionEvidence(Base, TenantMixin):
    __tablename__ = "exception_evidence"
    id: Mapped[int] = mapped_column(primary_key=True)
    exception_id: Mapped[int] = mapped_column(ForeignKey("exceptions.id", ondelete="CASCADE"), nullable=False, index=True)
    evidence_type: Mapped[str] = mapped_column(String(32), nullable=False)
    record_table: Mapped[str] = mapped_column(String(64), nullable=False)
    record_id: Mapped[str] = mapped_column(String(64), nullable=False)
    summary: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class InvestigationNote(Base, TenantMixin):
    __tablename__ = "investigation_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    exception_id: Mapped[int] = mapped_column(ForeignKey("exceptions.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ExceptionStatusHistory(Base, TenantMixin):
    __tablename__ = "exception_status_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    exception_id: Mapped[int] = mapped_column(ForeignKey("exceptions.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    to_status: Mapped[str] = mapped_column(String(16), nullable=False)
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RootCauseInvestigation(Base, TenantMixin, TimestampMixin):
    __tablename__ = "root_cause_investigations"
    id: Mapped[int] = mapped_column(primary_key=True)
    audit_run_id: Mapped[str] = mapped_column(ForeignKey("audit_runs.id"), nullable=False, index=True)
    cause_type: Mapped[str] = mapped_column(String(40), nullable=False)  # PRICING_RULE / CONTRACT_VERSION / USAGE_BATCH ...
    cause_reference: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[str] = mapped_column(String(24), default="POTENTIAL", nullable=False)  # POTENTIAL / CONFIRMED
    exception_ids: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    unique_exposure: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    blast_radius: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, default="", nullable=False)


class SimulationScenario(Base, TenantMixin, TimestampMixin):
    __tablename__ = "simulation_scenarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    assumptions: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    base_period_start: Mapped[date] = mapped_column(Date, nullable=False)
    base_period_end: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    duplicated_from_id: Mapped[int | None] = mapped_column(ForeignKey("simulation_scenarios.id"))


class SimulationResult(Base, TenantMixin):
    __tablename__ = "simulation_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("simulation_scenarios.id", ondelete="CASCADE"), nullable=False, index=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_hypothetical: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    baseline: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    projected: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    per_customer: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)


class RegressionTestSuite(Base, TenantMixin, TimestampMixin):
    __tablename__ = "regression_test_suites"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    proposed_rule_ids: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    replay_period_start: Mapped[date] = mapped_column(Date, nullable=False)
    replay_period_end: Mapped[date] = mapped_column(Date, nullable=False)
    tolerance: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    approval_status: Mapped[str] = mapped_column(String(24), default="DRAFT", nullable=False)  # DRAFT/SUBMITTED/APPROVED/REJECTED
    submitted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class RegressionTestResult(Base, TenantMixin):
    __tablename__ = "regression_test_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    suite_id: Mapped[int] = mapped_column(ForeignKey("regression_test_suites.id", ondelete="CASCADE"), nullable=False, index=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    case_key: Mapped[str] = mapped_column(String(120), nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)  # PASSED / FAILED
    current_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    proposed_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    difference: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    details: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)


class EvidencePack(Base, TenantMixin):
    __tablename__ = "evidence_packs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    exception_id: Mapped[int | None] = mapped_column(ForeignKey("exceptions.id"))
    audit_run_id: Mapped[str | None] = mapped_column(ForeignKey("audit_runs.id"))
    file_format: Mapped[str] = mapped_column(String(8), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    content: Mapped[bytes | None] = mapped_column()
    generated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SyntheticGroundTruth(Base, TenantMixin):
    """Known, deliberately injected anomalies in the demonstration dataset (for P/R/F1 tests)."""

    __tablename__ = "synthetic_ground_truth"
    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    customer_code: Mapped[str] = mapped_column(String(40), nullable=False)
    reference: Mapped[str] = mapped_column(String(120), nullable=False)  # obligation key / invoice no / payment no
    period_start: Mapped[date | None] = mapped_column(Date)
    expected_impact: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
