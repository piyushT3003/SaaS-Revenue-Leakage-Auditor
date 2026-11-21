"""Power BI reporting layer: views reconcile to the application, snapshots match the dashboards,
and the powerbi_reader role is read-only on the reporting schema only."""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

from backend.tests.test_advanced import october  # noqa: F401  (fixture)

P = "period_start=2026-10-01&period_end=2026-10-31"


def test_views_reconcile_to_stored_audit(october, db):  # noqa: F811
    row = db.execute(text("""SELECT SUM(underbilled_amount), SUM(overbilled_amount), SUM(expected_amount) FILTER (WHERE status <> 'EXCLUDED' AND NOT is_unmatched_invoice_line),
                                    ROUND(100.0 * SUM(is_matched) / NULLIF(SUM(is_in_scope), 0), 4)
                             FROM reporting.fact_reconciliation WHERE audit_run_id = :r"""), {"r": october.id}).one()
    assert row[0] == october.underbilled_total and row[1] == october.overbilled_total
    assert row[2] == october.expected_total
    assert round(row[3], 2) == round(october.reconciliation_rate, 2)
    assert db.execute(text("SELECT audit_run_id FROM reporting.latest_audit WHERE period_start = '2026-10-01'")).scalar() == october.id


def test_snapshot_matches_dashboard_margin(october, db, client, admin):  # noqa: F811
    # refreshed automatically when the audit completed
    snap = db.execute(text("""SELECT ROUND(100 * SUM(contribution) / SUM(net_revenue), 2), COUNT(*) FROM reporting.customer_economics_monthly
                              WHERE month_start = '2026-10-01' AND tenant_id = :t"""), {"t": october.tenant_id}).one()
    m = client.get(f"/api/v1/metrics/summary?{P}", headers=admin).json()["metrics"]["contribution_margin"]
    assert f"{snap[0]:.2f}" == f"{float(m['value']):.2f}" and snap[1] == m["details"]["customers"]
    st = client.get("/api/v1/reporting/status", headers=admin).json()
    assert any(x["month_start"] == "2026-10-01" for x in st["months"])
    assert client.post("/api/v1/reporting/refresh", headers=admin).status_code == 200


def test_reporting_refresh_requires_admin(october, client, analyst, viewer):  # noqa: F811
    assert client.post("/api/v1/reporting/refresh", headers=analyst).status_code == 403
    assert client.post("/api/v1/reporting/refresh", headers=viewer).status_code == 403


@pytest.mark.parametrize("sql", ["SELECT 1 FROM public.invoices LIMIT 1", "DELETE FROM reporting.customer_economics_monthly",
                                 "UPDATE public.exceptions SET status = 'RESOLVED'"])
def test_powerbi_reader_is_read_only(october, db, sql):  # noqa: F811
    db.execute(text("SET ROLE powerbi_reader"))
    try:
        assert db.execute(text("SELECT COUNT(*) FROM reporting.fact_exception")).scalar() > 0
        with pytest.raises(ProgrammingError):
            db.execute(text(sql))
    finally:
        db.rollback()
        db.execute(text("RESET ROLE"))
