"""Declarative specifications of every importable dataset.

Each dataset declares its fields (type, required, allowed values, synonyms used for column
mapping), its natural key (used for duplicate detection against the file and the database)
and how references to other datasets are resolved (e.g. ``customer_code`` → ``customer_id``).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from backend.app.models import (
    Contract,
    ContractVersion,
    CreditAdjustment,
    Customer,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    PricingRule,
    Product,
    ProductCost,
    Subscription,
    UsageBatch,
    UsageEvent,
)
from backend.app.models.reference import (
    ALLOCATION_BASES,
    BILLING_FREQUENCIES,
    CHARGE_TYPES,
    COST_TYPES,
    PRICING_MODELS,
    SEGMENTS,
)


@dataclass(frozen=True)
class Ref:
    """Reference to another dataset by its business code."""

    model: type
    code_attr: str  # column holding the business code on the referenced model
    target: str  # attribute set on the new entity (e.g. customer_id)


@dataclass(frozen=True)
class FieldSpec:
    name: str
    type: str = "str"  # str/int/decimal/date/datetime/enum/json
    required: bool = False
    choices: tuple[str, ...] = ()
    default: object = None
    synonyms: tuple[str, ...] = ()
    ref: Ref | None = None
    max_length: int | None = None


@dataclass(frozen=True)
class DatasetSpec:
    key: str
    label: str
    category: str  # REFERENCE / TRANSACTION
    model: type
    fields: tuple[FieldSpec, ...]
    natural_key: tuple[str, ...]
    description: str = ""
    order: int = 0
    extra_validation: Callable | None = field(default=None, compare=False)

    @property
    def required(self) -> list[str]:
        return [f.name for f in self.fields if f.required]

    def field(self, name: str) -> FieldSpec:
        return next(f for f in self.fields if f.name == name)


F = FieldSpec
CUSTOMER = Ref(Customer, "customer_code", "customer_id")
PRODUCT = Ref(Product, "product_code", "product_id")
CONTRACT = Ref(Contract, "contract_number", "contract_id")
SUBSCRIPTION = Ref(Subscription, "subscription_code", "subscription_id")
INVOICE = Ref(Invoice, "invoice_number", "invoice_id")
PAYMENT = Ref(Payment, "payment_number", "payment_id")
USAGE_BATCH = Ref(UsageBatch, "batch_code", "usage_batch_id")

DATASETS: dict[str, DatasetSpec] = {}


def _register(spec: DatasetSpec) -> None:
    DATASETS[spec.key] = spec


_register(DatasetSpec("customers", "Customers", "REFERENCE", Customer, (
    F("customer_code", required=True, synonyms=("customer_id", "account_id", "account_code", "cust_code"), max_length=40),
    F("name", required=True, synonyms=("customer_name", "account_name", "company"), max_length=200),
    F("segment", "enum", required=True, choices=SEGMENTS, synonyms=("customer_segment", "tier")),
    F("industry", synonyms=("vertical",)),
    F("region", synonyms=("geo", "country")),
    F("status", "enum", choices=("ACTIVE", "CHURNED", "PROSPECT"), default="ACTIVE", synonyms=("customer_status",)),
    F("onboarded_on", "date", synonyms=("start_date", "created_date", "signup_date")),
    F("account_owner", synonyms=("owner", "csm", "account_manager")),
), ("customer_code",), "Customer master records", 1))

_register(DatasetSpec("products", "Products", "REFERENCE", Product, (
    F("product_code", required=True, synonyms=("sku", "product_id"), max_length=40),
    F("name", required=True, synonyms=("product_name",)),
    F("product_family", synonyms=("family", "category")),
    F("charge_model", "enum", required=True, choices=("RECURRING", "USAGE"), synonyms=("billing_model", "type")),
    F("unit_name", default="unit", synonyms=("unit", "uom")),
), ("product_code",), "Sellable products and their charge model", 2))

_register(DatasetSpec("contracts", "Contracts", "REFERENCE", Contract, (
    F("contract_number", required=True, synonyms=("contract_id", "contract_no", "agreement_id"), max_length=40),
    F("customer_code", required=True, ref=CUSTOMER, synonyms=("customer_id", "account_id")),
    F("start_date", "date", required=True, synonyms=("contract_start",)),
    F("end_date", "date", synonyms=("contract_end",)),
    F("currency", default="INR", synonyms=("currency_code",)),
    F("billing_frequency", "enum", choices=BILLING_FREQUENCIES, default="MONTHLY", synonyms=("billing_cycle", "frequency")),
    F("payment_terms_days", "int", default=30, synonyms=("payment_terms", "net_days")),
    F("status", "enum", choices=("DRAFT", "ACTIVE", "TERMINATED", "EXPIRED"), default="ACTIVE"),
), ("contract_number",), "Customer contracts (header level)", 3))

_register(DatasetSpec("contract_versions", "Historical contract versions", "REFERENCE", ContractVersion, (
    F("contract_number", required=True, ref=CONTRACT, synonyms=("contract_id",)),
    F("version_number", "int", required=True, synonyms=("version", "amendment_no")),
    F("effective_from", "date", required=True, synonyms=("valid_from", "start_date")),
    F("effective_to", "date", synonyms=("valid_to", "end_date")),
    F("change_reason", synonyms=("reason", "amendment_reason")),
    F("signed_on", "date", synonyms=("signed_date",)),
), ("contract_number", "version_number"), "Effective-dated contract versions and amendments", 4))

_register(DatasetSpec("pricing_rules", "Pricing rules", "REFERENCE", PricingRule, (
    F("rule_key", required=True, synonyms=("rule_id", "price_id"), max_length=60),
    F("rule_version", "int", default=1, synonyms=("version",)),
    F("contract_number", synonyms=("contract_id",)),
    F("contract_version", "int", synonyms=("version_number", "contract_version_number")),
    F("product_code", required=True, ref=PRODUCT, synonyms=("sku",)),
    F("charge_type", "enum", required=True, choices=CHARGE_TYPES),
    F("pricing_model", "enum", required=True, choices=PRICING_MODELS, synonyms=("model",)),
    F("unit_price", "decimal", required=True, synonyms=("price", "rate")),
    F("included_units", "decimal", default="0", synonyms=("allowance", "included_quantity")),
    F("tiers", "json", default=[]),
    F("discount_pct", "decimal", default="0", synonyms=("discount", "discount_percent")),
    F("minimum_commitment", "decimal", default="0", synonyms=("minimum", "min_commit")),
    F("status", "enum", choices=("ACTIVE", "PROPOSED", "RETIRED"), default="ACTIVE"),
    F("effective_from", "date"),
    F("effective_to", "date"),
), ("rule_key", "rule_version"), "Versioned pricing (attach to a contract version via contract_number + contract_version)", 5))

_register(DatasetSpec("subscriptions", "Subscriptions", "REFERENCE", Subscription, (
    F("subscription_code", required=True, synonyms=("subscription_id", "sub_id"), max_length=40),
    F("customer_code", required=True, ref=CUSTOMER, synonyms=("customer_id", "account_id")),
    F("contract_number", required=True, ref=CONTRACT, synonyms=("contract_id",)),
    F("product_code", required=True, ref=PRODUCT, synonyms=("sku", "product_id")),
    F("plan_name", synonyms=("plan",)),
    F("quantity", "decimal", default="1", synonyms=("seats", "licenses", "units")),
    F("status", "enum", choices=("TRIAL", "ACTIVE", "PAUSED", "CANCELLED"), default="ACTIVE"),
    F("start_date", "date", required=True),
    F("end_date", "date"),
    F("billing_frequency", "enum", choices=BILLING_FREQUENCIES, default="MONTHLY", synonyms=("billing_cycle",)),
), ("subscription_code",), "Subscribed products per customer and contract", 6))

_register(DatasetSpec("product_costs", "Product cost information", "REFERENCE", ProductCost, (
    F("product_code", required=True, ref=PRODUCT),
    F("customer_code", ref=CUSTOMER, synonyms=("customer_id",)),
    F("period_month", "date", required=True, synonyms=("month", "period")),
    F("cost_type", "enum", required=True, choices=COST_TYPES),
    F("amount", "decimal", required=True, synonyms=("cost", "cost_amount")),
    F("allocation_basis", "enum", choices=ALLOCATION_BASES, default="USAGE"),
    F("description"),
), ("product_code", "customer_code", "period_month", "cost_type"), "Direct service costs by product and month", 7))

_register(DatasetSpec("usage_batches", "Usage batches", "TRANSACTION", UsageBatch, (
    F("batch_code", required=True, synonyms=("batch_id",)),
    F("source_system", synonyms=("source", "meter")),
    F("period_start", "date", required=True),
    F("period_end", "date", required=True),
    F("sequence_number", "int", synonyms=("sequence", "seq")),
    F("control_event_count", "int", synonyms=("control_count", "event_count")),
    F("control_quantity", "decimal", synonyms=("control_total", "total_quantity")),
    F("received_at", "datetime"),
    F("status", "enum", choices=("RECEIVED", "PROCESSED", "FAILED", "REPROCESSED"), default="PROCESSED"),
), ("batch_code",), "Usage deliveries with source control totals", 8))

_register(DatasetSpec("usage_events", "Usage events", "TRANSACTION", UsageEvent, (
    F("event_id", required=True, synonyms=("id", "usage_id", "event_uuid"), max_length=80),
    F("subscription_code", required=True, ref=SUBSCRIPTION, synonyms=("subscription_id", "sub_id")),
    F("usage_batch_code", ref=USAGE_BATCH, synonyms=("batch_code", "batch_id")),
    F("occurred_at", "datetime", required=True, synonyms=("timestamp", "event_time", "ts")),
    F("quantity", "decimal", required=True, synonyms=("units", "qty", "amount")),
), ("event_id",), "Metered consumption events", 9))

_register(DatasetSpec("invoices", "Invoices", "TRANSACTION", Invoice, (
    F("invoice_number", required=True, synonyms=("invoice_id", "invoice_no"), max_length=40),
    F("customer_code", required=True, ref=CUSTOMER, synonyms=("customer_id", "account_id")),
    F("contract_number", ref=CONTRACT),
    F("issue_date", "date", required=True, synonyms=("invoice_date", "date")),
    F("due_date", "date", required=True),
    F("currency", default="INR"),
    F("status", "enum", choices=("DRAFT", "ISSUED", "VOID"), default="ISSUED"),
    F("subtotal", "decimal", synonyms=("net_amount",)),
    F("tax_amount", "decimal", default="0", synonyms=("tax", "gst")),
    F("total_amount", "decimal", required=True, synonyms=("total", "gross_amount", "amount")),
), ("invoice_number",), "Invoice headers", 10))

_register(DatasetSpec("invoice_lines", "Invoice lines", "TRANSACTION", InvoiceLine, (
    F("invoice_number", required=True, ref=INVOICE, synonyms=("invoice_id",)),
    F("line_number", "int", required=True, synonyms=("line", "line_no")),
    F("product_code", ref=PRODUCT, synonyms=("sku",)),
    F("subscription_code", ref=SUBSCRIPTION, synonyms=("subscription_id",)),
    F("charge_type", "enum", required=True, choices=CHARGE_TYPES),
    F("description"),
    F("period_start", "date", synonyms=("service_start",)),
    F("period_end", "date", synonyms=("service_end",)),
    F("quantity", "decimal", default="1", synonyms=("qty", "units")),
    F("unit_price", "decimal", default="0", synonyms=("rate", "price")),
    F("discount_pct", "decimal", default="0", synonyms=("discount_percent",)),
    F("discount_amount", "decimal", default="0"),
    F("line_amount", "decimal", required=True, synonyms=("amount", "net_amount")),
    F("billing_obligation_ref", synonyms=("obligation_ref", "obligation_key")),
    F("contract_ref"),
), ("invoice_number", "line_number"), "Invoice line items (net, pre-tax)", 11))

_register(DatasetSpec("payments", "Payments", "TRANSACTION", Payment, (
    F("payment_number", required=True, synonyms=("payment_id", "receipt_no"), max_length=40),
    F("customer_code", ref=CUSTOMER, synonyms=("customer_id", "payer")),
    F("received_on", "date", required=True, synonyms=("payment_date", "date")),
    F("amount", "decimal", required=True),
    F("currency", default="INR"),
    F("method", default="BANK_TRANSFER", synonyms=("payment_method",)),
    F("transaction_reference", synonyms=("txn_ref", "utr", "reference")),
    F("remittance_invoice_ref", synonyms=("invoice_reference", "remittance_ref")),
    F("status", "enum", choices=("RECEIVED", "REVERSED"), default="RECEIVED"),
), ("payment_number",), "Recorded receipts (imported as UNVERIFIED — not bank-confirmed)", 12))

_register(DatasetSpec("payment_allocations", "Payment allocations", "TRANSACTION", PaymentAllocation, (
    F("payment_number", required=True, ref=PAYMENT),
    F("invoice_number", required=True, ref=INVOICE),
    F("amount", "decimal", required=True),
    F("allocated_on", "date", required=True, synonyms=("allocation_date", "date")),
), ("payment_number", "invoice_number", "allocated_on", "amount"), "Application of payments to invoices", 13))

_register(DatasetSpec("credit_adjustments", "Credits & adjustments", "TRANSACTION", CreditAdjustment, (
    F("credit_number", required=True, synonyms=("credit_id", "credit_note_no")),
    F("customer_code", required=True, ref=CUSTOMER),
    F("invoice_number", ref=INVOICE),
    F("adjustment_type", "enum", required=True, choices=("CREDIT_NOTE", "DEBIT_ADJUSTMENT", "WRITE_OFF"), synonyms=("type",)),
    F("amount", "decimal", required=True),
    F("reason", required=True),
    F("status", "enum", choices=("PENDING", "APPROVED", "REJECTED"), default="APPROVED"),
    F("effective_date", "date", required=True, synonyms=("date",)),
), ("credit_number",), "Credit notes, debit adjustments and write-offs", 14))
