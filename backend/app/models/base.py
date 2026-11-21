"""Declarative base, shared column types and mixins."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, MetaData, Numeric, func
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# Financial column types. NUMERIC only — never FLOAT/REAL for money.
Money = Numeric(18, 2)
UnitRate = Numeric(18, 4)
Quantity = Numeric(18, 4)
Percent = Numeric(7, 4)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)
    type_annotation_map = {Decimal: Money}


def new_uuid() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TenantMixin:
    """Tenant-ready isolation: every business row belongs to exactly one tenant."""

    @declared_attr
    def tenant_id(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False, index=True)


class LineageMixin:
    """Source lineage: which import batch and row created this record (null = created in-app)."""

    @declared_attr
    def source_batch_id(cls) -> Mapped[int | None]:  # noqa: N805
        return mapped_column(ForeignKey("import_batches.id", ondelete="RESTRICT"), nullable=True, index=True)

    source_row_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
