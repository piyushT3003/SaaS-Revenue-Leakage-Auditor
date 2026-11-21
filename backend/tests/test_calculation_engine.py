"""Hand-computed fixtures for the pure expected-charge engine."""
from datetime import date
from decimal import Decimal as Dec

import pytest

from backend.app.analytics.calculation import (
    CalculationError,
    RuleTerms,
    SubscriptionTerms,
    VersionTerms,
    calculate_recurring,
    calculate_usage,
    monthly_recurring_value,
    periods_starting_in,
    price_quantity,
)


def rule(**kw):
    base = dict(id=1, rule_key="R", rule_version=1, product_id=10, charge_type="RECURRING", pricing_model="PER_UNIT",
                unit_price=Dec("1000"), included_units=Dec("0"), tiers=(), discount_pct=Dec("0"))
    base.update(kw)
    return RuleTerms(**base)


def version(n, start, end, *rules):
    return VersionTerms(id=n, version_number=n, effective_from=start, effective_to=end, rules=tuple(rules))


SUB = SubscriptionTerms(id=1, product_id=10, quantity=Dec("10"), start_date=date(2026, 1, 1), end_date=None)


def test_full_month_recurring_with_discount():
    calc = calculate_recurring(SUB, date(2026, 10, 1), date(2026, 10, 31),
                               [version(1, date(2026, 1, 1), None, rule(discount_pct=Dec("10")))])
    # 1000 × 10 seats = 10,000 ; −10% = −1,000
    assert [c.amount for c in calc.components] == [Dec("10000.00"), Dec("-1000.00")]
    assert calc.total == Dec("9000.00")


def test_mid_month_start_is_prorated():
    sub = SubscriptionTerms(id=1, product_id=10, quantity=Dec("1"), start_date=date(2026, 10, 17), end_date=None)
    calc = calculate_recurring(sub, date(2026, 10, 1), date(2026, 10, 31),
                               [version(1, date(2026, 1, 1), None, rule(unit_price=Dec("3100")))])
    # active 17..31 = 15 days of 31 → 3100 × 15/31 = 1500.00
    assert calc.total == Dec("1500.00")


def test_contract_change_inside_period_splits_segments():
    """Spec TEST 10: historical contract change within a billing period."""
    v1 = version(1, date(2026, 1, 1), date(2026, 10, 15), rule(id=1, unit_price=Dec("500")))
    v2 = version(2, date(2026, 10, 16), None, rule(id=2, rule_version=2, unit_price=Dec("600")))
    calc = calculate_recurring(SUB, date(2026, 10, 1), date(2026, 10, 31), [v1, v2])
    # v1: 500 × 10 × 15/31 = 2419.354.. → 2419.35 ; v2: 600 × 10 × 16/31 = 3096.774.. → 3096.77
    assert [(c.contract_version_number, c.amount) for c in calc.components] == [(1, Dec("2419.35")), (2, Dec("3096.77"))]
    assert calc.total == Dec("5516.12")
    assert calc.expected_unit_price is None  # mixed rates are reported per segment


def test_quarterly_period_months_multiplier():
    sub = SubscriptionTerms(id=1, product_id=10, quantity=Dec("2"), start_date=date(2026, 1, 1), end_date=None, billing_frequency="QUARTERLY")
    calc = calculate_recurring(sub, date(2026, 10, 1), date(2026, 12, 31), [version(1, date(2026, 1, 1), None, rule())])
    assert calc.total == Dec("6000.00")  # 1000 × 2 × 3 months


def test_version_gap_is_an_error_not_a_guess():
    with pytest.raises(CalculationError) as err:
        calculate_recurring(SUB, date(2026, 10, 1), date(2026, 10, 31), [version(1, date(2026, 1, 1), date(2026, 10, 20), rule())])
    assert err.value.code == "VERSION_GAP"


def test_usage_per_unit_with_allowance():
    r = rule(charge_type="USAGE", unit_price=Dec("0.50"), included_units=Dec("1000"))
    usage = {date(2026, 10, d): Dec("100") for d in range(1, 31)}  # 3000 units
    calc = calculate_usage(SUB, date(2026, 10, 1), date(2026, 10, 31), [version(1, date(2026, 1, 1), None, r)], usage)
    assert calc.total == Dec("1000.00")  # (3000 − 1000) × 0.50
    assert calc.expected_quantity == Dec("2000")


def test_graduated_and_volume_tiers():
    tiers = ((Dec("1000"), Dec("1.00")), (Dec("5000"), Dec("0.80")), (None, Dec("0.50")))
    grad = rule(charge_type="USAGE", pricing_model="TIERED_GRADUATED", tiers=tiers)
    vol = rule(charge_type="USAGE", pricing_model="TIERED_VOLUME", tiers=tiers)
    assert price_quantity(Dec("6000"), grad)[0] == Dec("1000") + Dec("3200") + Dec("500")
    assert price_quantity(Dec("6000"), vol)[0] == Dec("3000.00")
    assert price_quantity(Dec("800"), grad)[0] == Dec("800.00")


def test_minimum_commitment_true_up():
    r = rule(charge_type="USAGE", unit_price=Dec("1"), minimum_commitment=Dec("5000"))
    calc = calculate_usage(SUB, date(2026, 10, 1), date(2026, 10, 31), [version(1, date(2026, 1, 1), None, r)], {date(2026, 10, 5): Dec("1200")})
    assert calc.total == Dec("5000.00")
    assert calc.components[-1].component_type == "MINIMUM_TRUE_UP"


def test_mrr_normalises_and_applies_discount():
    sub = SubscriptionTerms(id=1, product_id=10, quantity=Dec("4"), start_date=date(2026, 1, 1), end_date=None, billing_frequency="ANNUAL")
    assert monthly_recurring_value(sub, [version(1, date(2026, 1, 1), None, rule(discount_pct=Dec("25")))], date(2026, 10, 31)) == Dec("3000.00")


def test_periods_are_assigned_to_exactly_one_window():
    assert periods_starting_in(date(2026, 10, 1), date(2026, 10, 31), "QUARTERLY") == [(date(2026, 10, 1), date(2026, 12, 31))]
    assert periods_starting_in(date(2026, 11, 1), date(2026, 11, 30), "QUARTERLY") == []
    assert len(periods_starting_in(date(2026, 1, 1), date(2026, 12, 31), "MONTHLY")) == 12
