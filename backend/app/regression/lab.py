"""Billing Rules Regression Lab.

1. A proposed pricing-rule version is stored with status PROPOSED (never used by audits).
2. A regression suite replays historical billing obligations that used the rule key, computing
   current vs proposed expected charges with the same engine (``rule_overrides``).
3. Each obligation is a test case tagged with the features it exercises (tiers, allowances,
   discounts, proration, contract changes, rounding). |difference| ≤ tolerance → PASSED.
4. Approval is a separate step by a different authorised user; activation is a further explicit
   step. Nothing is activated automatically by a test.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.money import D, money
from backend.app.models import (
    ContractVersion,
    Customer,
    PricingRule,
    RegressionTestResult,
    RegressionTestSuite,
    Subscription,
)
from backend.app.reconciliation.obligations import build_expected_obligations


def propose_rule(db: Session, base: PricingRule, changes: dict, user_id: int | None) -> PricingRule:
    allowed = {"unit_price", "discount_pct", "included_units", "tiers", "pricing_model", "minimum_commitment", "notes"}
    bad = set(changes) - allowed
    if bad:
        raise ValueError(f"Cannot change {sorted(bad)}")
    if not changes:
        raise ValueError("No changes proposed")
    next_version = (db.scalar(select(func.max(PricingRule.rule_version)).where(PricingRule.tenant_id == base.tenant_id,
                                                                               PricingRule.rule_key == base.rule_key)) or 0) + 1
    r = PricingRule(tenant_id=base.tenant_id, rule_key=base.rule_key, rule_version=next_version,
                    contract_version_id=base.contract_version_id, product_id=base.product_id, charge_type=base.charge_type,
                    pricing_model=changes.get("pricing_model", base.pricing_model),
                    unit_price=D(changes.get("unit_price", base.unit_price)), included_units=D(changes.get("included_units", base.included_units)),
                    tiers=changes.get("tiers", base.tiers), discount_pct=D(changes.get("discount_pct", base.discount_pct)),
                    minimum_commitment=D(changes.get("minimum_commitment", base.minimum_commitment)), status="PROPOSED",
                    effective_from=base.effective_from, effective_to=base.effective_to,
                    notes=changes.get("notes", f"Proposed change to {base.rule_key} v{base.rule_version}"))
    db.add(r)
    db.flush()
    return r


def _features(calc, version_count: int) -> list[str]:
    feats = set()
    for c in calc.components:
        if c.component_type == "DISCOUNT":
            feats.add("discount")
        if c.component_type == "USAGE":
            feats.add("allowance" if D(c.inputs.get("included", "0")) > 0 else "usage")
            if len(c.inputs.get("tiers", [])) > 1:
                feats.add("tiers")
        if c.inputs.get("prorated"):
            feats.add("proration")
        if c.amount != c.amount.quantize(Decimal("1")):
            feats.add("rounding")
        if c.component_type == "MINIMUM_TRUE_UP":
            feats.add("minimum_commitment")
    if version_count > 1:
        feats.add("contract_change")
    return sorted(feats) or ["flat"]


def run_suite(db: Session, suite: RegressionTestSuite) -> dict:
    proposed = list(db.scalars(select(PricingRule).where(PricingRule.id.in_(suite.proposed_rule_ids or [0]),
                                                         PricingRule.tenant_id == suite.tenant_id, PricingRule.status == "PROPOSED")))
    if not proposed:
        raise ValueError("The suite has no PROPOSED rules to test")
    overrides = {r.rule_key: r for r in proposed}
    version_ids = {r.contract_version_id for r in proposed if r.contract_version_id}
    contract_ids = set(db.scalars(select(ContractVersion.contract_id).where(ContractVersion.id.in_(version_ids or [0]))))
    customer_ids = sorted(set(db.scalars(select(Subscription.customer_id).where(Subscription.contract_id.in_(contract_ids or [0])))))
    product_ids = sorted({r.product_id for r in proposed})
    if not customer_ids:  # price-book rule (no contract version): every customer with the product
        customer_ids = sorted(set(db.scalars(select(Subscription.customer_id).where(Subscription.product_id.in_(product_ids)))))
    cur = build_expected_obligations(db, suite.tenant_id, suite.replay_period_start, suite.replay_period_end, customer_ids, product_ids)
    new = build_expected_obligations(db, suite.tenant_id, suite.replay_period_start, suite.replay_period_end, customer_ids, product_ids,
                                     rule_overrides=overrides)
    new_by_key = {o.key: o for o in new.obligations}
    names = dict(db.execute(select(Customer.id, Customer.name).where(Customer.id.in_(customer_ids))).all())
    db.query(RegressionTestResult).filter(RegressionTestResult.suite_id == suite.id).delete()
    tol = D(suite.tolerance)
    results, passed, failed, total_diff = [], 0, 0, Decimal("0")
    for o in cur.obligations:
        if o.calc is None or not any(c.pricing_rule_ref.split("@")[0] in overrides for c in o.calc.components):
            continue
        n = new_by_key.get(o.key)
        cur_amt = o.calc.total
        new_amt = n.calc.total if n and n.calc else Decimal("0")
        diff = money(new_amt - cur_amt)
        outcome = "PASSED" if abs(diff) <= tol else "FAILED"
        passed += outcome == "PASSED"
        failed += outcome == "FAILED"
        total_diff += diff
        versions = len({c.contract_version_id for c in o.calc.components})
        details = {"customer": names.get(o.customer_id), "subscription": o.subscription_code, "charge_type": o.charge_type,
                   "period": f"{o.period_start}..{o.period_end}", "features": _features(o.calc, versions),
                   "current_formula": [c.formula for c in o.calc.components],
                   "proposed_formula": [c.formula for c in n.calc.components] if n and n.calc else []}
        db.add(RegressionTestResult(tenant_id=suite.tenant_id, suite_id=suite.id, case_key=o.key, outcome=outcome,
                                    current_amount=cur_amt, proposed_amount=new_amt, difference=diff, details=details))
        results.append(details | {"case_key": o.key, "outcome": outcome, "current": cur_amt, "proposed": new_amt, "difference": diff})
    features = {}
    for r in results:
        for f in r["features"]:
            agg = features.setdefault(f, {"cases": 0, "failed": 0})
            agg["cases"] += 1
            agg["failed"] += r["outcome"] == "FAILED"
    return {"cases": len(results), "passed": passed, "failed": failed, "total_difference": money(total_diff),
            "features": features, "customers_affected": len({r["customer"] for r in results if r["outcome"] == "FAILED"})}


def activate(db: Session, suite: RegressionTestSuite, effective_from: date) -> list[str]:
    """Explicit activation after approval. The proposed version takes effect from ``effective_from``;
    the version it replaces is end-dated the day before (and kept, RETIRED) so every historical
    period is still priced — and replayable — with the rule that applied at the time."""
    if suite.approval_status != "APPROVED":
        raise ValueError("Only APPROVED suites can be activated")
    done = []
    for r in db.scalars(select(PricingRule).where(PricingRule.id.in_(suite.proposed_rule_ids or [0]), PricingRule.status == "PROPOSED")):
        for old in db.scalars(select(PricingRule).where(PricingRule.tenant_id == r.tenant_id, PricingRule.rule_key == r.rule_key,
                                                        PricingRule.status == "ACTIVE")):
            if old.effective_from and old.effective_from >= effective_from:
                raise ValueError(f"{old.rule_key} v{old.rule_version} starts on/after {effective_from}")
            old.status, old.effective_to = "RETIRED", effective_from - timedelta(days=1)
        r.status, r.effective_from = "ACTIVE", effective_from
        done.append(f"{r.rule_key} v{r.rule_version} from {effective_from}")
    suite.approval_status = "ACTIVATED"
    suite.updated_at = datetime.now(UTC)
    return done


def default_period() -> tuple[date, date]:
    return date(2026, 5, 1), date(2026, 10, 31)
