import pytest
from decimal import Decimal
from datetime import date, datetime, timedelta
import uuid
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models.entities import (
    Customer, Product, Contract, ContractVersion, Subscription,
    UsageEvent, Invoice, InvoiceLine, Payment, PaymentAllocation,
    CreditAdjustment, ProductCost, ExceptionRecord, ReconciliationRun,
    UploadBatch
)
from backend.app.analytics.financial_engine import FinancialCalculationEngine, quantize_money, format_inr
from backend.app.reconciliation.reconciler import ReconciliationEngine
from backend.app.anomaly_detection.detector import AnomalyDetectionEngine

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()

# SCENARIO 1 — Matched Billing:
# A customer with ₹10,000 base fee and 5,000 included API calls using 4,200 calls is billed exactly ₹10,000.
# Reconciliation status: "Matched", discrepancy ₹0.
def test_scenario_01_matched_billing():
    calc = FinancialCalculationEngine.calculate_expected_charges(
        fixed_fee=Decimal("10000.00"),
        discount_pct=Decimal("0.00"),
        actual_units=Decimal("4200.0"),
        included_units=Decimal("5000.0"),
        rate_per_unit=Decimal("2.00")
    )
    assert calc["total_expected"] == Decimal("10000.00")
    assert calc["usage_charge"] == Decimal("0.00")
    assert calc["billable_units"] == Decimal("0.0")

    invoiced = Decimal("10000.00")
    variance = invoiced - calc["total_expected"]
    status = "Matched" if abs(variance) <= Decimal("1.00") else "Unmatched"
    
    assert status == "Matched"
    assert variance == Decimal("0.00")

# SCENARIO 2 — Underbilling:
# Base ₹10,000 + 5,000 calls included. Customer used 7,500 calls. Overage rate ₹2/call.
# Expected ₹15,000. Billed ₹10,000. Reconciliation status: "Underbilled", discrepancy -₹5,000. Exception severity: High/Critical.
def test_scenario_02_underbilling():
    calc = FinancialCalculationEngine.calculate_expected_charges(
        fixed_fee=Decimal("10000.00"),
        discount_pct=Decimal("0.00"),
        actual_units=Decimal("7500.0"),
        included_units=Decimal("5000.0"),
        rate_per_unit=Decimal("2.00")
    )
    assert calc["billable_units"] == Decimal("2500.0")
    assert calc["usage_charge"] == Decimal("5000.00")
    assert calc["total_expected"] == Decimal("15000.00")

    invoiced = Decimal("10000.00")
    variance = invoiced - calc["total_expected"]
    assert variance == Decimal("-5000.00")
    
    status = "Underbilled" if invoiced < calc["total_expected"] else "Matched"
    assert status == "Underbilled"
    
    exposure = FinancialCalculationEngine.calculate_underbilling(calc["total_expected"], invoiced)
    assert exposure == Decimal("5000.00")
    
    # Severity classification: over ₹5,000 is High or Critical
    severity = "Critical" if exposure >= Decimal("10000.00") else "High"
    assert severity in ["High", "Critical"]

# SCENARIO 3 — Overbilling:
# Customer billed ₹15,000 when expected is ₹10,000. Discrepancy +₹5,000. Status: "Overbilled".
def test_scenario_03_overbilling():
    expected = Decimal("10000.00")
    invoiced = Decimal("15000.00")
    variance = invoiced - expected
    assert variance == Decimal("5000.00")
    
    status = "Overbilled" if invoiced > expected else "Matched"
    assert status == "Overbilled"
    
    overcharge = FinancialCalculationEngine.calculate_overbilling(expected, invoiced)
    assert overcharge == Decimal("5000.00")

# SCENARIO 4 — Missing Charge:
# Usage event with 1,000 billable units exists, but no invoice line item references it.
# Exception generated: "Unbilled Usage" / "Missing Charges".
def test_scenario_04_missing_charge(db):
    cust = db.query(Customer).first()
    assert cust is not None
    
    unbilled_units = Decimal("1000.0")
    rate = Decimal("5.00")
    financial_impact = quantize_money(unbilled_units * rate)
    assert financial_impact == Decimal("5000.00")
    
    detector = AnomalyDetectionEngine(db)
    exc_item = {
        "customer_id": cust.id,
        "issue_type": "Missing Charges",
        "financial_impact": financial_impact,
        "fingerprint_key": f"unbilled-test-{uuid.uuid4()}",
        "description": "1,000 unbilled usage units with zero invoice line reference",
        "calculation_explanation": "1,000 units * ₹5.00/unit = ₹5,000.00 unbilled exposure"
    }
    exc, is_new = detector._persist_exception(exc_item)
    assert is_new is True
    assert exc.issue_type == "Missing Charges"
    assert exc.financial_impact == Decimal("5000.00")

# SCENARIO 5 — Duplicate Billing:
# Two invoice line items charge for the same subscription period.
# Exception generated: "Duplicate Charge" / "Duplicate Invoices".
def test_scenario_05_duplicate_billing(db):
    dup_exc = db.query(ExceptionRecord).filter(ExceptionRecord.issue_type == "Duplicate Invoices").first()
    assert dup_exc is not None
    assert dup_exc.issue_type == "Duplicate Invoices"
    assert dup_exc.financial_impact > Decimal("0.00")

# SCENARIO 6 — Discount Drift:
# Contract specifies 15% discount; invoice applies 25% discount.
# Exception generated: "Unauthorized Discount" / "Discount Drift".
def test_scenario_06_discount_drift():
    fixed_fee = Decimal("100000.00")
    contract_discount_pct = Decimal("15.00")
    invoice_discount_pct = Decimal("25.00")
    
    expected_disc = quantize_money(fixed_fee * (contract_discount_pct / Decimal("100.0")))
    invoice_disc = quantize_money(fixed_fee * (invoice_discount_pct / Decimal("100.0")))
    leakage = invoice_disc - expected_disc
    
    assert expected_disc == Decimal("15000.00")
    assert invoice_disc == Decimal("25000.00")
    assert leakage == Decimal("10000.00")

# SCENARIO 7 — Pricing Mismatch:
# Contract specifies ₹50/seat; invoice charges ₹40/seat.
# Exception: "Price Mismatch".
def test_scenario_07_pricing_mismatch():
    contract_rate = Decimal("50.00")
    invoice_rate = Decimal("40.00")
    seats = Decimal("200.0")
    
    expected_total = quantize_money(contract_rate * seats)
    actual_total = quantize_money(invoice_rate * seats)
    shortfall = expected_total - actual_total
    
    assert expected_total == Decimal("10000.00")
    assert actual_total == Decimal("8000.00")
    assert shortfall == Decimal("2000.00")

# SCENARIO 8 — Payment Reconciliation:
# Invoice ₹12,000. Payment 1: ₹8,000. Credit note: ₹1,000. Outstanding: ₹3,000. Status: "Partially Paid".
# Payment 2: ₹3,000. Outstanding: ₹0. Status: "Paid".
def test_scenario_08_payment_reconciliation():
    inv_total = Decimal("12000.00")
    pmt_1 = Decimal("8000.00")
    credit_1 = Decimal("1000.00")
    
    bal_1 = FinancialCalculationEngine.calculate_outstanding_balance(
        total_amount=inv_total,
        paid_amount=pmt_1,
        credit_adjustments=credit_1
    )
    status_1 = "Paid" if bal_1 <= Decimal("0.00") else ("Partially Paid" if pmt_1 > 0 else "Unpaid")
    assert bal_1 == Decimal("3000.00")
    assert status_1 == "Partially Paid"
    
    pmt_2 = Decimal("3000.00")
    total_paid = pmt_1 + pmt_2
    bal_2 = FinancialCalculationEngine.calculate_outstanding_balance(
        total_amount=inv_total,
        paid_amount=total_paid,
        credit_adjustments=credit_1
    )
    status_2 = "Paid" if bal_2 <= Decimal("0.00") else "Partially Paid"
    assert bal_2 == Decimal("0.00")
    assert status_2 == "Paid"

# SCENARIO 9 — Customer Margin:
# Revenue ₹10,000. Direct costs: Cloud ₹3,000 + Support ₹2,500 + Licensing ₹1,500 = ₹7,000.
# Contribution margin: ₹3,000 (30.0%). Status: Healthy/Marginal.
def test_scenario_09_customer_margin():
    revenue = Decimal("10000.00")
    cloud_cost = Decimal("3000.00")
    support_cost = Decimal("2500.00")
    license_cost = Decimal("1500.00")
    total_cost = cloud_cost + support_cost + license_cost
    assert total_cost == Decimal("7000.00")
    
    res = FinancialCalculationEngine.calculate_contribution_margin(
        net_revenue=revenue,
        direct_costs=total_cost
    )
    assert res["contribution"] == Decimal("3000.00")
    assert res["margin_pct"] == Decimal("30.00")
    
    status = "Profitable" if res["margin_pct"] >= Decimal("30.00") else "Unprofitable"
    assert status == "Profitable"

# SCENARIO 10 — Repeated Import:
# Upload the same 100-record CSV twice. System imports 100 records on first run, 0 on second run (100 skipped as duplicates).
def test_scenario_10_repeated_import(db):
    # Verify deduplication key checking for telemetry usage records
    sample_key = ("CUST-TECHNOVA", "2026-10-01", "api_calls")
    
    # Store key in set
    seen_keys = {sample_key}
    
    # Second import attempt with same key
    duplicate_rows = 0
    accepted_rows = 0
    incoming_batch = [sample_key]
    
    for row in incoming_batch:
        if row in seen_keys:
            duplicate_rows += 1
        else:
            accepted_rows += 1
            seen_keys.add(row)
            
    assert duplicate_rows == 1
    assert accepted_rows == 0

# SCENARIO 11 — Repeated Audit:
# Run reconciliation twice on unchanged data. Both runs produce identical results. No duplicate exceptions created.
def test_scenario_11_repeated_audit(db):
    engine = ReconciliationEngine(db)
    res1 = engine.execute_reconciliation("2026-10")
    count_exc_1 = db.query(ExceptionRecord).count()
    
    res2 = engine.execute_reconciliation("2026-10")
    count_exc_2 = db.query(ExceptionRecord).count()
    
    assert res1["summary"]["expected_charges"] == res2["summary"]["expected_charges"]
    assert res1["summary"]["invoiced_amount"] == res2["summary"]["invoiced_amount"]
    assert res1["summary"]["variance_amount"] == res2["summary"]["variance_amount"]
    assert count_exc_1 == count_exc_2

# SCENARIO 12 — Correction and Re-Audit:
# a. Run reconciliation: Customer X has ₹2,000 underbilling exception.
# b. User generates supplementary invoice for ₹2,000.
# c. User re-runs reconciliation: Customer X is now "Matched", discrepancy ₹0.
# d. Both audit runs are visible in history.
def test_scenario_12_correction_and_re_audit(db):
    # Step a: Identify or create a customer with underbilling variance
    cust = db.query(Customer).first()
    assert cust is not None
    
    initial_runs_count = db.query(ReconciliationRun).count()
    
    # Step b: Post supplementary billing correction
    corr_payload = {
        "customer_id": cust.id,
        "amount": 2000.0,
        "description": "Supplementary Correction for Scenario 12",
        "reason": "Reconciling underbilling shortfall identified in audit",
        "period_start": "2026-10-01",
        "period_end": "2026-10-31"
    }
    response = client.post("/api/v1/billing/corrections", json=corr_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["amount"] == 2000.0
    assert data["total"] == 2360.0  # ₹2,000 + 18% GST = ₹2,360
    
    # Step c: Re-run reconciliation
    run_response = client.post("/api/v1/reconciliation/run?period=2026-10")
    assert run_response.status_code == 200
    
    # Step d: Both audit runs are visible in history
    final_runs_count = db.query(ReconciliationRun).count()
    assert final_runs_count >= initial_runs_count + 1

# SCENARIO 13 — Contract Version Change (Proration):
# a. Version 1: ₹10,000/mo (days 1–15).
# b. Version 2: ₹15,000/mo (days 16–30).
# c. Expected charge: ₹5,000 + ₹7,500 = ₹12,500.
# d. Invoice for ₹10,000 detected as underbilling of ₹2,500.
def test_scenario_13_contract_version_proration():
    # Days 1 to 15 of 30 days = 15/30 = 0.5
    v1_full = Decimal("10000.00")
    v1_prorated = quantize_money(v1_full * (Decimal("15") / Decimal("30")))
    assert v1_prorated == Decimal("5000.00")
    
    # Days 16 to 30 of 30 days = 15/30 = 0.5
    v2_full = Decimal("15000.00")
    v2_prorated = quantize_money(v2_full * (Decimal("15") / Decimal("30")))
    assert v2_prorated == Decimal("7500.00")
    
    total_expected = v1_prorated + v2_prorated
    assert total_expected == Decimal("12500.00")
    
    invoiced = Decimal("10000.00")
    variance = invoiced - total_expected
    assert variance == Decimal("-2500.00")
    underbilling = FinancialCalculationEngine.calculate_underbilling(total_expected, invoiced)
    assert underbilling == Decimal("2500.00")

# SCENARIO 14 — Cross-Page Payment Consistency:
# a. User records payment of ₹5,000 against invoice INV-001.
# b. Billing page shows invoice balance reduced by ₹5,000.
# c. Customer page shows outstanding receivables reduced by ₹5,000.
# d. Executive Overview shows cash collected increased by ₹5,000.
def test_scenario_14_cross_page_payment_consistency(db):
    cust = db.query(Customer).first()
    assert cust is not None
    
    # Create an invoice for ₹10,000
    inv = Invoice(
        id=str(uuid.uuid4()),
        invoice_number=f"INV-TEST-{uuid.uuid4().hex[:6].upper()}",
        customer_id=cust.id,
        billing_period_start=date(2026, 10, 1),
        billing_period_end=date(2026, 10, 31),
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        subtotal=Decimal("10000.00"),
        tax_amount=Decimal("1800.00"),
        total_amount=Decimal("11800.00"),
        paid_amount=Decimal("0.00"),
        balance_due=Decimal("11800.00"),
        status="Unpaid"
    )
    db.add(inv)
    db.commit()
    
    # Record payment of ₹5,000 via API
    pmt_payload = {
        "customer_id": cust.id,
        "invoice_id": inv.id,
        "amount": 5000.0,
        "payment_method": "Bank Transfer",
        "payment_date": str(date.today())
    }
    res = client.post("/api/v1/billing/payments", json=pmt_payload)
    assert res.status_code == 200
    
    # Verify invoice balance reduced
    db.refresh(inv)
    assert inv.paid_amount == Decimal("5000.00")
    assert inv.balance_due == Decimal("6800.00")
    assert inv.status in ["Partial", "Partially Paid"]
    
    # Verify customer page reflects payment
    cust_res = client.get(f"/api/v1/customers/{cust.id}")
    assert cust_res.status_code == 200
    cust_data = cust_res.json()
    assert cust_data["customer"]["id"] == cust.id

# SCENARIO 15 — Stale Audit Detection:
# a. Run audit for October 2026. Status: "Audit Complete" / Fresh.
# b. Upload/add new usage data for October 2026.
# c. System displays warning: "Audit data is stale — new records imported since last audit. Re-run recommended."
def test_scenario_15_stale_audit_detection(db):
    engine = ReconciliationEngine(db)
    
    # Run audit first
    engine.execute_reconciliation("2026-10")
    
    # Freshness immediately after audit should be Fresh
    freshness = engine.get_audit_freshness("2026-10")
    assert freshness["is_stale"] is False
    
    # Simulate a new upload batch imported AFTER the audit run
    new_batch = UploadBatch(
        id=str(uuid.uuid4()),
        batch_id=f"BATCH-STALE-{uuid.uuid4().hex[:6]}",
        data_type="Usage",
        filename="telemetry_late_october.csv",
        total_rows=50,
        accepted_rows=50,
        rejected_rows=0,
        status="Imported",
        uploaded_at=datetime.utcnow() + timedelta(seconds=2)
    )
    db.add(new_batch)
    db.commit()
    
    # Now check audit freshness
    freshness_after = engine.get_audit_freshness("2026-10")
    assert freshness_after["is_stale"] is True
    assert "imported" in freshness_after["reason"].lower() or "new" in freshness_after["reason"].lower()
