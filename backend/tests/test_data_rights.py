"""Company data export and erasure; the immutability guards still hold for everything else."""
import io
import zipfile
from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from backend.app.models import Tenant
from backend.app.reconciliation.runner import create_audit_run, execute_audit_run
from backend.app.seed.synthetic import seed_demo_dataset
from backend.tests.conftest import PASSWORD

PHRASE = "ERASE ALL COMPANY DATA"


@pytest.fixture()
def audited(db, tenant_id):
    seed_demo_dataset(db, db.get(Tenant, tenant_id))
    db.commit()
    run, _ = create_audit_run(db, tenant_id, None, date(2026, 10, 1), date(2026, 10, 31), date(2026, 11, 14))
    db.commit()
    execute_audit_run(run.id)
    return run


def count(db, table):
    return db.execute(text(f"select count(*) from {table}")).scalar()


def test_export_contains_the_data_but_no_secrets(client, admin, audited):
    r = client.get("/api/v1/admin/data-export", headers=admin)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(z.namelist())
    assert {"customers.csv", "invoices.csv", "reconciliation_results.csv", "users.csv", "README.txt"} <= names
    assert "user_sessions.csv" not in names and "password_reset_tokens.csv" not in names
    users = z.read("users.csv").decode()
    assert "password_hash" not in users.splitlines()[0] and "$2b$" not in users
    assert len(z.read("customers.csv").decode().strip().splitlines()) == 201  # header + 200 customers


def test_erase_requires_admin_phrase_and_password(client, admin, analyst, audited):
    assert client.post("/api/v1/admin/data-erase", headers=analyst, json={"confirm": PHRASE, "password": PASSWORD}).status_code == 403
    assert client.post("/api/v1/admin/data-erase", headers=admin, json={"confirm": "erase", "password": PASSWORD}).status_code == 422
    assert client.post("/api/v1/admin/data-erase", headers=admin, json={"confirm": PHRASE, "password": "wrong-pass-1"}).status_code == 403


def test_erase_removes_all_business_data_but_keeps_the_workspace(client, admin, audited, db):
    assert count(db, "reconciliation_results") > 0 and count(db, "exceptions") > 0
    r = client.post("/api/v1/admin/data-erase", headers=admin, json={"confirm": PHRASE, "password": PASSWORD})
    assert r.status_code == 200 and r.json()["deleted_rows"] > 1000
    db.expire_all()
    for t in ("customers", "contracts", "invoices", "payments", "usage_events", "audit_runs", "reconciliation_results",
              "payment_reconciliation_results", "exceptions", "import_batches", "import_rows", "synthetic_ground_truth",
              "notifications", "reporting.customer_economics_monthly"):
        assert count(db, t) == 0, t
    assert count(db, "users") == 3 and count(db, "tenants") == 1
    assert db.execute(text("select action from audit_logs")).scalars().all() == ["COMPANY_DATA_ERASED"]
    assert client.get("/api/v1/auth/me", headers=admin).status_code == 200  # the admin is still signed in
    assert client.get("/api/v1/onboarding/status", headers=admin).json()["complete"] is False  # back to Get started


def test_immutability_still_applies_outside_an_erasure(db, audited):
    with pytest.raises(DBAPIError):
        db.execute(text("delete from reconciliation_results"))
    db.rollback()
    with pytest.raises(DBAPIError):
        db.execute(text("delete from audit_runs"))
    db.rollback()
