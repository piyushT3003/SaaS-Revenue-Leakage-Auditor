"""Command line: ``python -m backend.app.seed.cli [--reset]`` — migrate, bootstrap and seed demo data."""
from __future__ import annotations

import argparse
import os
import sys

from backend.app.core.database import session_scope
from backend.app.seed.synthetic import demo_users, seed_demo_dataset
from backend.app.services.tenancy import bootstrap


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the synthetic demonstration dataset")
    parser.add_argument("--demo-password", default=os.getenv("DEMO_USER_PASSWORD", ""),
                        help="password for the demo users (piyush@/analyst@/viewer@demo.local)")
    parser.add_argument("--run-audits", action="store_true",
                        help="run a full-scope audit for every demo month (May–Oct 2026) that has none yet")
    args = parser.parse_args()
    with session_scope() as db:
        tenant, generated = bootstrap(db)
        if generated:
            print(f"Bootstrap admin created. One-time password: {generated}  (change it after first login)")
        if args.demo_password:
            demo_users(db, tenant, args.demo_password)
        created = seed_demo_dataset(db, tenant)
        print("Synthetic demonstration dataset created." if created else "Demo data already present; nothing to do.")
        tenant_id = tenant.id
    if args.run_audits:
        run_demo_audits(tenant_id)
    return 0


def run_demo_audits(tenant_id: int) -> None:
    """Audit each demo month once, so the dashboards have results on a fresh install."""
    import calendar
    from datetime import date

    from sqlalchemy import select

    from backend.app.models import AuditRun
    from backend.app.reconciliation.runner import create_audit_run, execute_audit_run

    for m in range(5, 11):
        start, end = date(2026, m, 1), date(2026, m, calendar.monthrange(2026, m)[1])
        with session_scope() as db:
            done = db.scalar(select(AuditRun.id).where(AuditRun.tenant_id == tenant_id, AuditRun.period_start == start,
                                                       AuditRun.run_type == "STANDARD",
                                                       AuditRun.status.in_(("COMPLETED", "COMPLETED_WITH_EXCLUSIONS"))))
            if done:
                print(f"{start:%b %Y}: already audited")
                continue
            run, _ = create_audit_run(db, tenant_id, None, start, end)
            run_id = run.id
        execute_audit_run(run_id)
        with session_scope() as db:
            r = db.get(AuditRun, run_id)
            print(f"{start:%b %Y}: {r.run_code} {r.status} leakage {r.underbilled_total}")


if __name__ == "__main__":
    sys.exit(main())
