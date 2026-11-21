"""Point-in-time ("as known at") reconstruction for historical replay.

Inside ``knowledge_cutoff(ts)``:
* every ORM query on a source table only sees rows created on or before ``ts``
  (``with_loader_criteria`` applied by a session hook);
* an invoice voided after ``ts`` still counts as ISSUED;
* a payment allocation reversed after ``ts`` still counts as active.

Corrections are append-only (void + replacement invoice, reversal + new allocation), which is
what makes this reconstruction possible. In-place edits made after ``ts`` cannot be undone; the
replay reports them so the result can be marked incomplete instead of looking authoritative.
"""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime

from sqlalchemy import and_, event, func, or_, select
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

_cutoff: ContextVar[datetime | None] = ContextVar("knowledge_cutoff", default=None)


def current_cutoff() -> datetime | None:
    return _cutoff.get()


@contextmanager
def knowledge_cutoff(ts: datetime | None):
    token = _cutoff.set(ts)
    try:
        yield
    finally:
        _cutoff.reset(token)


def _source_models():
    from backend.app.services.fingerprint import SOURCE_TABLES

    return SOURCE_TABLES


@event.listens_for(Session, "do_orm_execute")
def _apply_cutoff(state: ORMExecuteState) -> None:  # pragma: no cover - exercised via replay tests
    ts = _cutoff.get()
    if ts is None or not state.is_select:
        return
    opts = [with_loader_criteria(m, lambda cls: cls.created_at <= ts, include_aliases=True, propagate_to_loaders=True)
            for m in _source_models()]
    state.statement = state.statement.options(*opts)


def issued_invoice_clause(Invoice):
    """SQL predicate for 'valid issued invoice' honouring the knowledge cutoff."""
    ts = _cutoff.get()
    if ts is None:
        return Invoice.status == "ISSUED"
    return or_(Invoice.status == "ISSUED", and_(Invoice.status == "VOID", Invoice.voided_at > ts))


def active_allocation_clause(PaymentAllocation):
    ts = _cutoff.get()
    if ts is None:
        return PaymentAllocation.reversed_at.is_(None)
    return or_(PaymentAllocation.reversed_at.is_(None), PaymentAllocation.reversed_at > ts)


def in_place_changes_after(db: Session, tenant_id: int, ts: datetime) -> dict[str, int]:
    """Rows that existed at ``ts`` but were modified afterwards (other than append-only
    void/reversal markers) — their historical values are not recoverable."""
    from backend.app.models import Invoice, PaymentAllocation

    out = {}
    token = _cutoff.set(None)
    try:
        for m in _source_models():
            q = select(func.count(m.id)).where(m.tenant_id == tenant_id, m.created_at <= ts, m.updated_at > ts)
            if m is Invoice:  # a later void is an append-only marker, not a lost value
                q = q.where(or_(Invoice.voided_at.is_(None), Invoice.voided_at <= ts))
            if m is PaymentAllocation:
                q = q.where(PaymentAllocation.reversed_at.is_(None))
            n = db.scalar(q) or 0
            if n:
                out[m.__tablename__] = n
    finally:
        _cutoff.reset(token)
    return out
