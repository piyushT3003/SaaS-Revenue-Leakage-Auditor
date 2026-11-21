"""Build expected billing obligations for an audit window.

STAGE 5 of the workflow: for every eligible customer, subscription and billing period,
reconstruct what should have been billed using the contract version(s) in force, pricing
rules, allowances, usage, discounts and proration. Anything that cannot be calculated is kept
as an *excluded* obligation with an explicit reason — never silently dropped or guessed.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, replace
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from backend.app.analytics.calculation import (
    CalculationError,
    ObligationCalculation,
    calculate_one_time,
    calculate_recurring,
    calculate_usage,
    month_end,
    periods_starting_in,
)
from backend.app.models import PricingRule, Tenant
from backend.app.reconciliation.terms import (
    load_subscriptions,
    load_usage_by_day,
    subscription_terms,
    usage_signal_for_month,
    version_terms,
)


def obligation_key(tenant_code: str, subscription_code: str, charge_type: str, period_start: date, period_end: date) -> str:
    """Deterministic, portable identity: the same obligation always gets the same key."""
    raw = f"{tenant_code}|{subscription_code}|{charge_type}|{period_start.isoformat()}|{period_end.isoformat()}"
    return "OBL-" + hashlib.sha256(raw.encode()).hexdigest()[:20].upper()


@dataclass
class ExpectedObligation:
    key: str
    customer_id: int
    contract_id: int
    subscription_id: int
    subscription_code: str
    product_id: int
    charge_type: str
    period_start: date
    period_end: date
    currency: str
    calc: ObligationCalculation | None = None
    exclusion_code: str = ""
    exclusion_reason: str = ""
    notes: list[str] = field(default_factory=list)

    @property
    def excluded(self) -> bool:
        return bool(self.exclusion_code)


@dataclass
class BuildResult:
    obligations: list[ExpectedObligation]
    subscriptions_considered: int
    usage_signal: dict[str, dict]


def build_expected_obligations(
    db: Session,
    tenant_id: int,
    window_start: date,
    window_end: date,
    customer_ids: list[int] | None = None,
    product_ids: list[int] | None = None,
    rule_overrides: dict[str, PricingRule] | None = None,
    quantity_factors: dict[int, Decimal] | None = None,
) -> BuildResult:
    tenant = db.get(Tenant, tenant_id)
    subs = load_subscriptions(db, tenant_id, window_start, window_end, customer_ids, product_ids)
    usage_sub_ids = [s.id for s in subs if s.product.charge_model == "USAGE"]
    usage = load_usage_by_day(db, tenant_id, usage_sub_ids, window_start, month_end(window_end))
    month_periods = periods_starting_in(window_start, window_end, "MONTHLY")
    signals = {p[0].isoformat(): usage_signal_for_month(db, tenant_id, p[0], p[1]) for p in month_periods}

    out: list[ExpectedObligation] = []
    for s in subs:
        terms = subscription_terms(s)
        if quantity_factors and s.product_id in quantity_factors:  # what-if only; never persisted
            terms = replace(terms, quantity=(terms.quantity * quantity_factors[s.product_id]).quantize(Decimal("0.0001")))
        versions = [version_terms(v, rule_overrides) for v in s.contract.versions]
        currency_issue = s.contract.currency != tenant.base_currency

        def make(charge_type: str, p_start: date, p_end: date) -> ExpectedObligation:
            return ExpectedObligation(
                key=obligation_key(tenant.code, s.subscription_code, charge_type, p_start, p_end),
                customer_id=s.customer_id, contract_id=s.contract_id, subscription_id=s.id,
                subscription_code=s.subscription_code, product_id=s.product_id, charge_type=charge_type,
                period_start=p_start, period_end=p_end, currency=s.contract.currency,
            )

        def attempt(ob: ExpectedObligation, fn) -> None:
            try:
                calc = fn()
            except CalculationError as err:
                ob.exclusion_code, ob.exclusion_reason = err.code, str(err)
                out.append(ob)
                return
            if calc is None:
                return
            ob.calc = calc
            if currency_issue:
                ob.exclusion_code = "CURRENCY_UNSUPPORTED"
                ob.exclusion_reason = (f"Contract currency {s.contract.currency} differs from base currency "
                                       f"{tenant.base_currency} and no FX rates are configured")
            out.append(ob)

        if s.product.charge_model == "RECURRING":
            for p_start, p_end in periods_starting_in(window_start, window_end, s.billing_frequency):
                attempt(make("RECURRING", p_start, p_end), lambda a=p_start, b=p_end: calculate_recurring(terms, a, b, versions))
        else:
            sub_usage = usage.get(s.id, {})
            for p_start, p_end in month_periods:
                ob = make("USAGE", p_start, p_end)
                month_usage = {d: q for d, q in sub_usage.items() if p_start <= d <= p_end}
                start, end = terms.active_window()
                active = start <= p_end and (end is None or end >= p_start)
                if active and not month_usage and not signals[p_start.isoformat()]["covered"]:
                    ob.exclusion_code = "NO_USAGE_SIGNAL"
                    ob.exclusion_reason = ("No usage events and no usage batch covering this month were received; "
                                           "the usage charge cannot be confirmed (absence of data is not zero usage)")
                    out.append(ob)
                    continue
                attempt(ob, lambda a=p_start, b=p_end, u=month_usage: calculate_usage(terms, a, b, versions, u))
        has_one_time = any(r.charge_type == "ONE_TIME" and r.product_id == s.product_id for v in versions for r in v.rules)
        if has_one_time:
            for p_start, p_end in month_periods:
                attempt(make("ONE_TIME", p_start, p_end), lambda a=p_start, b=p_end: calculate_one_time(terms, a, b, versions))

    return BuildResult(obligations=out, subscriptions_considered=len(subs), usage_signal=signals)
