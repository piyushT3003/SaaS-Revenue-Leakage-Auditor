"""Billing + payment reconciliation, audit runs and the spec's required financial tests (1,2,3,6,7,9,10,11)."""
from datetime import date, datetime
from decimal import Decimal as Dec
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from backend.app.analytics import metrics as M
from backend.app.models import AuditRun, InvoiceLineAllocation, PaymentReconciliationResult, ReconciliationResult
from backend.app.reconciliation.obligations import build_expected_obligations
from backend.app.reconciliation.runner import create_audit_run, execute_audit_run
from backend.tests.factories import World

OCT = (date(2026, 10, 1), date(2026, 10, 31))
IST = ZoneInfo("Asia/Kolkata")


def audit(db, tenant_id, period=OCT, as_of=date(2026, 11, 14), **kw) -> AuditRun:
    db.commit()
    run, reused = create_audit_run(db, tenant_id, None, period[0], period[1], as_of, **kw)
    db.commit()
    if not reused:
        execute_audit_run(run.id)
    db.expire_all()
    return db.get(AuditRun, run.id)


def results(db, run) -> list[ReconciliationResult]:
    return list(db.scalars(select(ReconciliationResult).where(ReconciliationResult.audit_run_id == run.id)
                           .order_by(ReconciliationResult.id)))


@pytest.mark.parametrize("invoiced, status, variance", [
    ("10000", "MATCHED", "0.00"),        # TEST 1
    ("8000", "UNDERBILLED", "-2000.00"),  # TEST 2
    ("12000", "OVERBILLED", "2000.00"),   # TEST 3
])
def test_spec_tests_1_2_3_expected_vs_invoiced(db, tenant_id, invoiced, status, variance):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="10000")
    w.line(w.invoice(c, total=invoiced), s, invoiced, price=invoiced)
    run = audit(db, tenant_id)
    [r] = results(db, run)
    assert (r.expected_amount, r.invoiced_amount, r.status, r.variance) == (Dec("10000.00"), Dec(invoiced), status, Dec(variance))
    assert run.status == "COMPLETED"
    assert run.underbilled_total == (Dec("2000.00") if status == "UNDERBILLED" else Dec("0"))
    assert run.overbilled_total == (Dec("2000.00") if status == "OVERBILLED" else Dec("0"))


def test_missing_charge_and_unmatched_line(db, tenant_id):
    w = World(db, tenant_id)
    c, ctr, v, s = w.simple_recurring()
    other = w.product("P-OTHER")
    inv = w.invoice(c, total=500)
    w.line(inv, None, "500", product=other)  # no obligation exists for this product
    run = audit(db, tenant_id)
    by_status = {r.status: r for r in results(db, run)}
    assert by_status["MISSING_CHARGE"].expected_amount == Dec("10000.00")
    orphan = by_status["PENDING_REVIEW"]
    assert orphan.obligation_id is None and orphan.invoice_line_id is not None
    assert run.summary["unmatched_invoice_lines"] == 1


def test_split_lines_are_summed_and_composition_differences_flagged(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="1000", qty="10")
    inv = w.invoice(c, total=10000)
    w.line(inv, s, "5000", qty="5", price="1000", period=(date(2026, 10, 1), date(2026, 10, 15)))
    w.line(inv, s, "5000", qty="5", price="1000", n=2, period=(date(2026, 10, 16), date(2026, 10, 31)))
    run = audit(db, tenant_id)
    [r] = results(db, run)
    assert r.status == "MATCHED" and r.invoiced_quantity == Dec("10") and len(r.matched_line_ids) == 2


def test_amount_matches_but_rate_differs_is_partially_matched(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="1000", qty="10")
    w.line(w.invoice(c, total=10000), s, "10000", qty="8", price="1250")
    [r] = results(db, audit(db, tenant_id))
    assert r.status == "PARTIALLY_MATCHED" and "unit price" in r.explanation


def test_ambiguous_product_level_match_goes_to_review(db, tenant_id):
    w = World(db, tenant_id)
    p = w.product()
    c = w.customer()
    ctr = w.contract(c)
    v = w.version(ctr)
    w.rule(v, p, "1000")
    s1 = w.subscription(c, ctr, p, code="S-A")
    w.subscription(c, ctr, p, code="S-B")
    inv = w.invoice(c, total=1000)
    w.line(inv, None, "1000", product=p)  # no subscription reference, two candidate obligations
    rs = results(db, audit(db, tenant_id))
    assert sorted(r.status for r in rs) == ["PENDING_REVIEW"] * 3  # both obligations + the line
    assert all(r.status != "MISSING_CHARGE" for r in rs)
    assert s1  # silence linter


def test_explicit_obligation_reference_and_consolidated_allocation(db, tenant_id):
    w = World(db, tenant_id)
    p = w.product()
    c = w.customer()
    ctr = w.contract(c)
    v = w.version(ctr)
    w.rule(v, p, "1000")
    w.subscription(c, ctr, p, code="S-A")
    w.subscription(c, ctr, p, code="S-B")
    db.flush()
    keys = sorted(o.key for o in build_expected_obligations(db, tenant_id, *OCT).obligations)
    inv = w.invoice(c, total=2000)
    consolidated = w.line(inv, None, "2000", qty="2", price="1000", product=p)
    for k in keys:
        db.add(InvoiceLineAllocation(tenant_id=tenant_id, invoice_line_id=consolidated.id, obligation_key=k, amount=Dec("1000")))
    rs = results(db, audit(db, tenant_id))
    assert [r.status for r in rs] == ["MATCHED", "MATCHED"]
    assert {r.match_method for r in rs} == {"ALLOCATION_RULE"}


def test_duplicate_invoice_is_flagged_on_the_obligation(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    w.line(w.invoice(c, "INV-1", total=10000), s, "10000")
    w.line(w.invoice(c, "INV-2", total=10000), s, "10000")
    [r] = results(db, audit(db, tenant_id))
    assert r.status == "OVERBILLED" and r.details["duplicate_candidate"] is True and r.variance == Dec("10000.00")


def test_spec_test_10_contract_change_inside_period(db, tenant_id):
    w = World(db, tenant_id)
    p = w.product()
    c = w.customer()
    ctr = w.contract(c)
    w.rule(w.version(ctr, 1, date(2026, 1, 1), date(2026, 10, 15)), p, "500")
    w.rule(w.version(ctr, 2, date(2026, 10, 16)), p, "600")
    s = w.subscription(c, ctr, p, qty="10")
    w.line(w.invoice(c, total="5516.12"), s, "5516.12", qty="10", price="551.612")
    run = audit(db, tenant_id)
    [r] = results(db, run)
    assert r.expected_amount == Dec("5516.12") and r.status == "MATCHED"
    comps = db.execute(text("select seq, amount, inputs->>'contract_version' from billing_obligation_components "
                            "where audit_run_id=:r order by seq"), {"r": run.id}).all()
    assert [(a, v) for _, a, v in comps] == [(Dec("2419.35"), "1"), (Dec("3096.77"), "2")]


def test_version_gap_excludes_with_reason_and_marks_run(db, tenant_id):
    w = World(db, tenant_id)
    p = w.product()
    c = w.customer()
    ctr = w.contract(c)
    w.rule(w.version(ctr, 1, date(2026, 1, 1), date(2026, 9, 30)), p, "1000")
    s = w.subscription(c, ctr, p)
    w.line(w.invoice(c, total=1000), s, "1000")
    run = audit(db, tenant_id)
    [r] = results(db, run)
    assert r.status == "EXCLUDED" and "No contract version" in r.excluded_reason
    assert run.status == "COMPLETED_WITH_EXCLUSIONS"
    assert run.reconciliation_rate is None  # nothing in scope — not a fake 100 %
    assert any(ch["code"] == "VERSION_GAP" for ch in run.readiness["checks"])


def test_usage_without_any_signal_is_excluded_not_zero(db, tenant_id):
    w = World(db, tenant_id)
    p = w.product("P-API", "USAGE")
    c = w.customer()
    ctr = w.contract(c)
    w.rule(w.version(ctr), p, "2", charge="USAGE")
    w.subscription(c, ctr, p, code="S-API")
    w.invoice(c, total=0)
    [r] = results(db, audit(db, tenant_id))
    assert r.status == "EXCLUDED" and r.details["exclusion_code"] == "NO_USAGE_SIGNAL"


def test_usage_reconciliation_and_failed_batches_are_ignored(db, tenant_id):
    w = World(db, tenant_id)
    p = w.product("P-API", "USAGE")
    c = w.customer()
    ctr = w.contract(c)
    w.rule(w.version(ctr), p, "2", charge="USAGE", included="100")
    s = w.subscription(c, ctr, p, code="S-API")
    ok, failed = w.usage_batch("UB-OK"), w.usage_batch("UB-BAD", status="FAILED")
    w.usage(s, datetime(2026, 10, 5, 10, tzinfo=IST), 300, "E1", ok)
    w.usage(s, datetime(2026, 10, 6, 10, tzinfo=IST), 999, "E2", failed)  # excluded: failed delivery
    w.line(w.invoice(c, total=400), s, "400", qty="200", price="2", charge="USAGE")
    [r] = results(db, audit(db, tenant_id))
    assert (r.status, r.expected_amount, r.expected_quantity) == ("MATCHED", Dec("400.00"), Dec("200"))


def test_spec_test_6_outstanding_balance(db, tenant_id):
    w = World(db, tenant_id)
    c, *_ = w.simple_recurring()
    inv = w.invoice(c, total="12000", due=date(2026, 11, 30))
    w.allocate(w.payment(c, amount="8000"), inv, "8000")
    w.credit(c, inv, "1000")
    assert M.outstanding(db, tenant_id, date(2026, 11, 14)).value == Dec("3000.00")
    run = audit(db, tenant_id)
    rec = db.scalar(select(PaymentReconciliationResult).where(PaymentReconciliationResult.audit_run_id == run.id,
                                                              PaymentReconciliationResult.record_type == "INVOICE"))
    assert (rec.outstanding, rec.status, rec.credits_applied, rec.payments_allocated) == (Dec("3000.00"), "PARTIALLY_PAID", Dec("1000.00"), Dec("8000.00"))


def test_payment_reconciliation_discrepancies_and_overdue_is_not_one(db, tenant_id):
    w = World(db, tenant_id)
    c1, *_ = w.simple_recurring("C-1")
    c2, *_ = w.simple_recurring("C-2")
    inv1 = w.invoice(c1, "INV-1", total="1000", issue=date(2026, 10, 1), due=date(2026, 10, 2))  # overdue, unpaid
    inv2 = w.invoice(c2, "INV-2", total="1000", issue=date(2026, 10, 1))
    w.payment(c1, "PAY-UNALLOC", "500", ref="UTR-1")
    p_dup1 = w.payment(c2, "PAY-A", "1000", ref="UTR-9", received=date(2026, 10, 10))
    p_dup2 = w.payment(c2, "PAY-B", "1000", ref="UTR-9", received=date(2026, 10, 11))
    w.allocate(p_dup1, inv2, "1000")
    w.allocate(p_dup2, inv2, "1000")
    x = w.payment(c1, "PAY-X", "300", ref="UTR-3", remit="INV-404")
    w.allocate(x, inv2, "300")
    run = audit(db, tenant_id)
    pay = {r.details.get("payment_number") or r.details.get("invoice_number"): r for r in db.scalars(
        select(PaymentReconciliationResult).where(PaymentReconciliationResult.audit_run_id == run.id))}
    assert pay["INV-1"].status == "UNPAID" and pay["INV-1"].ageing_bucket == "31-60" and pay["INV-1"].issue_code == ""
    assert pay["PAY-UNALLOC"].issue_code == "UNALLOCATED_CASH"
    assert pay["PAY-A"].status == "ALLOCATED"
    assert pay["PAY-B"].issue_code == "DUPLICATE_TRANSACTION_REFERENCE"
    codes = {i["code"] for i in pay["PAY-X"].details["issues"]}
    assert {"INVALID_INVOICE_REFERENCE", "CROSS_CUSTOMER_ALLOCATION"} <= codes
    assert pay["INV-2"].status == "OVER_APPLIED" and pay["INV-2"].outstanding == Dec("-1300.00")


def test_spec_test_7_contribution_and_margin(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="10000")
    w.line(w.invoice(c, total="10000"), s, "10000")
    w.cost(w.product(), "7000", customer=c)
    metric, rows = M.contribution(db, tenant_id, *OCT)
    assert (rows[0]["contribution"], rows[0]["margin_pct"]) == (Dec("3000.00"), Dec("30.00"))
    assert metric.value == Dec("30.00") and rows[0]["segment"] == "PROFITABLE"


def test_pooled_costs_allocate_by_seats(db, tenant_id):
    w = World(db, tenant_id)
    c1, _, _, s1 = w.simple_recurring("C-1", qty="30")
    c2, _, _, s2 = w.simple_recurring("C-2", qty="10")
    w.cost(w.product(), "4000", cost_type="COMPUTE", basis="SEATS")
    costs, meta = M.direct_costs_by_customer(db, tenant_id, *OCT)
    assert costs[c1.id]["COMPUTE"] == Dec("3000.00") and costs[c2.id]["COMPUTE"] == Dec("1000.00")


def test_spec_test_9_repeated_identical_audit_is_reused(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    w.line(w.invoice(c, total=8000), s, "8000")
    first = audit(db, tenant_id)
    second = audit(db, tenant_id)
    assert first.id == second.id
    assert db.scalar(text("select count(*) from reconciliation_results")) == 1
    assert db.scalar(text("select count(*) from billing_obligations")) == 1


def test_spec_test_11_correction_rerun_keeps_history_immutable(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    line = w.line(w.invoice(c, total=8000), s, "8000")
    first = audit(db, tenant_id)
    assert results(db, first)[0].status == "UNDERBILLED"
    # authorised correction of the historical invoice line
    line.line_amount, line.unit_price = Dec("10000"), Dec("10000")
    db.commit()
    second = audit(db, tenant_id)
    assert second.id != first.id
    assert results(db, first)[0].status == "UNDERBILLED"   # previous audit unchanged
    assert results(db, second)[0].status == "MATCHED"      # new audit sees the correction
    assert db.scalar(text("select count(*) from billing_obligations")) == 1  # same stable obligation identity


def test_results_and_completed_runs_are_immutable_in_the_database(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    w.line(w.invoice(c, total=10000), s, "10000")
    run = audit(db, tenant_id)
    for stmt in ("update reconciliation_results set variance = 0", "delete from reconciliation_results",
                 "update billing_obligation_components set amount = 0", f"update audit_runs set expected_total = 0 where id='{run.id}'",
                 f"delete from audit_runs where id='{run.id}'"):
        with pytest.raises(DBAPIError):
            db.execute(text(stmt))
        db.rollback()


def test_scope_filters_customers(db, tenant_id):
    w = World(db, tenant_id)
    c1, _, _, s1 = w.simple_recurring("C-1")
    c2, _, _, s2 = w.simple_recurring("C-2")
    run = audit(db, tenant_id, customer_ids=[c2.id])
    assert {r.customer_id for r in results(db, run)} == {c2.id}
    assert run.scope["customer_ids"] == [c2.id]


def test_recovery_marks_stuck_runs_failed_and_allows_a_rerun(db, tenant_id):
    """A worker that dies mid-audit leaves the run RUNNING. The sweep marks it FAILED (no partial results),
    and the next identical request starts a fresh run instead of reusing the dead one."""
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    w.line(w.invoice(c, total=8000), s, "8000")
    db.commit()
    stuck, _ = create_audit_run(db, tenant_id, None, *OCT, date(2026, 11, 14))
    db.execute(text("update audit_runs set status='RUNNING', started_at = now() - interval '2 hours' where id = :i"), {"i": stuck.id})
    db.commit()
    fresh = audit(db, tenant_id)  # create_audit_run sweeps first
    db.expire_all()
    old = db.get(AuditRun, stuck.id)
    assert old.status == "FAILED" and "Interrupted" in old.error_message
    assert db.scalar(text("select count(*) from reconciliation_results where audit_run_id = :i"), {"i": old.id}) == 0
    assert fresh.id != stuck.id and fresh.status == "COMPLETED"


def test_recovery_leaves_recent_runs_alone(db, tenant_id):
    from backend.app.reconciliation.runner import recover_stale_runs
    World(db, tenant_id).simple_recurring()
    db.commit()
    run, _ = create_audit_run(db, tenant_id, None, *OCT, date(2026, 11, 14))
    db.commit()
    assert recover_stale_runs(db, tenant_id) == []
    db.expire_all()
    assert db.get(AuditRun, run.id).status == "QUEUED"
