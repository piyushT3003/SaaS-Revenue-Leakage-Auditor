import pytest
from decimal import Decimal
import json
from backend.app.analytics.financial_engine import FinancialCalculationEngine, quantize_money

def test_quantize_money():
    assert quantize_money(Decimal("12480000.456")) == Decimal("12480000.46")
    assert quantize_money(None) == Decimal("0.00")
    assert quantize_money(100.5) == Decimal("100.50")

def test_expected_charges_basic():
    # Fixed fee 1,50,000 with 10% discount, 50 units actual, 100 included -> billable units = 0
    res = FinancialCalculationEngine.calculate_expected_charges(
        fixed_fee=Decimal("150000.00"),
        discount_pct=Decimal("10.00"),
        actual_units=Decimal("50"),
        included_units=Decimal("100"),
        rate_per_unit=Decimal("500.00")
    )
    assert res["gross_fixed_fee"] == Decimal("150000.00")
    assert res["discount_amount"] == Decimal("15000.00")
    assert res["net_fixed_charge"] == Decimal("135000.00")
    assert res["billable_units"] == Decimal("0.0")
    assert res["usage_charge"] == Decimal("0.00")
    assert res["total_expected"] == Decimal("135000.00")

def test_expected_charges_with_overage():
    # 250 units actual, 100 included = 150 billable units at 500/unit = 75,000
    res = FinancialCalculationEngine.calculate_expected_charges(
        fixed_fee=Decimal("100000.00"),
        discount_pct=Decimal("0.00"),
        actual_units=Decimal("250"),
        included_units=Decimal("100"),
        rate_per_unit=Decimal("500.00")
    )
    assert res["billable_units"] == Decimal("150.0")
    assert res["usage_charge"] == Decimal("75000.00")
    assert res["total_expected"] == Decimal("175000.00")

def test_expected_charges_tiered():
    tier_config = json.dumps([
        {"up_to": 100, "rate": "10.00"},
        {"up_to": 200, "rate": "8.00"},
        {"up_to": -1, "rate": "5.00"}
    ])
    # 350 billable units:
    # 100 @ 10 = 1000
    # 100 @ 8 = 800
    # 150 @ 5 = 750
    # total usage = 2550
    res = FinancialCalculationEngine.calculate_expected_charges(
        fixed_fee=Decimal("10000.00"),
        discount_pct=Decimal("0.00"),
        actual_units=Decimal("350"),
        included_units=Decimal("0"),
        rate_per_unit=Decimal("0"),
        tier_config_json=tier_config
    )
    assert res["usage_charge"] == Decimal("2550.00")
    assert res["total_expected"] == Decimal("12550.00")

def test_underbilling_and_overbilling():
    # Expected: 3,00,000, Billed: 2,40,000 -> Underbilled by 60,000 (TechNova case)
    under = FinancialCalculationEngine.calculate_underbilling(
        expected_charges=Decimal("300000.00"),
        invoiced_charges=Decimal("240000.00")
    )
    assert under == Decimal("60000.00")

    # Invoiced > Expected
    over = FinancialCalculationEngine.calculate_overbilling(
        expected_charges=Decimal("200000.00"),
        invoiced_charges=Decimal("250000.00")
    )
    assert over == Decimal("50000.00")

def test_outstanding_balance():
    # Total 1,00,000, paid 60,000, credit 5,000 -> Balance 35,000
    bal = FinancialCalculationEngine.calculate_outstanding_balance(
        total_amount=Decimal("100000.00"),
        paid_amount=Decimal("60000.00"),
        credit_adjustments=Decimal("5000.00")
    )
    assert bal == Decimal("35000.00")

def test_collection_rate():
    # 8,00,000 collected on 10,00,000 collectible = 80.0%
    rate = FinancialCalculationEngine.calculate_collection_rate(
        applied_payments=Decimal("800000.00"),
        collectible_invoices=Decimal("1000000.00")
    )
    assert rate == Decimal("80.0")

    # Zero denominator
    assert FinancialCalculationEngine.calculate_collection_rate(
        applied_payments=Decimal("0.00"),
        collectible_invoices=Decimal("0.00")
    ) == Decimal("0.0")

def test_contribution_margin():
    # Formula: (Net Revenue - Direct Costs) / Net Revenue * 100
    # Revenue = 1,00,000, Direct Costs = 67,400 -> Margin = 32.6% (matching master dashboard!)
    cm = FinancialCalculationEngine.calculate_contribution_margin(
        net_revenue=Decimal("100000.00"),
        direct_costs=Decimal("67400.00")
    )
    assert cm["contribution"] == Decimal("32600.00")
    assert cm["margin_pct"] == Decimal("32.6")

def test_reconciliation_rate():
    # 180 matched out of 200 = 90.0%
    rate = FinancialCalculationEngine.calculate_reconciliation_rate(180, 200)
    assert rate == Decimal("90.0")
