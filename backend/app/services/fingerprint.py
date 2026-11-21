"""Source-data fingerprint used to tell whether audit results are still current.

The fingerprint hashes, for every source table that feeds the financial engine, the row
count and latest modification time for the tenant. If any source record is added, changed
or removed after an audit, the fingerprint changes and dashboards show the audit as stale.
"""
from __future__ import annotations

import hashlib

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models import (
    Contract,
    ContractVersion,
    CreditAdjustment,
    Customer,
    Invoice,
    InvoiceLine,
    InvoiceLineAllocation,
    Payment,
    PaymentAllocation,
    PricingRule,
    Product,
    ProductCost,
    Subscription,
    UsageBatch,
    UsageEvent,
)

SOURCE_TABLES = (Customer, Product, Contract, ContractVersion, PricingRule, Subscription, ProductCost, UsageBatch,
                 UsageEvent, Invoice, InvoiceLine, InvoiceLineAllocation, Payment, PaymentAllocation, CreditAdjustment)


def data_fingerprint(db: Session, tenant_id: int) -> str:
    parts = []
    for model in SOURCE_TABLES:
        count, latest, ids = db.execute(
            select(func.count(model.id), func.max(model.updated_at), func.coalesce(func.sum(model.id), 0)).where(model.tenant_id == tenant_id)
        ).one()
        parts.append(f"{model.__tablename__}:{count}:{latest.isoformat() if latest else '-'}:{ids}")
    return hashlib.sha256("|".join(parts).encode()).hexdigest()
