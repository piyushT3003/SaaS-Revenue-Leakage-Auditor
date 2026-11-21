"""Audit-run orchestration: readiness → expected obligations → billing reconciliation →
payment reconciliation → immutable persistence. Executed as a background job."""
from __future__ import annotations

import time
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from backend.app.analytics.calculation import ENGINE_VERSION
from backend.app.core.config import settings
from backend.app.core.database import session_scope
from backend.app.core.logging import log
from backend.app.core.money import money, pct, to_json
from backend.app.anomaly_detection.classifier import persist_exceptions
from backend.app.models import (
    AuditRun,
    ExceptionCase,
    BillingObligation,
    BillingObligationComponent,
    Job,
    PaymentReconciliationResult,
    ReconciliationResult,
)
from backend.app.reconciliation.billing import evaluate, match_invoice_lines
from backend.app.reconciliation.obligations import build_expected_obligations
from backend.app.reconciliation.payments import AGEING_BUCKETS, reconcile_payments
from backend.app.reconciliation.readiness import assess_readiness
from backend.app.replay.asof import in_place_changes_after, knowledge_cutoff
from backend.app.services.fingerprint import data_fingerprint
from backend.app.services.tenancy import notify, record_audit

FINAL_STATES = ("COMPLETED", "COMPLETED_WITH_EXCLUSIONS", "FAILED")


class AuditRequestError(ValueError):
    pass


def _scope(customer_ids: list[int] | None, product_ids: list[int] | None) -> dict:
    return {"customer_ids": sorted(customer_ids or []), "product_ids": sorted(product_ids or [])}


def create_audit_run(db: Session, tenant_id: int, user_id: int | None, period_start: date, period_end: date,
                     as_of: date | None = None, customer_ids: list[int] | None = None, product_ids: list[int] | None = None,
                     reuse_if_unchanged: bool = True, run_type: str = "STANDARD", replay_of: str | None = None
                     ) -> tuple[AuditRun, bool]:
    """Queue an audit. If an identical completed audit exists for unchanged data it is returned
    instead (``reused=True``) so repeated requests are idempotent."""
    if period_end < period_start:
        raise AuditRequestError("period_end must be on or after period_start")
    if (period_end - period_start).days > 366:
        raise AuditRequestError("An audit window may cover at most one year")
    as_of = as_of or period_end
    scope = _scope(customer_ids, product_ids)
    recover_stale_runs(db, tenant_id)  # a dead QUEUED/RUNNING run must not be "reused" forever
    fp = data_fingerprint(db, tenant_id)
    if reuse_if_unchanged and run_type == "STANDARD":
        existing = db.scalar(
            select(AuditRun).where(
                AuditRun.tenant_id == tenant_id, AuditRun.run_type == "STANDARD",
                AuditRun.period_start == period_start, AuditRun.period_end == period_end, AuditRun.as_of_date == as_of,
                AuditRun.data_fingerprint == fp, AuditRun.engine_version == ENGINE_VERSION,
                AuditRun.status.in_(("QUEUED", "RUNNING", "COMPLETED", "COMPLETED_WITH_EXCLUSIONS")),
            ).order_by(AuditRun.created_at.desc())
        )
        if existing is not None and existing.scope == scope:
            return existing, True
    seq = (db.scalar(select(func.count(AuditRun.id)).where(AuditRun.tenant_id == tenant_id)) or 0) + 1
    run = AuditRun(
        tenant_id=tenant_id, run_code=f"AUD-{period_start:%Y%m}-{seq:04d}", run_type=run_type, status="QUEUED",
        period_start=period_start, period_end=period_end, as_of_date=as_of, scope=scope, replay_of_run_id=replay_of,
        data_fingerprint=fp, engine_version=ENGINE_VERSION, triggered_by=user_id,
    )
    db.add(run)
    db.flush()
    db.add(Job(tenant_id=tenant_id, job_type="AUDIT_RUN", reference_id=run.id, created_by=user_id))
    record_audit(db, tenant_id, user_id, "AUDIT_QUEUED", "audit_run", run.id, run_code=run.run_code,
                 period=f"{period_start}..{period_end}", scope=scope)
    return run, False


def _persist(db: Session, run: AuditRun) -> str:
    tenant_id = run.tenant_id
    cust = run.scope.get("customer_ids") or None
    prod = run.scope.get("product_ids") or None
    build = build_expected_obligations(db, tenant_id, run.period_start, run.period_end, cust, prod)
    readiness = assess_readiness(db, tenant_id, run.period_start, run.period_end, cust, prod, build=build)
    customer_scope = set(cust) if cust else None
    matched = match_invoice_lines(db, tenant_id, run.period_start, run.period_end, build.obligations, customer_scope)

    # Upsert stable obligation identities (never duplicated across runs).
    if build.obligations:
        rows = [dict(tenant_id=tenant_id, obligation_key=o.key, customer_id=o.customer_id, contract_id=o.contract_id,
                     subscription_id=o.subscription_id, product_id=o.product_id, charge_type=o.charge_type,
                     period_start=o.period_start, period_end=o.period_end, first_seen_audit_run_id=run.id)
                for o in build.obligations]
        for i in range(0, len(rows), 1000):
            db.execute(pg_insert(BillingObligation).values(rows[i:i + 1000]).on_conflict_do_nothing(
                index_elements=["tenant_id", "obligation_key"]))
    ids = dict(db.execute(select(BillingObligation.obligation_key, BillingObligation.id).where(
        BillingObligation.tenant_id == tenant_id, BillingObligation.obligation_key.in_([o.key for o in build.obligations] or [""]))).all())

    tol = settings.MATCH_TOLERANCE
    components, results = [], []
    counts: dict[str, int] = {}
    expected_total = invoiced_total = under = over = Decimal("0")
    for m in matched.matches:
        o = m.obligation
        oid = ids[o.key]
        if o.calc:
            for seq, c in enumerate(o.calc.components, start=1):
                components.append(dict(
                    tenant_id=tenant_id, audit_run_id=run.id, obligation_id=oid, seq=seq, component_type=c.component_type,
                    contract_version_id=c.contract_version_id, pricing_rule_id=c.pricing_rule_id,
                    segment_start=c.segment_start, segment_end=c.segment_end, quantity=c.quantity, unit_price=c.unit_price,
                    amount=c.amount, formula=c.formula,
                    inputs={**c.inputs, "contract_version": c.contract_version_number, "pricing_rule": c.pricing_rule_ref}))
        out = evaluate(m, tol)
        counts[out.status] = counts.get(out.status, 0) + 1
        if out.status != "EXCLUDED":
            expected_total += out.expected
            invoiced_total += out.invoiced
            if out.status != "PENDING_REVIEW":
                under += max(Decimal("0"), out.expected - out.invoiced)
                over += max(Decimal("0"), out.invoiced - out.expected)
        calc = o.calc
        results.append(dict(
            tenant_id=tenant_id, audit_run_id=run.id, obligation_id=oid, invoice_line_id=None, customer_id=o.customer_id,
            product_id=o.product_id, charge_type=o.charge_type, period_start=o.period_start, period_end=o.period_end,
            status=out.status, expected_amount=out.expected, invoiced_amount=out.invoiced, variance=out.variance,
            expected_quantity=calc.expected_quantity if calc else None, invoiced_quantity=out.invoiced_quantity,
            expected_unit_price=calc.expected_unit_price if calc else None, invoiced_unit_price=out.invoiced_unit_price,
            expected_discount_pct=calc.expected_discount_pct if calc else None, invoiced_discount_pct=out.invoiced_discount_pct,
            match_method=out.match_method, match_confidence=out.confidence,
            matched_line_ids=[a.line.id for a in m.allocations], excluded_reason=o.exclusion_reason,
            explanation=out.explanation,
            details={**out.details, "obligation_key": o.key, "subscription_code": o.subscription_code,
                     "exclusion_code": o.exclusion_code, "ambiguous_line_ids": m.ambiguous_with_lines},
        ))
    for orphan in matched.orphans:
        ln = orphan.line
        counts["UNMATCHED_LINE"] = counts.get("UNMATCHED_LINE", 0) + 1
        invoiced_total += ln.line_amount
        results.append(dict(
            tenant_id=tenant_id, audit_run_id=run.id, obligation_id=None, invoice_line_id=ln.id, customer_id=ln.customer_id,
            product_id=ln.product_id, charge_type=ln.charge_type, period_start=ln.period_start or run.period_start,
            period_end=ln.period_end or run.period_end, status="PENDING_REVIEW", expected_amount=Decimal("0"),
            invoiced_amount=ln.line_amount, variance=ln.line_amount, invoiced_quantity=ln.quantity,
            invoiced_unit_price=ln.unit_price, invoiced_discount_pct=ln.discount_pct, match_method="UNMATCHED",
            match_confidence="NONE", matched_line_ids=[ln.id], excluded_reason="", explanation=orphan.reason,
            details={"invoice_number": ln.invoice_number, "unmatched_line": True},
        ))
    for i in range(0, len(components), 2000):
        db.execute(insert(BillingObligationComponent), components[i:i + 2000])
    for i in range(0, len(results), 1000):
        db.execute(insert(ReconciliationResult), results[i:i + 1000])

    pay = reconcile_payments(db, tenant_id, run.period_start, run.period_end, run.as_of_date, customer_scope)
    pay_rows = [dict(tenant_id=tenant_id, audit_run_id=run.id, **{k: getattr(p, k) for k in (
        "record_type", "status", "issue_code", "invoice_id", "payment_id", "customer_id", "invoice_total", "credits_applied",
        "payments_allocated", "outstanding", "payment_amount", "unallocated_amount", "days_past_due", "ageing_bucket",
        "explanation", "details")}) for p in pay]
    for i in range(0, len(pay_rows), 1000):
        db.execute(insert(PaymentReconciliationResult), pay_rows[i:i + 1000])

    inv_recs = [p for p in pay if p.record_type == "INVOICE"]
    pay_recs = [p for p in pay if p.record_type == "PAYMENT"]
    collectible = sum((p.invoice_total - p.credits_applied for p in inv_recs), Decimal("0"))
    collected = sum((p.payments_allocated for p in inv_recs), Decimal("0"))
    ageing = {b: to_json(money(sum((p.outstanding for p in inv_recs if p.ageing_bucket == b and p.outstanding > 0), Decimal("0"))))
              for b in AGEING_BUCKETS}
    in_scope = sum(v for k, v in counts.items() if k not in ("EXCLUDED", "UNMATCHED_LINE"))
    run.readiness = readiness
    run.expected_total = money(expected_total)
    run.invoiced_total = money(invoiced_total)
    run.variance_total = money(invoiced_total - expected_total)
    run.underbilled_total = money(under)
    run.overbilled_total = money(over)
    run.reconciliation_rate = pct(counts.get("MATCHED", 0), in_scope)
    run.summary = {
        **({"replay": run.summary["replay"]} if run.summary.get("replay") else {}),
        "status_counts": counts,
        "obligations": len(matched.matches),
        "obligations_in_scope": in_scope,
        "matched_records": counts.get("MATCHED", 0),
        "unmatched_records": in_scope - counts.get("MATCHED", 0) + counts.get("UNMATCHED_LINE", 0),
        "excluded_obligations": counts.get("EXCLUDED", 0),
        "unmatched_invoice_lines": counts.get("UNMATCHED_LINE", 0),
        "customers": len({m.obligation.customer_id for m in matched.matches}),
        "payments": {
            "invoices": len(inv_recs),
            "payments": len(pay_recs),
            "collectible": to_json(money(collectible)),
            "collected": to_json(money(collected)),
            "outstanding": to_json(money(sum((p.outstanding for p in inv_recs if p.outstanding > 0), Decimal("0")))),
            "collection_rate": to_json(pct(collected, collectible)),
            "collection_basis": f"Cash allocated by {run.as_of_date} to invoices issued {run.period_start}..{run.period_end}, "
                                "divided by their total less approved credits",
            "discrepancies": sum(1 for p in pay if p.status in ("DISCREPANCY", "OVER_APPLIED")),
            "unallocated_cash": to_json(money(sum((p.unallocated_amount for p in pay_recs if p.unallocated_amount > 0), Decimal("0")))),
            "ageing": ageing,
            "status_counts": {s: sum(1 for p in pay if p.status == s) for s in sorted({p.status for p in pay})},
        },
    }
    return "COMPLETED_WITH_EXCLUSIONS" if counts.get("EXCLUDED") or readiness["status"] == "INCOMPLETE" else "COMPLETED"


def _refresh_reporting(run_id: str) -> None:
    """Keep the Power BI unit-economics snapshot in step with completed standard audits. Best effort:
    a reporting refresh failure is logged and never changes the audit outcome."""
    try:
        from backend.app.reporting.refresh import refresh

        with session_scope() as db:
            run = db.get(AuditRun, run_id)
            if run is None or run.run_type != "STANDARD" or run.status not in ("COMPLETED", "COMPLETED_WITH_EXCLUSIONS"):
                return
            m, months = run.period_start.replace(day=1), []
            while m <= run.period_end:
                months.append(m)
                m = (m.replace(day=28) + timedelta(days=4)).replace(day=1)
            refresh(db, run.tenant_id, months)
    except Exception:  # noqa: BLE001
        log.exception("reporting refresh failed", extra={"audit_run_id": run_id})


def execute_audit_run(run_id: str, max_attempts: int = 3) -> None:
    """Background entry point with retry for transient database failures."""
    for attempt in range(1, max_attempts + 1):
        try:
            with session_scope() as db:  # visible RUNNING state, committed separately
                run = db.get(AuditRun, run_id)
                if run is None or run.status in FINAL_STATES:
                    return
                run.status, run.started_at = "RUNNING", datetime.now(UTC)
                job = db.scalar(select(Job).where(Job.reference_id == run_id, Job.job_type == "AUDIT_RUN"))
                if job:
                    job.status, job.attempts, job.started_at = "RUNNING", attempt, datetime.now(UTC)
            with session_scope() as db:  # all results in one transaction: complete or nothing
                run = db.get(AuditRun, run_id)
                job = db.scalar(select(Job).where(Job.reference_id == run_id, Job.job_type == "AUDIT_RUN"))
                started = time.perf_counter()
                replay = run.summary.get("replay") or {}
                cutoff = datetime.fromisoformat(replay["knowledge_cutoff"]) if replay.get("mode") == "AS_KNOWN" else None
                with knowledge_cutoff(cutoff):
                    final_status = _persist(db, run)
                if run.run_type == "REPLAY":  # analytical re-execution: never creates or changes exception cases
                    stats = {"skipped": "replay runs do not create exceptions"}
                else:
                    stats = persist_exceptions(db, run)
                by_cat = dict(db.execute(select(ExceptionCase.category, func.count(ExceptionCase.id))
                                         .where(ExceptionCase.last_seen_audit_run_id == run.id)
                                         .group_by(ExceptionCase.category)).all())
                run.summary = {**run.summary, "exceptions": {**stats, "by_category": by_cat}}
                # status + completion time last, in a single UPDATE (the run is immutable afterwards)
                run.status, run.completed_at = final_status, datetime.now(UTC)
                if job:
                    job.status, job.finished_at = "SUCCEEDED", datetime.now(UTC)
                record_audit(db, run.tenant_id, run.triggered_by, "AUDIT_COMPLETED", "audit_run", run.id,
                             run_code=run.run_code, status=run.status, seconds=round(time.perf_counter() - started, 2))
                notify(db, run.tenant_id, "AUDIT", f"Audit {run.run_code} completed",
                       f"Expected {run.expected_total}, invoiced {run.invoiced_total}, reconciliation rate {run.reconciliation_rate}%",
                       link=f"/reconciliation?run={run.id}",
                       severity="WARNING" if run.status == "COMPLETED_WITH_EXCLUSIONS" else "INFO")
                if run.run_type != "REPLAY":
                    n_high, impact = db.execute(select(func.count(ExceptionCase.id), func.coalesce(func.sum(ExceptionCase.financial_impact), 0))
                                                .where(ExceptionCase.audit_run_id == run.id,
                                                       ExceptionCase.severity.in_(("HIGH", "CRITICAL")))).one()
                    if n_high:
                        notify(db, run.tenant_id, "EXCEPTION", f"{n_high} new high-severity exception(s) in {run.run_code}",
                               f"New high or critical exceptions with a combined financial impact of {impact} were detected for "
                               f"{run.period_start:%b %Y}. Review and assign them.",
                               link="/exceptions?severity=HIGH", severity="HIGH")
                log.info("audit completed", extra={"audit_run_id": run.id})
            _refresh_reporting(run_id)
            return
        except OperationalError:
            log.warning("transient database error during audit; retrying", extra={"audit_run_id": run_id}, exc_info=True)
            time.sleep(min(2 ** attempt, 10))
        except Exception as exc:  # non-recoverable: mark the run FAILED with the reason
            log.exception("audit failed", extra={"audit_run_id": run_id})
            _mark_failed(run_id, f"{type(exc).__name__}: {exc}")
            return
    _mark_failed(run_id, "Gave up after repeated transient database errors")


def create_replay(db: Session, original: AuditRun, user_id: int | None, mode: str) -> AuditRun:
    """Historical replay.

    AS_KNOWN  – reproduce the original audit from the data as it existed when it completed
                (rows created later are hidden; later voids/reversals are undone).
    CURRENT   – re-run the same period/scope/as-of on today's corrected data.
    The original run is never modified."""
    if original.status not in ("COMPLETED", "COMPLETED_WITH_EXCLUSIONS"):
        raise AuditRequestError("Only completed audits can be replayed")
    if mode not in ("AS_KNOWN", "CURRENT"):
        raise AuditRequestError("mode must be AS_KNOWN or CURRENT")
    run, _ = create_audit_run(db, original.tenant_id, user_id, original.period_start, original.period_end, original.as_of_date,
                              original.scope.get("customer_ids") or None, original.scope.get("product_ids") or None,
                              reuse_if_unchanged=False, run_type="REPLAY", replay_of=original.id)
    replay = {"mode": mode, "original_run_id": original.id, "original_run_code": original.run_code,
              "original_engine_version": original.engine_version, "engine_version": ENGINE_VERSION}
    if mode == "AS_KNOWN":
        changes = in_place_changes_after(db, original.tenant_id, original.completed_at)
        replay.update({"knowledge_cutoff": original.completed_at.isoformat(), "in_place_changes": changes,
                       "complete": not changes and original.engine_version == ENGINE_VERSION,
                       "completeness_note": "All source records are reconstructable as of the original audit"
                       if not changes else "Some records were edited in place after the original audit; current values were used "
                                           "for them, so this replay is INCOMPLETE: " + ", ".join(f"{k}={v}" for k, v in changes.items())})
    run.summary = {"replay": replay}
    record_audit(db, original.tenant_id, user_id, "AUDIT_REPLAY_QUEUED", "audit_run", run.id, original=original.run_code, mode=mode)
    return run


def recover_stale_runs(db: Session, tenant_id: int | None = None, older_than_minutes: int | None = None) -> list[str]:
    """Recovery sweep: an audit whose worker died (process restart, serverless freeze) would otherwise stay
    QUEUED/RUNNING forever and block re-runs, because identical requests reuse it. Runs with no progress for
    longer than the threshold are marked FAILED with the reason, so the user can simply run the audit again.
    Results are written in one transaction, so a FAILED run never has partial results."""
    minutes = settings.AUDIT_STALE_MINUTES if older_than_minutes is None else older_than_minutes
    cutoff = datetime.now(UTC) - timedelta(minutes=minutes)
    q = select(AuditRun).where(AuditRun.status.in_(("QUEUED", "RUNNING")),
                               func.coalesce(AuditRun.started_at, AuditRun.created_at) < cutoff)
    if tenant_id is not None:
        q = q.where(AuditRun.tenant_id == tenant_id)
    recovered = []
    for run in db.scalars(q.with_for_update(skip_locked=True)).all():
        msg = (f"Interrupted: no progress for over {minutes} minutes (the worker stopped, e.g. a server restart). "
               "No partial results were saved. Run the audit again.")
        run.status, run.error_message, run.completed_at = "FAILED", msg, datetime.now(UTC)
        job = db.scalar(select(Job).where(Job.reference_id == run.id))
        if job and job.status not in ("SUCCEEDED", "FAILED"):
            job.status, job.error, job.finished_at = "FAILED", msg, datetime.now(UTC)
        notify(db, run.tenant_id, "AUDIT", f"Audit {run.run_code} was interrupted", msg, severity="ERROR",
               link=f"/reconciliation?run={run.id}")
        record_audit(db, run.tenant_id, None, "AUDIT_RECOVERED_AS_FAILED", "audit_run", run.id, run_code=run.run_code)
        log.warning("stale audit marked failed", extra={"audit_run_id": run.id})
        recovered.append(run.run_code)
    db.flush()
    return recovered


def _mark_failed(run_id: str, message: str) -> None:
    with session_scope() as db:
        run = db.get(AuditRun, run_id)
        if run is None or run.status in FINAL_STATES:
            return
        run.status, run.error_message, run.completed_at = "FAILED", message[:2000], datetime.now(UTC)
        job = db.scalar(select(Job).where(Job.reference_id == run_id))
        if job:
            job.status, job.error, job.finished_at = "FAILED", message[:2000], datetime.now(UTC)
        notify(db, run.tenant_id, "AUDIT", f"Audit {run.run_code} failed", message[:500], severity="ERROR")
