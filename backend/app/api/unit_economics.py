"""Customer Unit Economics: KPIs, revenue-vs-cost trend, customer/product/segment profitability, cost breakdown."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.analytics import metrics as M
from backend.app.analytics.calculation import add_months, month_end
from backend.app.api.common import J, Page, pagination
from backend.app.core.database import get_db
from backend.app.core.money import D, money, pct
from backend.app.models import Customer, Product, ProductCost
from backend.app.security.auth import CurrentUser, require

router = APIRouter()


def _rows(db: Session, tenant_id: int, start: date, end: date):
    metric, rows = M.contribution(db, tenant_id, start, end)
    cust = {c.id: c for c in db.scalars(select(Customer).where(Customer.tenant_id == tenant_id))}
    for r in rows:
        c = cust.get(r["customer_id"])
        r["customer_name"], r["customer_code"], r["customer_segment"] = (c.name, c.customer_code, c.segment) if c else ("?", "?", "?")
    return metric, [r for r in rows if r["segment"] != "NO_REVENUE" or r["direct_cost"] > 0]


@router.get("/unit-economics/summary")
def summary(period_start: date, period_end: date, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    metric, rows = _rows(db, user.tenant_id, period_start, period_end)
    n = len([r for r in rows if r["net_revenue"] > 0]) or 1
    rev = sum((r["net_revenue"] for r in rows), Decimal("0"))
    cost = sum((r["direct_cost"] for r in rows), Decimal("0"))
    seg = defaultdict(int)
    for r in rows:
        seg[r["segment"]] += 1
    counted = sum(seg[s] for s in ("PROFITABLE", "AT_RISK", "UNPROFITABLE")) or 1
    return J({
        "avg_revenue_per_customer": money(rev / n), "avg_cost_per_customer": money(cost / n),
        "contribution_per_customer": money((rev - cost) / n), "contribution_margin": metric.value,
        "net_revenue": money(rev), "direct_cost": money(cost), "contribution": money(rev - cost), "customers": n,
        "segments": [{"segment": s, "count": seg[s], "share_pct": pct(seg[s], counted)} for s in ("PROFITABLE", "AT_RISK", "UNPROFITABLE")],
        "metric": metric.to_dict(),
    })


@router.get("/unit-economics/trend")
def trend(end: date, months: int = Query(6, ge=1, le=24), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    out = []
    m = add_months(end.replace(day=1), -(months - 1))
    while m <= end:
        metric, _ = M.contribution(db, user.tenant_id, m, month_end(m))
        out.append({"month": m, "label": f"{m:%b}", "revenue": metric.details["net_revenue"], "cost": metric.details["direct_cost"],
                    "contribution": metric.details["contribution"], "margin_pct": metric.value})
        m = add_months(m, 1)
    return J(out)


@router.get("/unit-economics/customers")
def customers(period_start: date, period_end: date, segment: str | None = None, profitability: str | None = None,
              sort: str = Query("-contribution", pattern="^-?(contribution|margin_pct|net_revenue|direct_cost)$"),
              page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    _, rows = _rows(db, user.tenant_id, period_start, period_end)
    if segment:
        rows = [r for r in rows if r["customer_segment"] in segment.upper().split(",")]
    if profitability:
        rows = [r for r in rows if r["segment"] in profitability.upper().split(",")]
    key = sort.lstrip("-")
    rows.sort(key=lambda r: (r[key] is not None, r[key] if r[key] is not None else 0), reverse=sort.startswith("-"))
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
    return page.wrap(J(rows[page.offset: page.offset + page.page_size]), len(rows))


@router.get("/unit-economics/products")
def products(period_start: date, period_end: date, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    """Product profitability: billed revenue by product vs direct costs recorded against the product."""
    rev = M.billed_revenue_by_customer(db, user.tenant_id, period_start, period_end)
    by_product = defaultdict(Decimal)
    for v in rev.values():
        for pid, amt in v["by_product"].items():
            by_product[pid] += amt
    costs = dict(db.execute(select(ProductCost.product_id, func.sum(ProductCost.amount)).where(
        ProductCost.tenant_id == user.tenant_id, ProductCost.period_month >= period_start.replace(day=1),
        ProductCost.period_month <= period_end).group_by(ProductCost.product_id)).all())
    out = []
    for p in db.scalars(select(Product).where(Product.tenant_id == user.tenant_id).order_by(Product.name)):
        r, c = money(by_product.get(p.id, Decimal("0"))), money(D(costs.get(p.id, 0)))
        out.append({"product_id": p.id, "code": p.product_code, "name": p.name, "revenue": r, "direct_cost": c,
                    "contribution": money(r - c), "margin_pct": pct(r - c, r) if r > 0 else None})
    return J({"products": out, "basis": "Gross billed revenue by product (before customer-level credit notes) vs all cost rows for the product"})


@router.get("/unit-economics/segments")
def segments(period_start: date, period_end: date, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    _, rows = _rows(db, user.tenant_id, period_start, period_end)
    agg = defaultdict(lambda: {"revenue": Decimal("0"), "cost": Decimal("0"), "customers": 0})
    for r in rows:
        a = agg[r["customer_segment"]]
        a["revenue"] += r["net_revenue"]
        a["cost"] += r["direct_cost"]
        a["customers"] += 1
    return J([{"segment": s, **v, "contribution": money(v["revenue"] - v["cost"]),
               "margin_pct": pct(v["revenue"] - v["cost"], v["revenue"]) if v["revenue"] > 0 else None} for s, v in agg.items()])


@router.get("/unit-economics/cost-breakdown")
def cost_breakdown(period_start: date, period_end: date, customer_id: int | None = None, user: CurrentUser = Depends(require("read")),
                   db: Session = Depends(get_db)):
    t = user.tenant_id
    rows = db.execute(select(Product.name, ProductCost.cost_type, ProductCost.allocation_basis,
                             (ProductCost.customer_id.is_not(None)).label("direct"), func.sum(ProductCost.amount), func.count())
                      .join(Product).where(ProductCost.tenant_id == t, ProductCost.period_month >= period_start.replace(day=1),
                                           ProductCost.period_month <= period_end)
                      .group_by(Product.name, ProductCost.cost_type, ProductCost.allocation_basis, "direct")).all()
    detail = None
    if customer_id:
        costs, meta = M.direct_costs_by_customer(db, t, period_start, period_end)
        detail = {"customer_id": customer_id, "by_cost_type": costs.get(customer_id, {}), **meta}
    return J({
        "pools": [{"product": p, "cost_type": ct, "allocation_basis": b, "customer_specific": d, "amount": money(D(a)), "rows": n}
                  for p, ct, b, d, a, n in rows],
        "customer": detail,
        "methodology": [
            "Customer-specific cost rows are attributed directly to that customer.",
            "USAGE pools are split by each customer's share of metered units for the product in that month.",
            "SEATS pools are split by subscribed quantity active in that month.",
            "REVENUE pools are split by each customer's billed revenue for the product in that month.",
            "Pools with no allocation basis in a month are reported as unallocated, never spread evenly.",
        ],
    })
