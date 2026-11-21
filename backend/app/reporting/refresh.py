"""Refresh the Power BI unit-economics snapshot tables from the application's own engine, so the
reporting layer can never disagree with the dashboards.  Usage:

    python -m backend.app.reporting.refresh            # every tenant, every month that has invoices
    python -m backend.app.reporting.refresh 2026-10    # one month
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from backend.app.analytics import metrics as M
from backend.app.analytics.calculation import month_end
from backend.app.core.money import D, money, pct
from backend.app.models import InvoiceLine, Product, ProductCost, Tenant


def months_with_data(db: Session, tenant_id: int) -> list[date]:
    m = func.date_trunc("month", InvoiceLine.period_start)
    rows = db.execute(select(m).where(InvoiceLine.tenant_id == tenant_id).group_by(m).order_by(m)).scalars().all()
    return [r.date() if hasattr(r, "date") else r for r in rows if r is not None]


def refresh_month(db: Session, tenant_id: int, month: date) -> dict:
    start, end = month.replace(day=1), month_end(month)
    _, rows = M.contribution(db, tenant_id, start, end)
    db.execute(text("DELETE FROM reporting.customer_economics_monthly WHERE tenant_id = :t AND month_start = :m"), {"t": tenant_id, "m": start})
    db.execute(text("DELETE FROM reporting.product_economics_monthly WHERE tenant_id = :t AND month_start = :m"), {"t": tenant_id, "m": start})
    if rows:
        db.execute(text("""INSERT INTO reporting.customer_economics_monthly
                           (tenant_id, month_start, customer_id, net_revenue, direct_cost, contribution, margin_pct, profitability, cost_breakdown)
                           VALUES (:t, :m, :c, :r, :dc, :ct, :mp, :p, CAST(:cb AS jsonb))"""),
                   [{"t": tenant_id, "m": start, "c": r["customer_id"], "r": r["net_revenue"], "dc": r["direct_cost"], "ct": r["contribution"],
                     "mp": r["margin_pct"], "p": r["segment"],
                     "cb": json.dumps({k: str(v) for k, v in r["cost_breakdown"].items()})} for r in rows])
    rev = M.billed_revenue_by_customer(db, tenant_id, start, end)
    by_product: dict[int, Decimal] = defaultdict(Decimal)
    for v in rev.values():
        for pid, amt in v["by_product"].items():
            by_product[pid] += amt
    costs = dict(db.execute(select(ProductCost.product_id, func.sum(ProductCost.amount)).where(
        ProductCost.tenant_id == tenant_id, ProductCost.period_month >= start, ProductCost.period_month <= end).group_by(ProductCost.product_id)).all())
    prows = []
    for pid in db.scalars(select(Product.id).where(Product.tenant_id == tenant_id)):
        r, c = money(by_product.get(pid, Decimal("0"))), money(D(costs.get(pid, 0)))
        if r == 0 and c == 0:
            continue
        prows.append({"t": tenant_id, "m": start, "p": pid, "r": r, "c": c, "ct": money(r - c), "mp": pct(r - c, r) if r > 0 else None})
    if prows:
        db.execute(text("""INSERT INTO reporting.product_economics_monthly (tenant_id, month_start, product_id, revenue, direct_cost, contribution, margin_pct)
                           VALUES (:t, :m, :p, :r, :c, :ct, :mp)"""), prows)
    return {"month": start.isoformat(), "customers": len(rows), "products": len(prows)}


def refresh(db: Session, tenant_id: int, months: list[date] | None = None) -> list[dict]:
    return [refresh_month(db, tenant_id, m) for m in (months or months_with_data(db, tenant_id))]


def main(argv: list[str]) -> None:
    from backend.app.core.database import SessionLocal

    months = [date.fromisoformat(f"{a}-01") for a in argv] or None
    with SessionLocal() as db:
        for t in db.scalars(select(Tenant.id)):
            for r in refresh(db, t, months):
                print(f"tenant {t}: {r}")
        db.commit()


if __name__ == "__main__":
    main(sys.argv[1:])
