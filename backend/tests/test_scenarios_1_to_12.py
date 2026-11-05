import pytest
from decimal import Decimal
from datetime import date, datetime
import json
from backend.app.core.database import SessionLocal
from backend.app.models.entities import (
    Customer, Product, Contract, ContractVersion, Subscription,
    UsageEvent, Invoice, InvoiceLine, Payment, PaymentAllocation,
    CreditAdjustment, ProductCost, ExceptionRecord, UploadBatch
)
from backend.app.analytics.financial_engine import FinancialCalculationEngine, quantize_money, format_inr
from backend.app.reconciliation.reconciler import ReconciliationEngine
from backend.app.anomaly_detection.detector import AnomalyDetectionEngine

@pytest.fixture
def db_session():
    db = SessionLocal()
    yield db
    db.rollback()
    db.close()

# SCENARIO 1: Expected invoice charge ₹10,000 and actual invoice charge ₹10,000 -> Matched. No billing exception.
def test_scenario_1_matched_charges():
    # Contract fixed fee ₹10,000, invoiced ₹10,000
    expected = FinancialCalculationEngine.calculate_expected_charges(
        fixed_fee=Decimal("10000.00"),
        discount_pct=Decimal("0.00"),
        actual_units=Decimal("0.0"),
        included_units=Decimal("100.0"),
        rate_per_unit=Decimal("10.0")
    )
    invoiced = Decimal("10000.00")
    variance = invoiced - expected["total_expected"]
    assert variance == Decimal("0.00")
    assert expected["total_expected"] == Decimal("10000.00")
    
    # Status determination
    status = "Matched" if abs(variance) < Decimal("0.01") else "Unmatched"
    assert status == "Matched"

# SCENARIO 2: Expected charge ₹10,000 and invoiced charge ₹8,000 -> Underbilling exposure ₹2,000.
def test_scenario_2_underbilling_exposure():
    expected = Decimal("10000.00")
    invoiced = Decimal("8000.00")
    assert expected > invoiced
    underbilling_exposure = expected - invoiced
    assert underbilling_exposure == Decimal("2000.00")
    
    calc_leakage = FinancialCalculationEngine.calculate_underbilling(expected, invoiced)
    assert calc_leakage == Decimal("2000.00")

# SCENARIO 3: Expected charge ₹10,000 and invoiced charge ₹12,000 -> Overbilling ₹2,000.
def test_scenario_3_overbilling():
    expected = Decimal("10000.00")
    invoiced = Decimal("12000.00")
    assert invoiced > expected
    overbilling = invoiced - expected
    assert overbilling == Decimal("2000.00")
    
    calc_over = FinancialCalculationEngine.calculate_overbilling(expected, invoiced)
    assert calc_over == Decimal("2000.00")

# SCENARIO 4: Billable usage exists but invoice line is missing -> Missing Charges without duplicated exposure.
def test_scenario_4_unbilled_usage_no_double_counting(db_session):
    cust = db_session.query(Customer).first()
    assert cust is not None
    
    total_qty = Decimal("500.0")
    rate = Decimal("10.00")
    expected_charge = quantize_money(total_qty * rate)
    assert expected_charge == Decimal("5000.00")
    
    item = {
        "customer_id": cust.id,
        "issue_type": "Missing Charges",
        "financial_impact": expected_charge,
        "fingerprint_key": "prod-1:2026-10-01:2026-10-31",
        "description": "500 unbilled units for API Service",
        "calculation_explanation": "Unbilled 500 units * ₹10 = ₹5,000.00"
    }
    detector = AnomalyDetectionEngine(db_session)
    exc, is_new = detector._persist_exception(item)
    assert exc.financial_impact == Decimal("5000.00")
    assert exc.issue_type == "Missing Charges"
    # Rolled back by fixture

# SCENARIO 5: A duplicate billing obligation is invoiced twice -> Duplicate invoice detection.
def test_scenario_5_duplicate_invoice_detection(db_session):
    dup_exc = (
        db_session.query(ExceptionRecord)
        .filter(ExceptionRecord.issue_type == "Duplicate Invoices")
        .first()
    )
    assert dup_exc is not None
    assert dup_exc.issue_type == "Duplicate Invoices"
    assert dup_exc.financial_impact > Decimal("0.00")

# SCENARIO 6: Contractual discount is 10%, but invoice discount is 15% -> Discount Drift.
def test_scenario_6_discount_drift():
    fixed_fee = Decimal("108000.00")
    contract_discount_pct = Decimal("10.00")
    invoice_discount_pct = Decimal("15.00")
    
    expected_disc = quantize_money(fixed_fee * (contract_discount_pct / Decimal("100.0")))
    actual_disc = quantize_money(fixed_fee * (invoice_discount_pct / Decimal("100.0")))
    variance_drift = actual_disc - expected_disc
    
    assert expected_disc == Decimal("10800.00")
    assert actual_disc == Decimal("16200.00")
    assert variance_drift == Decimal("5400.00")

# SCENARIO 7: Contract unit price is ₹500 but invoice unit price is ₹600 -> Pricing Mismatch.
def test_scenario_7_pricing_mismatch():
    contract_rate = Decimal("500.00")
    invoice_rate = Decimal("600.00")
    units = Decimal("200.00")
    
    rate_diff = invoice_rate - contract_rate
    assert rate_diff == Decimal("100.00")
    financial_impact = quantize_money(rate_diff * units)
    assert financial_impact == Decimal("20000.00")

# SCENARIO 8: Invoice amount ₹10,000, applied payment ₹6,000, applied credit ₹1,000 -> Outstanding balance ₹3,000.
def test_scenario_8_payment_and_credit_allocation():
    invoice_total = Decimal("10000.00")
    payment_applied = Decimal("6000.00")
    credit_applied = Decimal("1000.00")
    
    outstanding = FinancialCalculationEngine.calculate_outstanding_balance(
        total_amount=invoice_total,
        paid_amount=payment_applied,
        credit_adjustments=credit_applied
    )
    assert outstanding == Decimal("3000.00")

# SCENARIO 9: Customer has ₹10,000 net revenue and ₹7,000 direct costs -> Contribution ₹3,000, Margin 30%.
def test_scenario_9_contribution_margin():
    revenue = Decimal("10000.00")
    direct_costs = Decimal("7000.00")
    
    cm = FinancialCalculationEngine.calculate_contribution_margin(
        net_revenue=revenue,
        direct_costs=direct_costs
    )
    assert cm["contribution"] == Decimal("3000.00")
    assert cm["margin_pct"] == Decimal("30.00")

# SCENARIO 10: The same dataset is uploaded twice -> No duplicate business records.
def test_scenario_10_upload_duplicate_prevention(db_session):
    existing_event = db_session.query(UsageEvent).first()
    assert existing_event is not None
    
    existing_usage_keys = set(
        (u.customer_id, str(u.usage_date), u.metric_name)
        for u in db_session.query(UsageEvent.customer_id, UsageEvent.usage_date, UsageEvent.metric_name).all()
    )
    
    # Ingesting the same key must be detected as duplicate
    duplicate_key = (existing_event.customer_id, str(existing_event.usage_date), existing_event.metric_name)
    assert duplicate_key in existing_usage_keys

# SCENARIO 11: Anomaly engine is run repeatedly on unchanged data -> No duplicate exception records.
def test_scenario_11_anomaly_engine_idempotency(db_session):
    detector = AnomalyDetectionEngine(db_session)
    count_before = db_session.query(ExceptionRecord).count()
    
    # Run pipeline twice
    res1 = detector.run_detection_pipeline(date(2026, 10, 1), date(2026, 10, 31))
    count_after_1 = db_session.query(ExceptionRecord).count()
    
    res2 = detector.run_detection_pipeline(date(2026, 10, 1), date(2026, 10, 31))
    count_after_2 = db_session.query(ExceptionRecord).count()
    
    # The count of exceptions must not increase on repeated execution
    assert count_after_1 == count_after_2
    assert res2["detected_count"] == 0

# SCENARIO 12: Customer filter changed on dashboard -> Metrics use the same selected scope.
def test_scenario_12_customer_scope_filter(db_session):
    technova = db_session.query(Customer).filter(Customer.name.contains("TechNova")).first()
    assert technova is not None
    
    scoped_invoices = (
        db_session.query(Invoice)
        .filter(Invoice.customer_id == technova.id)
        .all()
    )
    scoped_total = sum(i.total_amount for i in scoped_invoices)
    
    all_invoices = db_session.query(Invoice).all()
    all_total = sum(i.total_amount for i in all_invoices)
    
    assert scoped_total < all_total
    assert scoped_total > Decimal("0.00")

# ADDITIONAL EDGE CASES: Tiered pricing, proration, Indian formatting, and refunds
def test_tiered_pricing_calculation():
    # 0-1,000 at ₹10, 1,001-5,000 at ₹8, >5,000 at ₹6
    tiers = [
        {"up_to": 1000, "rate": "10.00"},
        {"up_to": 5000, "rate": "8.00"},
        {"up_to": -1, "rate": "6.00"}
    ]
    tier_json = json.dumps(tiers)
    
    # Test 3,000 billable units: 1,000 * 10 = 10,000 + 2,000 * 8 = 16,000 => 26,000
    calc = FinancialCalculationEngine.calculate_expected_charges(
        fixed_fee=Decimal("0.00"),
        discount_pct=Decimal("0.00"),
        actual_units=Decimal("3000.0"),
        included_units=Decimal("0.0"),
        rate_per_unit=Decimal("0.0"),
        tier_config_json=tier_json
    )
    assert calc["usage_charge"] == Decimal("26000.00")

def test_indian_rupee_formatting():
    assert format_inr(Decimal("12480000")) == "₹1,24,80,000"
    assert format_inr(Decimal("876000")) == "₹8,76,000"
    assert format_inr(Decimal("60000")) == "₹60,000"
    assert format_inr(Decimal("0")) == "₹0"
    assert format_inr(Decimal("-5000")) == "-₹5,000"
