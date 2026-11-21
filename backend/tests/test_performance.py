"""Performance budgets on the full synthetic dataset (200 customers, six months of billing, usage and payments).

Budgets are deliberately generous so the test is stable on slow CI machines; the measured numbers are printed
(`pytest -s`) and recorded in docs/testing/PERFORMANCE.md. A failure here means a real regression (for example
an N+1 query), not normal machine noise."""
import statistics
import time
from datetime import date

from backend.app.models import AuditRun, Tenant
from backend.app.reconciliation.runner import create_audit_run, execute_audit_run
from backend.app.seed.synthetic import seed_demo_dataset

AUDIT_BUDGET_S = 60
ENDPOINT_BUDGET_S = 2.0
OCT = {"period_start": "2026-10-01", "period_end": "2026-10-31"}
ENDPOINTS = [
    ("/api/v1/metrics/summary", OCT), ("/api/v1/overview/trend", {"end": "2026-10-31", "months": 6}), ("/api/v1/overview/profitability", OCT),
    ("/api/v1/exceptions", {**OCT, "page_size": 50}), ("/api/v1/customers", {**OCT, "page_size": 50}),
    ("/api/v1/billing/invoices", {**OCT, "page_size": 50}), ("/api/v1/metrics/contribution", OCT),
    ("/api/v1/prioritization", OCT), ("/api/v1/root-cause", OCT),
]


def test_monthly_audit_and_page_endpoints_stay_within_budget(db, tenant_id, client, admin):
    assert seed_demo_dataset(db, db.get(Tenant, tenant_id))
    db.commit()
    run, _ = create_audit_run(db, tenant_id, None, date(2026, 10, 1), date(2026, 10, 31), date(2026, 11, 14))
    db.commit()
    t = time.perf_counter()
    execute_audit_run(run.id)
    audit_s = time.perf_counter() - t
    db.expire_all()
    assert db.get(AuditRun, run.id).status.startswith("COMPLETED")
    print(f"\naudit (Oct 2026, full synthetic dataset): {audit_s:.2f}s")
    assert audit_s < AUDIT_BUDGET_S

    for path, params in ENDPOINTS:
        times = []
        for _ in range(3):
            t = time.perf_counter()
            r = client.get(path, params=params, headers=admin)
            times.append(time.perf_counter() - t)
            assert r.status_code == 200, (path, r.status_code, r.text[:200])
        med = statistics.median(times)
        print(f"{path:<36} median {med * 1000:7.1f} ms  (max {max(times) * 1000:.1f} ms)")
        assert med < ENDPOINT_BUDGET_S, path
