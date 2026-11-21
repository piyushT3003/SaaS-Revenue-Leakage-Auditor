"""Advanced modules: historical replay, evidence graph, usage integrity, billing-rules regression lab,
root cause, prioritization, what-if simulator, evidence packs."""
from datetime import date

import pytest
from sqlalchemy import select, text

from backend.app.models import AuditRun, PricingRule, Tenant, UsageBatch
from backend.app.reconciliation.runner import create_audit_run, execute_audit_run
from backend.app.seed.synthetic import seed_demo_dataset
from backend.tests.factories import World
from backend.tests.test_reconciliation import audit

P = "period_start=2026-10-01&period_end=2026-10-31"


@pytest.fixture
def october(db, tenant_id):
    assert seed_demo_dataset(db, db.get(Tenant, tenant_id))
    db.commit()
    run, _ = create_audit_run(db, tenant_id, None, date(2026, 10, 1), date(2026, 10, 31), date(2026, 11, 14))
    db.commit()
    execute_audit_run(run.id)
    db.expire_all()
    return db.get(AuditRun, run.id)


# ---------------------------------------------------------------- replay (spec test 11)
def _underbilled_world(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="1000", qty="10")
    inv = w.invoice(c, total="8000")
    ln = w.line(inv, s, "8000", qty="8", price="1000")
    pay = w.payment(c, "PAY-1", "8000")
    w.allocate(pay, inv, "8000")
    return inv, ln


def test_as_known_replay_reproduces_original_after_correction_and_current_replay_reflects_it(db, tenant_id, client, admin):
    inv, ln = _underbilled_world(db, tenant_id)
    original = audit(db, tenant_id)
    assert str(original.underbilled_total) == "2000.00"
    r = client.post(f"/api/v1/billing/invoices/{inv.id}/correct", headers=admin,
                    json={"reason": "Seat count corrected to contract", "lines": [{"line_id": ln.id, "quantity": "10"}]})
    assert r.status_code == 201, r.text

    known = client.post(f"/api/v1/audits/{original.id}/replay", headers=admin, json={"mode": "AS_KNOWN"})
    assert known.status_code == 202, known.text
    k = known.json()
    assert k["replay"]["mode"] == "AS_KNOWN" and k["replay"]["complete"] is True
    kr = client.get(f"/api/v1/audits/{k['id']}", headers=admin).json()
    assert kr["underbilled_total"] == "2000.00"  # same answer as the original, despite the correction
    assert kr["expected_total"] == client.get(f"/api/v1/audits/{original.id}", headers=admin).json()["expected_total"]

    current = client.post(f"/api/v1/audits/{original.id}/replay", headers=admin, json={"mode": "CURRENT"}).json()
    assert client.get(f"/api/v1/audits/{current['id']}", headers=admin).json()["underbilled_total"] == "0.00"
    # The original run is untouched and replays do not create or reopen exception cases.
    assert client.get(f"/api/v1/audits/{original.id}", headers=admin).json()["underbilled_total"] == "2000.00"
    assert db.execute(text("select count(*) from exceptions where audit_run_id in (:a, :b)"),
                      {"a": k["id"], "b": current["id"]}).scalar() == 0


def test_replay_requires_completed_run_and_valid_mode(db, tenant_id, client, admin, viewer):
    _underbilled_world(db, tenant_id)
    original = audit(db, tenant_id)
    assert client.post(f"/api/v1/audits/{original.id}/replay", headers=admin, json={"mode": "LATER"}).status_code == 422
    assert client.post(f"/api/v1/audits/{original.id}/replay", headers=viewer, json={"mode": "AS_KNOWN"}).status_code == 403
    assert client.post("/api/v1/audits/nope/replay", headers=admin, json={"mode": "AS_KNOWN"}).status_code == 404


# ---------------------------------------------------------------- evidence graph (spec test 12)
def test_evidence_graph_traces_exception_to_contract_rule_invoice_and_payment(october, client, admin):
    cases = client.get(f"/api/v1/exceptions?{P}&category=UNDERBILLING", headers=admin).json()["items"]
    assert cases
    g = client.get(f"/api/v1/evidence-graph?exception_id={cases[0]['id']}", headers=admin)
    assert g.status_code == 200, g.text
    g = g.json()
    kinds = {n["type"] for n in g["nodes"]}
    assert {"exception", "obligation", "contract_version", "pricing_rule", "subscription", "customer"} <= kinds
    ids = {n["id"] for n in g["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])  # no dangling edges
    assert client.get("/api/v1/evidence-graph", headers=admin).status_code == 422
    assert client.get("/api/v1/evidence-graph?exception_id=999999", headers=admin).status_code == 404


# ---------------------------------------------------------------- usage integrity (spec test 13)
def test_usage_integrity_reports_control_total_gap_and_blocks_reprocess_until_reconciled(october, db, client, admin):
    rep = client.get("/api/v1/usage-integrity?period_start=2026-09-01&period_end=2026-09-30", headers=admin).json()
    codes = {i["code"] for i in rep["issues"]}
    assert "CONTROL_COUNT_MISMATCH" in codes
    assert "2026-09" in " ".join(rep["summary"]["affected_billing_periods"])
    assert "no claim" in rep["completeness_note"]
    b = db.scalar(select(UsageBatch).where(UsageBatch.batch_code == "UB-STOR-202609"))
    b.status = "FAILED"
    db.commit()
    r = client.post(f"/api/v1/usage-integrity/batches/{b.id}/reprocess", headers=admin)
    assert r.status_code == 409 and "Control total" in r.json()["detail"]


# ---------------------------------------------------------------- regression lab (spec test 14)
def test_regression_lab_flags_changed_cases_requires_sod_and_never_auto_activates(db, tenant_id, client, admin, analyst):
    w = World(db, tenant_id)
    c, _, _, _ = w.simple_recurring(price="1000", qty="10")
    db.commit()
    rule = db.scalar(select(PricingRule).where(PricingRule.tenant_id == tenant_id, PricingRule.status == "ACTIVE"))
    prop = client.post(f"/api/v1/rules/{rule.id}/propose", headers=analyst, json={"changes": {"unit_price": "1100"}})
    assert prop.status_code == 201, prop.text
    pid = prop.json()["id"]
    suite = client.post("/api/v1/regression/suites", headers=analyst,
                        json={"name": "Price uplift", "proposed_rule_ids": [pid], "period_start": "2026-10-01", "period_end": "2026-10-31"})
    assert suite.status_code == 201, suite.text
    s = suite.json()
    assert s["failed"] == 1 and s["total_difference"] == "1000.00" and s["approval_status"] == "DRAFT"
    detail = client.get(f"/api/v1/regression/suites/{s['id']}", headers=admin).json()
    assert detail["results"]["items"][0]["difference"] == "1000.00"
    # Nothing changed yet: the proposed rule is not used by audits.
    assert db.get(PricingRule, pid).status == "PROPOSED" and db.get(PricingRule, rule.id).status == "ACTIVE"
    assert client.post(f"/api/v1/regression/suites/{s['id']}/activate", headers=admin, json={"effective_from": "2026-11-01"}).status_code == 409
    sub = client.post(f"/api/v1/regression/suites/{s['id']}/decision", headers=admin, json={"decision": "SUBMIT"})
    assert sub.status_code == 200
    assert client.post(f"/api/v1/regression/suites/{s['id']}/decision", headers=admin, json={"decision": "APPROVED"}).status_code == 403  # SoD
    assert client.post(f"/api/v1/regression/suites/{s['id']}/decision", headers=analyst, json={"decision": "APPROVED"}).status_code == 403  # permission
    # A second admin approves.
    from backend.tests.conftest import _login, PASSWORD  # noqa: F401
    from backend.app.models import Role, User
    from backend.app.security.auth import hash_password

    role = db.scalar(select(Role).where(Role.name == "ADMIN"))
    db.add(User(tenant_id=tenant_id, email="admin2@test.local", full_name="Second Admin", role_id=role.id,
                password_hash=hash_password(PASSWORD), is_active=True))
    db.commit()
    admin2 = _login(client, "admin2@test.local")
    assert client.post(f"/api/v1/regression/suites/{s['id']}/decision", headers=admin2, json={"decision": "APPROVED"}).status_code == 200
    act = client.post(f"/api/v1/regression/suites/{s['id']}/activate", headers=admin2, json={"effective_from": "2026-11-01"})
    assert act.status_code == 200, act.text
    db.expire_all()
    old, new = db.get(PricingRule, rule.id), db.get(PricingRule, pid)
    assert old.status == "RETIRED" and str(old.effective_to) == "2026-10-31"
    assert new.status == "ACTIVE" and str(new.effective_from) == "2026-11-01"
    # October is still priced with the old rule (history is not repriced).
    assert str(audit(db, tenant_id).expected_total) == "10000.00"


# ---------------------------------------------------------------- what-if simulator (spec test 15)
def test_simulation_is_hypothetical_and_never_changes_stored_data(october, db, client, admin):
    before = db.execute(text("select coalesce(sum(unit_price),0), count(*) from pricing_rules")).one()
    body = {"name": "Core +10%", "assumptions": {"price_change_pct": {"P-CORE": 10}}, "period_start": "2026-10-01", "period_end": "2026-10-31"}
    prev = client.post("/api/v1/simulations/preview", headers=admin, json=body)
    assert prev.status_code == 200, prev.text
    p = prev.json()
    assert p["hypothetical"] is True and float(p["delta"]["revenue"]) > 0
    sc = client.post("/api/v1/simulations", headers=admin, json=body).json()
    run = client.post(f"/api/v1/simulations/{sc['id']}/run", headers=admin)
    assert run.status_code == 200 and run.json()["delta"]["revenue"] == p["delta"]["revenue"]
    dup = client.post(f"/api/v1/simulations/{sc['id']}/duplicate", headers=admin).json()
    assert dup["duplicated_from_id"] == sc["id"]
    x = client.get(f"/api/v1/simulations/{sc['id']}/export", headers=admin)
    assert x.status_code == 200 and x.content[:2] == b"PK"
    after = db.execute(text("select coalesce(sum(unit_price),0), count(*) from pricing_rules")).one()
    assert tuple(before) == tuple(after)
    assert client.post("/api/v1/simulations/preview", headers=admin,
                       json={**body, "assumptions": {"delete_invoices": True}}).status_code == 422


# ---------------------------------------------------------------- root cause, prioritization, evidence packs
def test_root_cause_prioritization_and_evidence_pack(october, client, admin, viewer):
    rc = client.get(f"/api/v1/root-cause?{P}", headers=admin).json()
    assert "clusters" in rc
    for cl in rc["clusters"]:
        members = client.get(f"/api/v1/exceptions?{P}&page_size=200", headers=admin).json()["items"]
        gross = sum(float(m["financial_impact"]) for m in members if m["id"] in cl["exception_ids"])
        assert float(cl["unique_exposure"]) <= gross + 0.001  # shared exposure is never double counted
    pr = client.get(f"/api/v1/prioritization?{P}", headers=admin).json()["ranked"]
    assert pr and all(0 <= float(r["score"]) <= 100 for r in pr)
    assert [float(r["score"]) for r in pr] == sorted((float(r["score"]) for r in pr), reverse=True)
    ids = [pr[0]["id"]]
    pack = client.post("/api/v1/evidence-packs", headers=admin, json={"exception_ids": ids, "format": "pdf"})
    assert pack.status_code == 201, pack.text
    dl = client.get(pack.json()["download"], headers=viewer)
    assert dl.status_code == 200 and dl.content[:4] == b"%PDF"
    import hashlib

    assert hashlib.sha256(dl.content).hexdigest() == pack.json()["sha256"]
    assert client.post("/api/v1/evidence-packs", headers=viewer, json={"exception_ids": ids}).status_code == 403
    xl = client.post("/api/v1/evidence-packs", headers=admin, json={"exception_ids": ids, "format": "xlsx"})
    assert xl.status_code == 201
