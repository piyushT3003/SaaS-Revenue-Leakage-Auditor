"""Import batches and raw source rows (the 'raw' layer, kept separate from operational tables)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, TenantMixin, TimestampMixin
from backend.app.models.identity import JSONType
from backend.app.models.reference import _in

IMPORT_STATUSES = ("VALIDATED", "IMPORTED", "ROLLED_BACK", "FAILED", "REJECTED")


class ImportBatch(Base, TenantMixin, TimestampMixin):
    __tablename__ = "import_batches"
    __table_args__ = (
        UniqueConstraint("tenant_id", "batch_code"),
        CheckConstraint(_in("status", IMPORT_STATUSES), name="status"),
        CheckConstraint(_in("data_origin", ("USER_UPLOAD", "SYNTHETIC_DEMO")), name="origin"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    batch_code: Mapped[str] = mapped_column(String(40), nullable=False)
    dataset_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    data_origin: Mapped[str] = mapped_column(String(16), default="USER_UPLOAD", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="VALIDATED", nullable=False)
    source_columns: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    column_mapping: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accepted_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rejected_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duplicate_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    inserted_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    issues_summary: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rollback_reason: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    rows: Mapped[list["ImportRow"]] = relationship(back_populates="batch", order_by="ImportRow.row_number")


class ImportRow(Base):
    __tablename__ = "import_rows"
    __table_args__ = (
        UniqueConstraint("batch_id", "row_number"),
        CheckConstraint(_in("status", ("ACCEPTED", "REJECTED", "DUPLICATE")), name="status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_values: Mapped[dict] = mapped_column(JSONType, nullable=False)
    normalized_values: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    errors: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    natural_key: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    entity_table: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)

    batch: Mapped[ImportBatch] = relationship(back_populates="rows")
