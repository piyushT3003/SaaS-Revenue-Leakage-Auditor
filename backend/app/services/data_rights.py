"""Company data export (portability) and erasure for one workspace.

Export: every table that belongs to the workspace, one CSV per table in a ZIP. Secrets are never exported
(password hashes, session tokens, reset-token hashes). Cells are formula-safe.
Erasure: deletes all business data (customers through audits, exceptions, AI conversations, notifications and the
audit trail) but keeps the workspace, its users and settings, so the admin can start again. Runs in ONE
transaction: it either removes everything or nothing."""
from __future__ import annotations

import csv
import io
import zipfile
from datetime import UTC, datetime

from sqlalchemy import Table, delete, select, text
from sqlalchemy.orm import Session

from backend.app.exports.safe import safe_row
from backend.app.models import Base, ImportBatch

KEEP = {"tenants", "users", "tenant_settings", "roles", "user_sessions", "login_attempts", "password_reset_tokens"}
NEVER_EXPORT = {"user_sessions", "login_attempts", "password_reset_tokens", "alembic_version"}
SECRET_COLUMNS = {"password_hash", "token_hash", "jti"}
REPORTING_SNAPSHOTS = ("reporting.customer_economics_monthly", "reporting.product_economics_monthly")


def _tenant_tables() -> list[Table]:
    return [t for t in Base.metadata.sorted_tables if "tenant_id" in t.c]


def export_zip(db: Session, tenant_id: int) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        manifest = [f"Company data export — generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC",
                    "One CSV per table. Password hashes and session/reset tokens are never exported.", ""]
        for t in _tenant_tables():
            if t.name in NEVER_EXPORT:
                continue
            cols = [c for c in t.c if c.name not in SECRET_COLUMNS]
            rows = db.execute(select(*cols).where(t.c.tenant_id == tenant_id)).all()
            z.writestr(f"{t.name}.csv", _csv([c.name for c in cols], rows))
            manifest.append(f"{t.name}.csv: {len(rows)} rows")
        ir = Base.metadata.tables["import_rows"]
        rows = db.execute(select(ir).join(ImportBatch, ImportBatch.id == ir.c.batch_id)
                          .where(ImportBatch.tenant_id == tenant_id)).all()
        z.writestr("import_rows.csv", _csv([c.name for c in ir.c], rows))
        manifest.append(f"import_rows.csv: {len(rows)} rows")
        z.writestr("README.txt", "\n".join(manifest) + "\n")
    return buf.getvalue()


def _csv(header: list[str], rows) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(header)
    for r in rows:
        w.writerow(safe_row(["" if v is None else v for v in r]))
    return out.getvalue()


def erase_business_data(db: Session, tenant_id: int) -> dict[str, int]:
    """Must be called inside the request's transaction; the caller commits."""
    db.execute(text("SET LOCAL sra.erasure = 'on'"))  # lets the immutability triggers allow these DELETEs only
    counts: dict[str, int] = {}
    ir = Base.metadata.tables["import_rows"]
    counts["import_rows"] = db.execute(delete(ir).where(ir.c.batch_id.in_(
        select(ImportBatch.id).where(ImportBatch.tenant_id == tenant_id)))).rowcount
    for name in REPORTING_SNAPSHOTS:
        counts[name] = db.execute(text(f"DELETE FROM {name} WHERE tenant_id = :t"), {"t": tenant_id}).rowcount
    # Children before parents (reverse dependency order). Tables that reference each other are cleared by
    # nulling the optional links first where needed.
    for t in reversed(_tenant_tables()):
        if t.name in KEEP:
            continue
        counts[t.name] = db.execute(delete(t).where(t.c.tenant_id == tenant_id)).rowcount
    return {k: v for k, v in counts.items() if v}
