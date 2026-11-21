"""What-If Revenue Simulator.

Hypothetical outcomes are computed with the same expected-charge engine, using in-memory
(never persisted) pricing-rule overrides and quantity factors. Actual financial records are
never written: overrides are transient objects and the session is rolled back by the caller
if anything is accidentally added. Results are stored only in ``simulation_results`` with
``is_hypothetical = true``.

Assumptions (all optional):
  price_change_pct      {product_code: pct}   change to recurring/usage unit prices and tier prices
  discount_pct          {product_code: pct}   replace the contractual discount
  included_units_change_pct {product_code: pct}
  quantity_change_pct   {product_code: pct}   seats / subscribed quantity
  cost_change_pct       {cost_type: pct}      direct-cost assumptions
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, make_transient

from backend.app.analytics import metrics as M
from backend.app.core.money import D, money, pct
from backend.app.models import Customer, PricingRule, Product, Subscription
from backend.app.reconciliation.obligations import build_expected_obligations

ALLOWED = {"price_change_pct", "discount_pct", "included_units_change_pct", "quantity_change_pct", "cost_change_pct"}


def validate(assumptions: dict) -> dict:
    bad = set(assumptions) - ALLOWED
    if bad:
        raise ValueError(f"Unknown assumptions: {sorted(bad)}")
    for k, v in assumptions.items():
        if not isinstance(v, dict):
            raise ValueError(f"{k} must map product/cost type → percentage")
        for kk, pv in v.items():
            n = D(pv)
            if k == "discount_pct" and not (0 <= n <= 100):
                raise ValueError(f"discount for {kk} must be between 0 and 100")
            if k != "discount_pct" and not (-100 <= n <= 500):
                raise ValueError(f"{k} for {kk} must be between -100% and 500%")
    return assumptions


def _overrides(db: Session, tenant_id: int, a: dict) -> dict[str, PricingRule]:
    codes = dict(db.execute(select(Product.id, Product.product_code).where(Product.tenant_id == tenant_id)).all())
    touched = set(a.get("price_change_pct", {})) | set(a.get("discount_pct", {})) | set(a.get("included_units_change_pct", {}))
    out = {}
    if not touched:
        return out
    for r in db.scalars(select(PricingRule).where(PricingRule.tenant_id == tenant_id, PricingRule.status != "PROPOSED")):
        code = codes.get(r.product_id)
        if code not in touched:
            continue
        f = 1 + D(a.get("price_change_pct", {}).get(code, 0)) / 100
        clone = PricingRule(**{c.key: getattr(r, c.key) for c in PricingRule.__table__.columns})
        make_transient(clone)
        clone.unit_price = D(r.unit_price) * f
        clone.tiers = [{"up_to": t.get("up_to"), "unit_price": str(D(t["unit_price"]) * f)} for t in (r.tiers or [])]
        if code in a.get("discount_pct", {}):
            clone.discount_pct = D(a["discount_pct"][code])
        if code in a.get("included_units_change_pct", {}):
            clone.included_units = D(r.included_units) * (1 + D(a["included_units_change_pct"][code]) / 100)
        out[r.rule_key] = clone  # same key → engine substitutes it; nothing is added to the session
    return out


def _revenue_by_customer(build) -> dict[int, Decimal]:
    out = defaultdict(Decimal)
    for o in build.obligations:
        if o.calc is not None and not o.excluded:
            out[o.customer_id] += o.calc.total
    return out


def run(db: Session, tenant_id: int, period_start: date, period_end: date, assumptions: dict) -> dict:
    a = validate(assumptions)
    codes = dict(db.execute(select(Product.product_code, Product.id).where(Product.tenant_id == tenant_id)).all())
    qty = {codes[c]: 1 + D(v) / 100 for c, v in a.get("quantity_change_pct", {}).items() if c in codes}
    base = build_expected_obligations(db, tenant_id, period_start, period_end)
    proj = build_expected_obligations(db, tenant_id, period_start, period_end, rule_overrides=_overrides(db, tenant_id, a),
                                      quantity_factors=qty)
    base_rev, proj_rev = _revenue_by_customer(base), _revenue_by_customer(proj)
    costs, _ = M.direct_costs_by_customer(db, tenant_id, period_start, period_end)
    cf = {k: 1 + D(v) / 100 for k, v in a.get("cost_change_pct", {}).items()}
    names = dict(db.execute(select(Customer.id, Customer.name).where(Customer.tenant_id == tenant_id)).all())
    rows = []
    totals = {"base_revenue": Decimal("0"), "proj_revenue": Decimal("0"), "base_cost": Decimal("0"), "proj_cost": Decimal("0")}
    seg_moves = defaultdict(int)
    for cid in sorted(set(base_rev) | set(proj_rev)):
        bc = sum((D(v) for v in costs.get(cid, {}).values()), Decimal("0"))
        pc = sum((D(v) * cf.get(t, Decimal("1")) for t, v in costs.get(cid, {}).items()), Decimal("0"))
        br, pr = money(base_rev.get(cid, 0)), money(proj_rev.get(cid, 0))
        bm, pm = pct(br - bc, br) if br > 0 else None, pct(pr - pc, pr) if pr > 0 else None
        bs, ps = M.classify_margin(bm), M.classify_margin(pm)
        if bs != ps:
            seg_moves[f"{bs}→{ps}"] += 1
        totals["base_revenue"] += br
        totals["proj_revenue"] += pr
        totals["base_cost"] += bc
        totals["proj_cost"] += pc
        rows.append({"customer_id": cid, "customer": names.get(cid), "base_revenue": br, "projected_revenue": pr,
                     "revenue_change": money(pr - br), "base_cost": money(bc), "projected_cost": money(pc),
                     "base_margin_pct": bm, "projected_margin_pct": pm, "base_segment": bs, "projected_segment": ps})
    def summ(rev, cost):
        return {"revenue": money(rev), "direct_cost": money(cost), "contribution": money(rev - cost),
                "margin_pct": pct(rev - cost, rev) if rev > 0 else None}
    baseline, projected = summ(totals["base_revenue"], totals["base_cost"]), summ(totals["proj_revenue"], totals["proj_cost"])
    seg_count = lambda key: {s: sum(1 for r in rows if r[key] == s) for s in ("PROFITABLE", "AT_RISK", "UNPROFITABLE")}  # noqa: E731
    rows.sort(key=lambda r: r["revenue_change"])
    return {
        "hypothetical": True,
        "basis": "Expected billable charges recalculated by the financial engine under the assumptions, vs the same calculation "
                 "under current contract terms. Costs are actual allocated direct costs adjusted by the cost assumptions. "
                 "Hypothetical — no financial record is changed.",
        "baseline": {**baseline, "segments": seg_count("base_segment")},
        "projected": {**projected, "segments": seg_count("projected_segment")},
        "delta": {"revenue": money(totals["proj_revenue"] - totals["base_revenue"]),
                  "contribution": money(projected["contribution"] - baseline["contribution"]),
                  "margin_pp": None if baseline["margin_pct"] is None or projected["margin_pct"] is None else projected["margin_pct"] - baseline["margin_pct"]},
        "segment_moves": dict(seg_moves), "per_customer": rows,
    }


def _unused(_: Subscription) -> None:
    return None
