"""Usage Meter Integrity Monitor.

Checks performed per usage batch in the window:
* control-total differences (source-reported event count / quantity vs ingested);
* FAILED batches (their events are excluded from billing);
* sequence gaps per source system (only where the source supplies sequence numbers);
* late arrivals (events ingested more than 3 days after the batch period closed);
* invalid timestamps (events dated outside their batch's period, or in the future);
* duplicate event IDs rejected at import (from the raw import layer).

Events that never arrived can only be inferred from an *independent* completeness signal
(control totals or sequence numbers). Without such a signal nothing is claimed.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.money import D
from backend.app.models import ImportBatch, ImportRow, Tenant, UsageBatch, UsageEvent

LATE_ARRIVAL_DAYS = 3


def check(db: Session, tenant_id: int, period_start: date, period_end: date) -> dict:
    tz = ZoneInfo(db.get(Tenant, tenant_id).timezone)
    batches = list(db.scalars(select(UsageBatch).where(UsageBatch.tenant_id == tenant_id, UsageBatch.period_start <= period_end,
                                                       UsageBatch.period_end >= period_start).order_by(UsageBatch.source_system, UsageBatch.period_start)))
    ids = [b.id for b in batches]
    stats = {bid: (n, D(q)) for bid, n, q in db.execute(select(UsageEvent.usage_batch_id, func.count(UsageEvent.id), func.coalesce(func.sum(UsageEvent.quantity), 0))
                                                     .where(UsageEvent.usage_batch_id.in_(ids or [0])).group_by(UsageEvent.usage_batch_id))}
    rows, issues = [], []
    by_source = defaultdict(list)
    for b in batches:
        n, q = stats.get(b.id, (0, Decimal("0")))
        lo = datetime.combine(b.period_start, time.min, tz)
        hi = datetime.combine(b.period_end + timedelta(days=1), time.min, tz)
        outside = db.scalar(select(func.count(UsageEvent.id)).where(UsageEvent.usage_batch_id == b.id,
                                                                    (UsageEvent.occurred_at < lo) | (UsageEvent.occurred_at >= hi))) or 0
        future = db.scalar(select(func.count(UsageEvent.id)).where(UsageEvent.usage_batch_id == b.id, UsageEvent.occurred_at > datetime.now(UTC))) or 0
        # Lateness is judged on the delivery time the source reported (received_at), never on our own load
        # time: a historical bulk import is not a late meter delivery. No received_at → no lateness claim.
        late_cut = hi + timedelta(days=LATE_ARRIVAL_DAYS)
        late = n if b.received_at is not None and b.received_at > late_cut else 0
        b_issues = []
        if b.control_event_count is not None and b.control_event_count != n:
            b_issues.append({"code": "CONTROL_COUNT_MISMATCH", "severity": "HIGH",
                             "message": f"Source reported {b.control_event_count} events; {n} were ingested ({b.control_event_count - n:+d})"})
        if b.control_quantity is not None and D(b.control_quantity) != q:
            b_issues.append({"code": "CONTROL_QUANTITY_MISMATCH", "severity": "HIGH",
                             "message": f"Source reported quantity {b.control_quantity}; ingested {q}"})
        if b.status == "FAILED":
            b_issues.append({"code": "FAILED_BATCH", "severity": "HIGH",
                             "message": f"Batch failed processing{': ' + b.failure_reason if b.failure_reason else ''}; its {n} events are excluded from billing"})
        if outside:
            b_issues.append({"code": "INVALID_TIMESTAMP", "severity": "MEDIUM", "message": f"{outside} events are dated outside the batch period"})
        if future:
            b_issues.append({"code": "FUTURE_TIMESTAMP", "severity": "MEDIUM", "message": f"{future} events are dated in the future"})
        if late:
            b_issues.append({"code": "LATE_ARRIVAL", "severity": "LOW", "message": f"Batch delivered {b.received_at:%d %b %Y}, more than {LATE_ARRIVAL_DAYS} days after the period closed ({late} events)"})
        affected = [f"{b.period_start:%Y-%m}"] if b_issues else []
        rows.append({"id": b.id, "batch_code": b.batch_code, "source_system": b.source_system, "period_start": b.period_start,
                     "period_end": b.period_end, "sequence_number": b.sequence_number, "status": b.status,
                     "control_event_count": b.control_event_count, "ingested_events": n, "control_quantity": b.control_quantity,
                     "ingested_quantity": q, "issues": b_issues, "affected_billing_periods": affected,
                     "reprocessable": b.status == "FAILED" and (b.control_event_count is None or b.control_event_count == n)})
        for i in b_issues:
            issues.append({**i, "batch_code": b.batch_code, "period": f"{b.period_start:%Y-%m}"})
        if b.sequence_number is not None:
            by_source[b.source_system].append(b.sequence_number)
    gaps = []
    for src, seqs in by_source.items():
        seqs = sorted(set(seqs))
        missing = [s for s in range(seqs[0], seqs[-1] + 1) if s not in seqs]
        if missing:
            gaps.append({"source_system": src, "missing_sequence_numbers": missing})
            issues.append({"code": "SEQUENCE_GAP", "severity": "HIGH", "batch_code": src,
                           "message": f"{src}: batch sequence numbers {missing} were never received", "period": ""})
    dup_rows = db.scalar(select(func.count(ImportRow.id)).join(ImportBatch).where(
        ImportBatch.tenant_id == tenant_id, ImportBatch.dataset_type == "usage_events", ImportRow.status == "DUPLICATE")) or 0
    if dup_rows:
        issues.append({"code": "DUPLICATE_EVENT_IDS", "severity": "LOW", "batch_code": "imports", "period": "",
                       "message": f"{dup_rows} duplicate usage event IDs were rejected at import (not billed twice)"})
    return {
        "period_start": period_start, "period_end": period_end, "batches": rows, "issues": issues, "sequence_gaps": gaps,
        "summary": {"batches": len(rows), "batches_with_issues": sum(1 for r in rows if r["issues"]),
                    "ingested_events": sum(r["ingested_events"] for r in rows),
                    "affected_billing_periods": sorted({p for r in rows for p in r["affected_billing_periods"]})},
        "completeness_note": "Missing events are only reported where the source supplied control totals or sequence numbers; "
                             "without an independent completeness signal no claim is made about events that never arrived.",
    }


def reprocess(db: Session, batch: UsageBatch) -> str:
    """Re-admit a FAILED batch whose ingested events now agree with its control total."""
    if batch.status != "FAILED":
        raise ValueError(f"Batch is {batch.status}; only FAILED batches can be reprocessed")
    n = db.scalar(select(func.count(UsageEvent.id)).where(UsageEvent.usage_batch_id == batch.id)) or 0
    if batch.control_event_count is not None and batch.control_event_count != n:
        raise ValueError(f"Control total {batch.control_event_count} still differs from {n} ingested events; "
                         "re-deliver the missing events before reprocessing")
    batch.status, batch.failure_reason = "REPROCESSED", ""
    return f"{n} events re-admitted for billing"
