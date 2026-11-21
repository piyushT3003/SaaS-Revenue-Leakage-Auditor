"""Page APIs: billing workflows (draft coverage, correction → re-audit, allocations, credits SoD), customers,
unit economics, overview, search, settings, notifications."""
from datetime import date

from sqlalchemy import text

from backend.tests.factories import World
from backend.tests.test_reconciliation import audit

P = "period_start=2026-10-01&period_end=2026-10-31"


def test_draft_invoice_only_covers_unbilled_obligations_and_cannot_double_bill(db, tenant_id, client, admin):
    w = World(db, tenant_id)
    p = w.product()
    c = w.customer()
    ctr = w.contract(c)
    v = w.version(ctr)
    w.rule(v, p, "1000")
    s1 = w.subscription(c, ctr, p, code="S-A")
    w.subscription(c, ctr, p, code="S-B", qty="2")
    w.line(w.invoice(c, total=1000), s1, "1000")  # S-A already billed
    db.commit()
    body = {"customer_id": c.id, "period_start": "2026-10-01", "period_end": "2026-10-31"}
    prev = client.post("/api/v1/billing/invoices/draft/preview", headers=admin, json=body).json()
    assert [e["subscription"] for e in prev["eligible"]] == ["S-B"] and prev["subtotal"] == "2000.00"
    draft = client.post("/api/v1/billing/invoices/draft", headers=admin, json=body)
    assert draft.status_code == 201 and draft.json()["status"] == "DRAFT"
    again = client.post("/api/v1/billing/invoices/draft", headers=admin, json=body)
    assert again.status_code == 409  # the draft already covers S-B
    assert client.post(f"/api/v1/billing/invoices/{draft.json()['id']}/issue", headers=admin, json={}).status_code == 200


def test_correction_voids_original_and_reaudit_shows_resolution(db, tenant_id, client, admin):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="1000", qty="10")
    inv = w.invoice(c, total="8000")
    ln = w.line(inv, s, "8000", qty="8", price="1000")
    pay = w.payment(c, "PAY-1", "8000")
    w.allocate(pay, inv, "8000")
    first = audit(db, tenant_id)
    r = client.post(f"/api/v1/billing/invoices/{inv.id}/correct", headers=admin,
                    json={"reason": "Seat count corrected to contract", "lines": [{"line_id": ln.id, "quantity": "10"}]})
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["total"] == "10000.00" and new["replaces_invoice_id"] == inv.id
    assert db.execute(text("select status from invoices where id=:i"), {"i": inv.id}).scalar() == "VOID"
    second = audit(db, tenant_id)
    cmp = client.get(f"/api/v1/audits/{first.id}/compare/{second.id}", headers=admin).json()
    assert cmp["counts"]["resolved"] == 1 and cmp["counts"]["remaining"] == 0
    assert client.get(f"/api/v1/audits/{first.id}", headers=admin).json()["underbilled_total"] == "2000.00"  # history intact


def test_payment_allocation_rules(db, tenant_id, client, admin):
    w = World(db, tenant_id)
    c1, *_ = w.simple_recurring("C-1")
    c2, *_ = w.simple_recurring("C-2")
    inv = w.invoice(c1, total="1000")
    db.commit()
    p = client.post("/api/v1/billing/payments", headers=admin, json={"customer_id": c1.id, "received_on": "2026-10-10",
                                                                     "amount": "1500", "transaction_reference": "UTR-77"}).json()
    dup = client.post("/api/v1/billing/payments", headers=admin, json={"customer_id": c1.id, "received_on": "2026-10-10",
                                                                       "amount": "1500", "transaction_reference": "UTR-77"})
    assert dup.status_code == 409
    assert client.post(f"/api/v1/billing/payments/{p['id']}/allocate", headers=admin, json={"invoice_id": inv.id, "amount": "1200"}).status_code == 409
    assert client.post(f"/api/v1/billing/payments/{p['id']}/allocate", headers=admin, json={"invoice_id": inv.id, "amount": "1000"}).status_code == 201
    other = w.invoice(c2, "INV-2", total="100")
    db.commit()
    assert client.post(f"/api/v1/billing/payments/{p['id']}/allocate", headers=admin, json={"invoice_id": other.id, "amount": "100"}).status_code == 409
    pays = client.get("/api/v1/billing/payments?allocation=PARTIAL", headers=admin).json()["items"]
    assert pays[0]["verification_status"] == "UNVERIFIED" and pays[0]["unallocated"] == "500.00"


def test_credit_requires_second_person_approval(db, tenant_id, client, admin):
    from backend.tests.conftest import _login

    w = World(db, tenant_id)
    c, *_ = w.simple_recurring()
    db.execute(text("update users set role_id=(select id from roles where name='ADMIN') where email='analyst@test.local'"))
    db.commit()
    other_admin = _login(client, "analyst@test.local")
    cr = client.post("/api/v1/billing/credits", headers=admin, json={"customer_id": c.id, "adjustment_type": "CREDIT_NOTE",
                                                                     "amount": "500", "reason": "Goodwill for outage",
                                                                     "effective_date": "2026-10-20"}).json()
    assert client.post(f"/api/v1/billing/credits/{cr['id']}/decision", headers=admin, json={"decision": "APPROVED"}).status_code == 403
    assert client.post(f"/api/v1/billing/credits/{cr['id']}/decision", headers=other_admin, json={"decision": "APPROVED"}).status_code == 200


def test_read_pages_respond(db, tenant_id, client, viewer):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="10000")
    w.line(w.invoice(c, total="8000"), s, "8000")
    w.cost(w.product(), "3000", customer=c)
    audit(db, tenant_id)
    for url in (f"/api/v1/overview/trend?end=2026-10-31", f"/api/v1/overview/profitability?{P}", "/api/v1/search?q=cust",
                f"/api/v1/customers/summary?{P}", f"/api/v1/customers?{P}", f"/api/v1/customers/{c.id}?{P}",
                f"/api/v1/billing/summary?{P}", "/api/v1/billing/invoices", "/api/v1/billing/payments", "/api/v1/billing/credits",
                f"/api/v1/unit-economics/summary?{P}", "/api/v1/unit-economics/trend?end=2026-10-31",
                f"/api/v1/unit-economics/customers?{P}", f"/api/v1/unit-economics/products?{P}", f"/api/v1/unit-economics/segments?{P}",
                f"/api/v1/unit-economics/cost-breakdown?{P}", "/api/v1/settings", "/api/v1/users", "/api/v1/notifications"):
        r = client.get(url, headers=viewer)
        assert r.status_code == 200, (url, r.text)
    oct_ = client.get("/api/v1/overview/trend?end=2026-10-31&months=2", headers=viewer).json()["months"]
    assert oct_[0]["expected"] is None and oct_[1]["expected"] == "10000.00" and oct_[1]["leakage"] == "2000.00"
    ue = client.get(f"/api/v1/unit-economics/summary?{P}", headers=viewer).json()
    assert ue["contribution_margin"] == "62.50"
    assert client.get("/api/v1/audit-logs", headers=viewer).status_code == 403
    pdf = client.get(f"/api/v1/billing/invoices/1/pdf", headers=viewer)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_settings_update_validation_and_audit(client, admin, viewer, db):
    assert client.put("/api/v1/settings/revenue_rules", headers=viewer, json={"match_tolerance": "2"}).status_code == 403
    assert client.put("/api/v1/settings/revenue_rules", headers=admin, json={"nope": 1}).status_code == 422
    assert client.put("/api/v1/settings/ai", headers=admin, json={"api_key": "x"}).status_code == 422
    r = client.put("/api/v1/settings/revenue_rules", headers=admin, json={"severity_thresholds": {"CRITICAL": "200000"}})
    assert r.status_code == 200 and r.json()["severity_thresholds"] == {"CRITICAL": "200000", "HIGH": "50000", "MEDIUM": "10000"}
    assert db.execute(text("select count(*) from audit_logs where action='SETTINGS_UPDATED'")).scalar() == 1
