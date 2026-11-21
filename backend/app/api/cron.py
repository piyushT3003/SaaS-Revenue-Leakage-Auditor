"""Scheduled jobs, triggered once a day by the host's scheduler (Vercel Cron, or any cron that can send an HTTP
request with the shared secret). Idempotent: running it twice on the same day does no extra work."""
from __future__ import annotations

import hmac
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.logging import log
from backend.app.models import AuditRun, LoginAttempt, PasswordResetToken, Tenant, UserSession
from backend.app.reconciliation.runner import AuditRequestError, create_audit_run, execute_audit_run, recover_stale_runs

router = APIRouter()


def _authorised(authorization: str | None) -> None:
    if not settings.CRON_SECRET:
        raise HTTPException(404, "Not Found")  # scheduler not configured: the endpoint does not exist
    expected = f"Bearer {settings.CRON_SECRET}"
    if not authorization or not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(401, "Unauthorized")


def previous_month(today: date) -> tuple[date, date]:
    end = today.replace(day=1) - timedelta(days=1)
    return end.replace(day=1), end


def run_monthly_audit(db: Session, tenant_id: int, today: date) -> dict:
    """Audit last month once it has closed (from AUTO_AUDIT_DAY onwards), unless a completed audit already exists."""
    start, end = previous_month(today)
    result = {"period": f"{start:%Y-%m}", "action": "skipped"}
    if not settings.AUTO_MONTHLY_AUDIT:
        return {**result, "reason": "AUTO_MONTHLY_AUDIT is off"}
    if today.day < settings.AUTO_AUDIT_DAY:
        return {**result, "reason": f"runs from day {settings.AUTO_AUDIT_DAY} of the month"}
    done = db.scalar(select(AuditRun.id).where(
        AuditRun.tenant_id == tenant_id, AuditRun.period_start == start, AuditRun.period_end == end,
        AuditRun.run_type == "STANDARD", AuditRun.status.in_(("COMPLETED", "COMPLETED_WITH_EXCLUSIONS"))).limit(1))
    if done:
        return {**result, "reason": "already audited"}
    try:
        run, reused = create_audit_run(db, tenant_id, None, start, end, today)
        db.commit()
    except AuditRequestError as e:
        db.rollback()
        return {**result, "action": "not_started", "reason": str(e)}
    if not reused:
        execute_audit_run(run.id)
    db.expire_all()
    run = db.get(AuditRun, run.id)
    return {**result, "action": "reused" if reused else "audited", "run_code": run.run_code, "status": run.status}


def housekeeping(db: Session) -> dict:
    now = datetime.now(UTC)
    attempts = db.execute(delete(LoginAttempt).where(LoginAttempt.attempted_at < now - timedelta(days=1))).rowcount
    sessions = db.execute(delete(UserSession).where(UserSession.expires_at < now - timedelta(days=7))).rowcount
    tokens = db.execute(delete(PasswordResetToken).where(PasswordResetToken.expires_at < now - timedelta(days=7))).rowcount
    return {"login_attempts_pruned": attempts, "sessions_pruned": sessions, "reset_tokens_pruned": tokens}


@router.get("/cron/daily", include_in_schema=False)
def daily(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    _authorised(authorization)
    today = datetime.now(UTC).date()
    report: dict = {"date": today.isoformat(), "recovered_runs": recover_stale_runs(db), **housekeeping(db), "tenants": []}
    db.commit()
    for tenant in db.scalars(select(Tenant).order_by(Tenant.id)).all():
        report["tenants"].append({"tenant": tenant.code, "monthly_audit": run_monthly_audit(db, tenant.id, today)})
    log.info("daily cron", extra={"report": report})
    return report
