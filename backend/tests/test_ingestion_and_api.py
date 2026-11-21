"""Import pipeline (spec TEST 8), authentication / RBAC and API workflow."""
from datetime import date

from sqlalchemy import text

CUSTOMERS_CSV = (
    "Customer ID,Customer Name,Tier,Region\n"
    "C-100,Acme Corp,enterprise,Mumbai\n"
    "C-101,Beta Ltd,smb,Pune\n"
    "C-102,,mid_market,Delhi\n"          # missing name -> rejected
    "C-103,Gamma,PLATINUM,Delhi\n"        # invalid segment -> rejected
    "C-100,Acme Again,enterprise,Mumbai\n"  # duplicate key inside the file
)


def upload(client, headers, name, content, dataset=None):
    data = {"dataset_type": dataset} if dataset else {}
    return client.post("/api/v1/imports/upload", headers=headers, files={"file": (name, content.encode(), "text/csv")}, data=data)


def test_auth_required_and_login_failures(client):
    assert client.get("/api/v1/metrics/reference").status_code == 401
    r = client.post("/api/v1/auth/login", json={"email": "admin@test.local", "password": "wrong-password"})
    assert r.status_code == 401


def test_logout_revokes_token(client, admin):
    assert client.get("/api/v1/auth/me", headers=admin).json()["role"] == "ADMIN"
    assert client.post("/api/v1/auth/logout", headers=admin).status_code == 200
    assert client.get("/api/v1/auth/me", headers=admin).status_code == 401


def test_viewer_cannot_import_or_run_audits(client, viewer):
    assert upload(client, viewer, "c.csv", CUSTOMERS_CSV).status_code == 403
    r = client.post("/api/v1/audits", headers=viewer, json={"period_start": "2026-10-01", "period_end": "2026-10-31"})
    assert r.status_code == 403
    assert client.get("/api/v1/metrics/reference", headers=viewer).status_code == 200


def test_upload_identifies_maps_validates_and_requires_confirmation(client, analyst, db):
    r = upload(client, analyst, "customers.csv", CUSTOMERS_CSV)
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["dataset_type"] == "customers"
    assert b["column_mapping"] == {"Customer ID": "customer_code", "Customer Name": "name", "Tier": "segment", "Region": "region"}
    assert (b["total_rows"], b["accepted_rows"], b["rejected_rows"], b["duplicate_rows"]) == (5, 2, 2, 1)
    assert db.execute(text("select count(*) from customers")).scalar() == 0  # nothing stored before confirmation
    rows = client.get(f"/api/v1/imports/batches/{b['id']}/rows?status=REJECTED", headers=analyst).json()["items"]
    assert {e["field"] for r_ in rows for e in r_["errors"]} == {"name", "segment"}
    c = client.post(f"/api/v1/imports/batches/{b['id']}/confirm", headers=analyst)
    assert c.status_code == 200 and c.json()["inserted"] == 2
    lineage = db.execute(text("select customer_code, source_batch_id, source_row_number from customers order by 1")).all()
    assert lineage == [("C-100", b["id"], 2), ("C-101", b["id"], 3)]


def test_spec_test_8_repeated_identical_upload_creates_no_duplicates(client, admin, db):
    b = upload(client, admin, "customers.csv", CUSTOMERS_CSV).json()
    client.post(f"/api/v1/imports/batches/{b['id']}/confirm", headers=admin)
    again = upload(client, admin, "customers.csv", CUSTOMERS_CSV)
    assert again.status_code == 409 and "already imported" in again.json()["detail"]
    # the same rows in a different file are recognised as existing records
    renamed = upload(client, admin, "customers_copy.csv", CUSTOMERS_CSV + "C-104,Delta,smb,Goa\n").json()
    assert (renamed["accepted_rows"], renamed["duplicate_rows"]) == (1, 3)
    client.post(f"/api/v1/imports/batches/{renamed['id']}/confirm", headers=admin)
    assert db.execute(text("select count(*) from customers")).scalar() == 3


def test_remap_and_reference_validation(client, admin, db):
    b = upload(client, admin, "customers.csv", "code,company,seg\nC-1,One,smb\n", "customers").json()
    assert b["accepted_rows"] == 0  # required fields not mapped
    b = client.put(f"/api/v1/imports/batches/{b['id']}/mapping", headers=admin,
                   json={"column_mapping": {"code": "customer_code", "company": "name", "seg": "segment"}}).json()
    assert b["accepted_rows"] == 1
    client.post(f"/api/v1/imports/batches/{b['id']}/confirm", headers=admin)
    contracts = upload(client, admin, "contracts.csv", "contract_number,customer_code,start_date\nK-1,C-1,2026-01-01\nK-2,C-404,01/02/2026\n").json()
    assert contracts["dataset_type"] == "contracts" and contracts["accepted_rows"] == 1
    assert "does not exist" in str(contracts["issues_summary"])


def test_rollback_is_safe(client, admin, db):
    b = upload(client, admin, "customers.csv", "customer_code,name,segment\nC-1,One,smb\n").json()
    client.post(f"/api/v1/imports/batches/{b['id']}/confirm", headers=admin)
    k = upload(client, admin, "contracts.csv", "contract_number,customer_code,start_date\nK-1,C-1,2026-01-01\n").json()
    client.post(f"/api/v1/imports/batches/{k['id']}/confirm", headers=admin)
    blocked = client.post(f"/api/v1/imports/batches/{b['id']}/rollback", headers=admin, json={"reason": "wrong file"})
    assert blocked.status_code == 409  # customers are referenced by the contract batch
    assert client.post(f"/api/v1/imports/batches/{k['id']}/rollback", headers=admin, json={"reason": "wrong file"}).status_code == 200
    assert client.post(f"/api/v1/imports/batches/{b['id']}/rollback", headers=admin, json={"reason": "wrong file"}).status_code == 200
    assert db.execute(text("select count(*) from customers")).scalar() == 0
    assert db.execute(text("select count(*) from audit_logs where action='IMPORT_ROLLED_BACK'")).scalar() == 2


def test_analyst_cannot_rollback(client, analyst):
    b = upload(client, analyst, "customers.csv", "customer_code,name,segment\nC-1,One,smb\n").json()
    client.post(f"/api/v1/imports/batches/{b['id']}/confirm", headers=analyst)
    assert client.post(f"/api/v1/imports/batches/{b['id']}/rollback", headers=analyst, json={"reason": "oops!"}).status_code == 403


def test_bad_uploads_are_refused(client, admin):
    assert upload(client, admin, "evil.exe", "x").status_code == 415
    assert upload(client, admin, "empty.csv", "customer_code,name,segment\n").status_code == 422
    r = client.post("/api/v1/imports/upload", headers=admin, files={"file": ("x.xlsx", b"not a workbook", "application/octet-stream")})
    assert r.status_code == 422


def test_audit_workflow_through_api(client, admin, db, tenant_id):
    from backend.tests.factories import World

    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring(price="10000")
    w.line(w.invoice(c, total=8000), s, "8000")
    db.commit()
    ready = client.get("/api/v1/audits/readiness?period_start=2026-10-01&period_end=2026-10-31", headers=admin).json()
    assert ready["status"] in ("READY", "READY_WITH_WARNINGS") and ready["obligations"] == 1
    r = client.post("/api/v1/audits", headers=admin,
                    json={"period_start": "2026-10-01", "period_end": "2026-10-31", "as_of_date": "2026-11-14"})
    assert r.status_code == 202
    run_id = r.json()["id"]
    run = client.get(f"/api/v1/audits/{run_id}", headers=admin).json()  # background task already ran in TestClient
    assert run["status"] == "COMPLETED" and run["underbilled_total"] == "2000.00" and run["is_stale"] is False
    items = client.get(f"/api/v1/audits/{run_id}/results?status=UNDERBILLED", headers=admin).json()["items"]
    assert len(items) == 1 and items[0]["variance"] == "-2000.00"
    detail = client.get(f"/api/v1/audits/{run_id}/results/{items[0]['id']}", headers=admin).json()
    assert detail["components"][0]["formula"].startswith("10000.0000 × 1")
    assert detail["invoice_lines"][0]["line_amount"] == "8000.00"
    again = client.post("/api/v1/audits", headers=admin,
                        json={"period_start": "2026-10-01", "period_end": "2026-10-31", "as_of_date": "2026-11-14"}).json()
    assert again["reused"] is True and again["id"] == run_id
    summary = client.get("/api/v1/metrics/summary?period_start=2026-10-01&period_end=2026-10-31&as_of=2026-11-14", headers=admin).json()
    assert summary["metrics"]["revenue_leakage"]["value"] == "2000.00"
    assert summary["metrics"]["mrr"]["value"] == "10000.00"
    assert summary["revenue_health"]["freshness"]["status"] == "CURRENT"
    # any change to source data makes the audit stale
    w.payment(c, "PAY-1", "100")
    db.commit()
    assert client.get(f"/api/v1/audits/{run_id}", headers=admin).json()["is_stale"] is True


def test_money_is_serialised_as_strings(client, admin, db, tenant_id):
    from backend.tests.factories import World

    w = World(db, tenant_id)
    w.simple_recurring(price="0.10", qty="3")
    db.commit()
    s = client.get("/api/v1/metrics/summary?period_start=2026-10-01&period_end=2026-10-31&as_of=2026-10-31", headers=admin).json()
    assert s["metrics"]["mrr"]["value"] == "0.30"  # exact, no binary-float artefacts
    assert date.fromisoformat(s["as_of"]) == date(2026, 10, 31)


def test_security_headers_on_api_and_docs(client, admin):
    r = client.get("/api/v1/auth/me", headers=admin)
    for k, v in {"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
                 "Cache-Control": "no-store"}.items():
        assert r.headers.get(k) == v, k
    assert "default-src 'none'" in r.headers["Content-Security-Policy"]
    d = client.get("/docs")
    assert "script-src 'self'" in d.headers["Content-Security-Policy"] and "frame-ancestors 'none'" in d.headers["Content-Security-Policy"]


def test_spreadsheet_exports_neutralise_formula_injection():
    from decimal import Decimal

    from backend.app.exports.safe import safe_row

    row = safe_row(['=HYPERLINK("http://evil","x")', "+cmd|' /C calc'!A0", "@SUM(1)", "-2+3", "-1500.00", "Acme Ltd", Decimal("-5"), 42, None])
    assert row[:4] == ["'=HYPERLINK(\"http://evil\",\"x\")", "'+cmd|' /C calc'!A0", "'@SUM(1)", "'-2+3"]
    assert row[4:] == ["-1500.00", "Acme Ltd", Decimal("-5"), 42, None]
