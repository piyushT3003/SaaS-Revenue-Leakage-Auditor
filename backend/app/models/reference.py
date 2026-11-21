"""Reference data: customers, products, contracts, versions, pricing rules, subscriptions, costs."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, LineageMixin, Money, Percent, Quantity, TenantMixin, TimestampMixin, UnitRate
from backend.app.models.identity import JSONType

SEGMENTS = ("ENTERPRISE", "MID_MARKET", "SMB")
BILLING_FREQUENCIES = ("MONTHLY", "QUARTERLY", "ANNUAL")
CHARGE_TYPES = ("RECURRING", "USAGE", "ONE_TIME")
PRICING_MODELS = ("FLAT", "PER_UNIT", "TIERED_GRADUATED", "TIERED_VOLUME")
COST_TYPES = ("COMPUTE", "INFRASTRUCTURE", "SUPPORT", "THIRD_PARTY", "PAYMENT_PROCESSING")
ALLOCATION_BASES = ("DIRECT", "USAGE", "SEATS", "REVENUE")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


class Customer(Base, TenantMixin, TimestampMixin, LineageMixin):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "customer_code"),
        CheckConstraint(_in("segment", SEGMENTS), name="segment"),
        CheckConstraint(_in("status", ("ACTIVE", "CHURNED", "PROSPECT")), name="status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    segment: Mapped[str] = mapped_column(String(16), nullable=False)
    industry: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    region: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE", nullable=False)
    onboarded_on: Mapped[date | None] = mapped_column(Date)
    account_owner: Mapped[str] = mapped_column(String(120), default="", nullable=False)


class Product(Base, TenantMixin, TimestampMixin, LineageMixin):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("tenant_id", "product_code"),
        CheckConstraint(_in("charge_model", ("RECURRING", "USAGE")), name="charge_model"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    product_code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    product_family: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    charge_model: Mapped[str] = mapped_column(String(16), nullable=False)
    unit_name: Mapped[str] = mapped_column(String(40), default="unit", nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)


class Contract(Base, TenantMixin, TimestampMixin, LineageMixin):
    __tablename__ = "contracts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "contract_number"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="dates"),
        CheckConstraint(_in("billing_frequency", BILLING_FREQUENCIES), name="billing_frequency"),
        CheckConstraint(_in("status", ("DRAFT", "ACTIVE", "TERMINATED", "EXPIRED")), name="status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_number: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    billing_frequency: Mapped[str] = mapped_column(String(16), default="MONTHLY", nullable=False)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE", nullable=False)

    customer: Mapped[Customer] = relationship()
    versions: Mapped[list["ContractVersion"]] = relationship(back_populates="contract", order_by="ContractVersion.version_number")


class ContractVersion(Base, TenantMixin, TimestampMixin, LineageMixin):
    """Immutable-by-convention contract terms; amendments create a new version."""

    __tablename__ = "contract_versions"
    __table_args__ = (
        UniqueConstraint("contract_id", "version_number"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="dates"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="RESTRICT"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)  # inclusive; null = open-ended
    change_reason: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    signed_on: Mapped[date | None] = mapped_column(Date)

    contract: Mapped[Contract] = relationship(back_populates="versions")
    pricing_rules: Mapped[list["PricingRule"]] = relationship(back_populates="contract_version")


class PricingRule(Base, TenantMixin, TimestampMixin, LineageMixin):
    """Versioned pricing rule. ``rule_key`` is stable across versions; a change creates a new
    ``rule_version`` so historical calculations stay reproducible.

    Prices for RECURRING rules are *per unit per month*; the billing frequency decides how many
    months one billing period covers. USAGE rules price consumption above ``included_units``
    (per month). ``tiers`` is a list of ``{"up_to": "1000" | null, "unit_price": "0.50"}``.
    """

    __tablename__ = "pricing_rules"
    __table_args__ = (
        UniqueConstraint("tenant_id", "rule_key", "rule_version"),
        CheckConstraint(_in("charge_type", CHARGE_TYPES), name="charge_type"),
        CheckConstraint(_in("pricing_model", PRICING_MODELS), name="pricing_model"),
        CheckConstraint(_in("status", ("ACTIVE", "PROPOSED", "RETIRED")), name="status"),
        CheckConstraint("discount_pct >= 0 AND discount_pct <= 100", name="discount_range"),
        CheckConstraint("unit_price >= 0", name="unit_price_nonneg"),
        Index("ix_pricing_rules_version_product", "contract_version_id", "product_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    rule_key: Mapped[str] = mapped_column(String(60), nullable=False)
    rule_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    contract_version_id: Mapped[int | None] = mapped_column(ForeignKey("contract_versions.id", ondelete="RESTRICT"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    charge_type: Mapped[str] = mapped_column(String(16), nullable=False)
    pricing_model: Mapped[str] = mapped_column(String(20), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(UnitRate, default=Decimal("0"), nullable=False)
    included_units: Mapped[Decimal] = mapped_column(Quantity, default=Decimal("0"), nullable=False)
    tiers: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    discount_pct: Mapped[Decimal] = mapped_column(Percent, default=Decimal("0"), nullable=False)
    minimum_commitment: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE", nullable=False)
    effective_from: Mapped[date | None] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    contract_version: Mapped[ContractVersion | None] = relationship(back_populates="pricing_rules")
    product: Mapped[Product] = relationship()


class Subscription(Base, TenantMixin, TimestampMixin, LineageMixin):
    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "subscription_code"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="dates"),
        CheckConstraint(_in("status", ("TRIAL", "ACTIVE", "PAUSED", "CANCELLED")), name="status"),
        CheckConstraint(_in("billing_frequency", BILLING_FREQUENCIES), name="billing_frequency"),
        CheckConstraint("quantity >= 0", name="quantity_nonneg"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    subscription_code: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="RESTRICT"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    plan_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Quantity, default=Decimal("1"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE", nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)  # inclusive
    billing_frequency: Mapped[str] = mapped_column(String(16), default="MONTHLY", nullable=False)

    customer: Mapped[Customer] = relationship()
    contract: Mapped[Contract] = relationship()
    product: Mapped[Product] = relationship()


class ProductCost(Base, TenantMixin, TimestampMixin, LineageMixin):
    """Direct service cost for a product-month. ``customer_id`` set = directly attributable cost;
    null = a product-level pool allocated to customers by ``allocation_basis``."""

    __tablename__ = "product_costs"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "product_id", "customer_id", "period_month", "cost_type", postgresql_nulls_not_distinct=True
        ),
        CheckConstraint(_in("cost_type", COST_TYPES), name="cost_type"),
        CheckConstraint(_in("allocation_basis", ALLOCATION_BASES), name="allocation_basis"),
        CheckConstraint("amount >= 0", name="amount_nonneg"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    period_month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    cost_type: Mapped[str] = mapped_column(String(24), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    allocation_basis: Mapped[str] = mapped_column(String(16), default="USAGE", nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="", nullable=False)
