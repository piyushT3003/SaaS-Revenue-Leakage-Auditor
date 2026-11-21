"""Phase 5: eight-category classification, dedupe across runs, lifecycle API, ground-truth P/R/F1."""
from datetime import date
from decimal import Decimal as Dec

from sqlalchemy import func, select, text

from backend.app.models import ExceptionCase, ExceptionEvidence
from backend.tests.factories import World
from backend.tests.test_reconciliation import audit


def cases(db):
    return list(db.scalars(select(ExceptionCase).order_by(ExceptionCase.id)))


def test_spec_test_4_discount_drift(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="10000", discount="10")  # contract: 10 %
    w.line(w.invoice(c, total="8500"), s, "8500", price="10000", discount_pct="15")  # invoice: 15 %
    audit(db, tenant_id)
    [e] = cases(db)
    assert e.category == "DISCOUNT_DRIFT" and e.financial_impact == Dec("500.00") and e.counts_toward_leakage
    assert "15% discount applied vs 10% in contract" == e.title
    assert {ev.evidence_type for ev in db.scalars(select(ExceptionEvidence))} >= {"CALCULATION", "CONTRACT_VERSION", "PRICING_RULE", "INVOICE_LINE"}


def test_spec_test_5_pricing_mismatch(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="500", qty="10")
    w.line(w.invoice(c, total="6000"), s, "6000", qty="10", price="600")
    audit(db, tenant_id)
    [e] = cases(db)
    assert e.category == "PRICING_MISMATCH" and e.financial_impact == Dec("1000.00") and not e.counts_toward_leakage
    assert e.title == "Invoiced at ₹600/unit vs contract ₹500/unit"


def test_categories_underbilling_overbilling_missing_unbilled(db, tenant_id):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    w = World(db, tenant_id)
    c1, _, _, s1 = w.simple_recurring("C-1", price="1000", qty="10")
    w.line(w.invoice(c1, "I-1", total=8000), s1, "8000", qty="8", price="1000")
    c2, _, _, s2 = w.simple_recurring("C-2", price="1000", qty="10")
    w.line(w.invoice(c2, "I-2", total=12000), s2, "12000", qty="12", price="1000")
    w.simple_recurring("C-3")  # never invoiced
    p = w.product("P-API", "USAGE")
    c4 = w.customer("C-4")
    ctr = w.contract(c4, "CTR-4")
    w.rule(w.version(ctr), p, "2", charge="USAGE")
    s4 = w.subscription(c4, ctr, p, code="S-API")
    w.usage(s4, datetime(2026, 10, 3, 9, tzinfo=ZoneInfo("Asia/Kolkata")), 50, "E1", w.usage_batch())
    audit(db, tenant_id)
    got = {e.category: e for e in cases(db)}
    assert set(got) == {"UNDERBILLING", "OVERBILLING", "MISSING_CHARGE", "UNBILLED_USAGE"}
    assert got["UNBILLED_USAGE"].title == "50 billable units of usage not invoiced"
    assert got["OVERBILLING"].counts_toward_leakage is False


def test_spec_test_9_repeated_audits_do_not_duplicate_exceptions(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    ln = w.line(w.invoice(c, total=8000), s, "8000")
    first = audit(db, tenant_id)
    audit(db, tenant_id, as_of=date(2026, 11, 20))  # a genuinely new run on the same data
    assert db.scalar(select(func.count(ExceptionCase.id))) == 1
    e = cases(db)[0]
    assert e.audit_run_id == first.id and e.last_seen_audit_run_id != first.id


def test_resolved_case_reopens_when_redetected(db, tenant_id, client, admin):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    w.line(w.invoice(c, total=8000), s, "8000")
    audit(db, tenant_id)
    e = cases(db)[0]
    r = client.post(f"/api/v1/exceptions/{e.id}/status", headers=admin, json={"status": "RESOLVED", "reason": "short"})
    assert r.status_code == 422
    assert client.post(f"/api/v1/exceptions/{e.id}/status", headers=admin,
                       json={"status": "RESOLVED", "reason": "Credit note issued to customer"}).status_code == 200
    audit(db, tenant_id, as_of=date(2026, 11, 25))
    db.expire_all()
    e = db.get(ExceptionCase, e.id)
    assert e.status == "OPEN"
    hist = client.get(f"/api/v1/exceptions/{e.id}", headers=admin).json()["history"]
    assert [h["to"] for h in hist] == ["OPEN", "RESOLVED", "OPEN"]


def test_exception_api_workflow_and_permissions(db, tenant_id, client, admin, viewer):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    w.line(w.invoice(c, total=8000), s, "8000")
    audit(db, tenant_id)
    lst = client.get("/api/v1/exceptions?status=OPEN&sort=-impact", headers=viewer).json()
    assert lst["total"] == 1 and lst["items"][0]["financial_impact"] == "2000.00"
    eid = lst["items"][0]["id"]
    assert client.post(f"/api/v1/exceptions/{eid}/notes", headers=viewer, json={"body": "hi"}).status_code == 403
    people = client.get("/api/v1/exceptions/assignees/list", headers=admin).json()
    analyst = next(p for p in people if p["role"] == "ANALYST")
    assert client.post(f"/api/v1/exceptions/{eid}/assign", headers=admin, json={"user_id": analyst["id"]}).status_code == 200
    assert client.post(f"/api/v1/exceptions/{eid}/notes", headers=admin, json={"body": "Checked contract v1 — seats 1"}).status_code == 201
    assert client.post(f"/api/v1/exceptions/{eid}/status", headers=admin, json={"status": "IN_PROGRESS"}).status_code == 200
    d = client.get(f"/api/v1/exceptions/{eid}", headers=admin).json()
    assert d["owner"]["name"] == "Test Analyst" and d["notes"][0]["body"].startswith("Checked") and d["evidence"]
    s = client.get("/api/v1/exceptions/summary", headers=viewer).json()
    assert (s["total"], s["in_progress"], s["financial_exposure"], s["unique_leakage_exposure"]) == (1, 1, "2000.00", "2000.00")
    assert db.execute(text("select count(*) from audit_logs where action like 'EXCEPTION_%'")).scalar() == 3
