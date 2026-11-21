"""Measure reconciliation against the synthetic dataset's known injected anomalies.

At this stage (before the eight-category classifier) we measure *discrepancy detection* at
obligation / payment grain: precision = flagged items that are real anomalies, recall = real
anomalies that were flagged."""
from datetime import date

import pytest
from sqlalchemy import select

from backend.app.models import PaymentReconciliationResult, ReconciliationResult, SyntheticGroundTruth, Tenant
from backend.app.reconciliation.runner import create_audit_run, execute_audit_run
from backend.app.seed.synthetic import seed_demo_dataset

MONTHS = [(date(2026, m, 1), date(2026, m, d)) for m, d in ((5, 31), (6, 30), (7, 31), (8, 31), (9, 30), (10, 31))]
BILLING = {"UNDERBILLING", "OVERBILLING", "MISSING_CHARGE", "DISCOUNT_DRIFT", "PRICING_MISMATCH", "UNBILLED_USAGE"}


@pytest.fixture
def seeded(db, tenant_id):
    tenant = db.get(Tenant, tenant_id)
    assert seed_demo_dataset(db, tenant)
    db.commit()
    runs = []
    for start, end in MONTHS:
        run, _ = create_audit_run(db, tenant_id, None, start, end, date(2026, 11, 14))
        db.commit()
        execute_audit_run(run.id)
        runs.append(run.id)
    db.expire_all()
    return runs


def test_reconciliation_precision_and_recall_on_ground_truth(db, seeded):
    truth = list(db.scalars(select(SyntheticGroundTruth)))
    billing_truth = {t.reference for t in truth if t.category in BILLING}
    dup_customers = {t.customer_code for t in truth if t.category == "DUPLICATE_INVOICE"}
    flagged, dup_flagged = set(), set()
    for r in db.scalars(select(ReconciliationResult).where(ReconciliationResult.audit_run_id.in_(seeded),
                                                           ReconciliationResult.obligation_id.is_not(None))):
        if r.status in ("UNDERBILLED", "OVERBILLED", "MISSING_CHARGE", "PARTIALLY_MATCHED", "PENDING_REVIEW"):
            if r.details.get("duplicate_candidate"):
                dup_flagged.add(r.details["obligation_key"])
            else:
                flagged.add(r.details["obligation_key"])
    tp = flagged & billing_truth
    precision = len(tp) / len(flagged)
    recall = len(tp) / len(billing_truth)
    assert recall == 1.0, sorted(billing_truth - flagged)
    assert precision == 1.0, sorted(flagged - billing_truth)
    assert dup_flagged and dup_customers  # duplicate invoice detected via its obligations

    pay_truth = {t.reference for t in truth if t.category == "PAYMENT_DISCREPANCY"}
    pay_flagged = {p.details["payment_number"] for p in db.scalars(select(PaymentReconciliationResult).where(
        PaymentReconciliationResult.audit_run_id.in_(seeded), PaymentReconciliationResult.record_type == "PAYMENT",
        PaymentReconciliationResult.status == "DISCREPANCY"))}
    assert pay_flagged == pay_truth


def test_incomplete_scopes_are_reported_and_usage_integrity_warned(db, seeded):
    from backend.app.models import AuditRun

    oct_run = db.get(AuditRun, seeded[-1])
    sep_run = db.get(AuditRun, seeded[-2])
    assert oct_run.status == "COMPLETED_WITH_EXCLUSIONS"
    codes = {c["code"]: c for c in oct_run.readiness["checks"]}
    assert codes["VERSION_GAP"]["severity"] == "WARNING" and len(codes["VERSION_GAP"]["affected_customers"]) == 3
    # spec TEST 12: control total differs from ingested events
    sep_codes = {c["code"]: c for c in sep_run.readiness["checks"]}
    assert "UB-STOR-202609" in sep_codes["USAGE_CONTROL_TOTALS"]["message"]


def test_exception_classification_precision_recall_f1(db, seeded):
    """Per-category detection quality of the eight rules against injected ground truth."""
    from collections import Counter

    from backend.app.models import ExceptionCase, Invoice, Payment

    truth = list(db.scalars(select(SyntheticGroundTruth).where(SyntheticGroundTruth.category != "USAGE_INTEGRITY")))
    inv_no = dict(db.execute(select(Invoice.id, Invoice.invoice_number)).all())
    pay_no = dict(db.execute(select(Payment.id, Payment.payment_number)).all())
    detected = set()
    for e in db.scalars(select(ExceptionCase)):
        if e.category == "DUPLICATE_INVOICE":
            ref = inv_no[e.invoice_id]
        elif e.category == "PAYMENT_DISCREPANCY":
            ref = pay_no.get(e.payment_id, e.exposure_key)
        else:
            ref = e.exposure_key
        detected.add((e.category, ref))
    expected = {(t.category, t.reference) for t in truth}
    tp, fp, fn = expected & detected, detected - expected, expected - detected
    per_cat = {}
    for cat in {c for c, _ in expected | detected}:
        t = sum(1 for c, _ in tp if c == cat)
        p_ = t / max(1, sum(1 for c, _ in detected if c == cat))
        r_ = t / max(1, sum(1 for c, _ in expected if c == cat))
        per_cat[cat] = (round(p_, 3), round(r_, 3), round(0 if p_ + r_ == 0 else 2 * p_ * r_ / (p_ + r_), 3))
    print("per-category (precision, recall, F1):", per_cat)
    assert not fn, sorted(fn)
    assert not fp, sorted(fp)
    assert len(detected) == len(expected) == len(truth)
    assert Counter(c for c, _ in detected) == Counter(t.category for t in truth)
