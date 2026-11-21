"""Daily scheduled job: secret-protected, audits last month once it has closed, idempotent, housekeeping."""
from datetime import date

from sqlalchemy import text

from backend.app.api.cron import previous_month, run_monthly_audit
from backend.app.core.config import settings
from backend.tests.factories import World


def test_cron_endpoint_is_hidden_without_a_secret_and_rejects_a_wrong_one(client, monkeypatch):
    assert client.get("/api/v1/cron/daily").status_code == 404
    monkeypatch.setattr(settings, "CRON_SECRET", "s3cret-value-for-tests")
    assert client.get("/api/v1/cron/daily").status_code == 401
    assert client.get("/api/v1/cron/daily", headers={"Authorization": "Bearer wrong"}).status_code == 401
    r = client.get("/api/v1/cron/daily", headers={"Authorization": "Bearer s3cret-value-for-tests"})
    assert r.status_code == 200 and "tenants" in r.json()


def test_previous_month_boundaries():
    assert previous_month(date(2026, 11, 2)) == (date(2026, 10, 1), date(2026, 10, 31))
    assert previous_month(date(2026, 3, 15)) == (date(2026, 2, 1), date(2026, 2, 28))
    assert previous_month(date(2027, 1, 5)) == (date(2026, 12, 1), date(2026, 12, 31))


def test_monthly_audit_runs_once_after_month_end(db, tenant_id):
    w = World(db, tenant_id)
    c, _, _, s = w.simple_recurring()
    w.line(w.invoice(c, total=8000), s, "8000")
    db.commit()
    assert run_monthly_audit(db, tenant_id, date(2026, 11, 1))["action"] == "skipped"  # before AUTO_AUDIT_DAY
    first = run_monthly_audit(db, tenant_id, date(2026, 11, 2))
    assert first["action"] == "audited" and first["period"] == "2026-10" and first["status"].startswith("COMPLETED")
    again = run_monthly_audit(db, tenant_id, date(2026, 11, 3))
    assert again["action"] == "skipped" and again["reason"] == "already audited"
    assert db.execute(text("select count(*) from audit_runs where period_start = '2026-10-01'")).scalar() == 1


def test_monthly_audit_reports_why_it_could_not_start(db, tenant_id, monkeypatch):
    monkeypatch.setattr(settings, "AUTO_MONTHLY_AUDIT", False)
    assert run_monthly_audit(db, tenant_id, date(2026, 11, 5))["reason"] == "AUTO_MONTHLY_AUDIT is off"
