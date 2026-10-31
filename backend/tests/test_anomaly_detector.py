import pytest
from datetime import date
from backend.app.core.database import SessionLocal
from backend.app.anomaly_detection.detector import AnomalyDetectionEngine
from backend.app.reconciliation.reconciler import ReconciliationEngine
from backend.app.models.entities import ExceptionRecord

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    yield db
    db.close()

def test_anomaly_detection_pipeline_and_ground_truth(db_session):
    detector = AnomalyDetectionEngine(db_session)
    eval_metrics = detector.evaluate_against_ground_truth()
    
    assert eval_metrics["true_positives"] == 14
    assert eval_metrics["precision_pct"] == 100.0
    assert eval_metrics["recall_pct"] == 100.0
    assert eval_metrics["f1_score"] == 100.0

def test_anomaly_categories_present(db_session):
    exceptions = db_session.query(ExceptionRecord).all()
    categories = set(e.issue_type for e in exceptions)
    
    # Verify all 8 categories
    expected_categories = {
        "Underbilling",
        "Overbilling",
        "Missing Charges",
        "Duplicate Invoices",
        "Discount Drift",
        "Pricing Mismatch",
        "Payment Discrepancies"
    }
    for cat in expected_categories:
        assert cat in categories, f"Missing category: {cat}"

def test_featured_exceptions_integrity(db_session):
    # Verify TechNova underbilling
    technova_exc = (
        db_session.query(ExceptionRecord)
        .filter(ExceptionRecord.description.contains("Billed ₹2,40,000 vs expected ₹3,00,000"))
        .first()
    )
    assert technova_exc is not None
    assert technova_exc.financial_impact == 60000.0
    assert technova_exc.status == "Open"
    assert technova_exc.severity == "High"

    # Verify CloudCore pricing mismatch
    cloudcore_exc = (
        db_session.query(ExceptionRecord)
        .filter(ExceptionRecord.description.contains("Invoiced at ₹800/unit vs contract ₹600/unit"))
        .first()
    )
    assert cloudcore_exc is not None
    assert cloudcore_exc.financial_impact == 120000.0
    assert cloudcore_exc.status == "In Progress"
    assert cloudcore_exc.severity == "Critical"

def test_reconciliation_execution(db_session):
    recon = ReconciliationEngine(db_session)
    result = recon.execute_reconciliation("2026-10")
    
    assert "summary" in result
    assert "rows" in result
    assert result["summary"]["total_obligations"] > 0
    assert result["summary"]["reconciliation_rate"] > 0
    assert len(result["rows"]) > 0
