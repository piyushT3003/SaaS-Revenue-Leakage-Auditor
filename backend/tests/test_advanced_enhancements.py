import os
import json
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models.entities import (
    User, Customer, ExceptionRecord, HistoricalReplayRun, WhatIfScenario,
    BillingRuleProposal, RootCauseCluster, AuditEvidencePackRecord
)
from backend.app.security.auth import create_access_token, get_password_hash
from backend.app.services.evidence_graph_service import RevenueEvidenceGraphService
from backend.app.services.historical_replay_service import HistoricalBillingReplayService
from backend.app.services.what_if_simulator_service import WhatIfSimulatorService
from backend.app.services.leakage_prioritization_service import LeakagePrioritizationService
from backend.app.services.usage_integrity_service import UsageIntegrityService
from backend.app.services.billing_rules_lab_service import BillingRulesLabService
from backend.app.services.root_cause_service import RootCauseAnalysisService
from backend.app.services.evidence_pack_service import AuditEvidencePackService

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()

@pytest.fixture
def auth_headers(db):
    admin = db.query(User).filter(User.role == "Admin").first()
    if not admin:
        admin = User(
            email="admin_adv_test@saas-assurance.io",
            full_name="Admin Test",
            hashed_password=get_password_hash("testpass"),
            role="Admin",
            is_active=True
        )
        db.add(admin)
        db.commit()
    token = create_access_token(data={"sub": admin.id, "email": admin.email, "role": admin.role})
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": "default_tenant"}


def test_1_revenue_evidence_graph(db, auth_headers):
    # Test service directly
    service = RevenueEvidenceGraphService(db)
    graph = service.build_graph()
    assert "nodes" in graph
    assert "edges" in graph
    assert len(graph["nodes"]) > 0
    assert len(graph["edges"]) > 0

    # Test API endpoint
    res = client.get("/api/v1/evidence-graph", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "nodes" in data
    assert "edges" in data
    assert any(n.get("type") == "Customer" for n in data["nodes"])


def test_2_historical_billing_replay(db, auth_headers):
    # Test execution
    res = client.post(
        "/api/v1/historical-replay/run",
        json={"period": "2026-08", "customer_id": None},
        headers=auth_headers
    )
    assert res.status_code == 200
    run_data = res.json()
    run_id_a = run_data["run_id"]
    assert "replay_code" in run_data
    assert run_data["records_reconstructed"] >= 0

    # Run second replay
    res2 = client.post(
        "/api/v1/historical-replay/run",
        json={"period": "2026-08", "customer_id": None},
        headers=auth_headers
    )
    assert res2.status_code == 200
    run_id_b = res2.json()["run_id"]

    # Test compare runs
    compare_res = client.get(
        f"/api/v1/historical-replay/compare?run_id_a={run_id_a}&run_id_b={run_id_b}",
        headers=auth_headers
    )
    assert compare_res.status_code == 200
    comp = compare_res.json()
    assert "deltas" in comp
    assert "variance_delta" in comp["deltas"]
    assert "difference_explanation" in comp


def test_3_what_if_simulator(db, auth_headers):
    payload = {
        "name": "Q4 Rate Optimization Test",
        "description": "Simulate +15% overage rate and 5% base fee increase",
        "baseline_period": "2026-10",
        "target_type": "All",
        "overage_rate_multiplier": 1.15,
        "base_fee_multiplier": 1.05,
        "save": True
    }
    res = client.post("/api/v1/what-if/simulate", json=payload, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "results" in data
    results = data["results"]
    assert results["simulated_total_revenue"] >= results["baseline_total_revenue"]
    assert "tier_breakdown" in results
    assert len(results["tier_breakdown"]) > 0

    # List scenarios
    list_res = client.get("/api/v1/what-if/scenarios", headers=auth_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1


def test_4_leakage_prioritization(db, auth_headers):
    # Run scoring
    res = client.get("/api/v1/prioritization/scores", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "scored_exceptions" in data
    assert "priority_distribution" in data
    scored = data["scored_exceptions"]
    if scored:
        first_exc = scored[0]
        assert "composite_score" in first_exc
        assert "assigned_priority" in first_exc
        assert "factors" in first_exc
        assert 0.0 <= first_exc["composite_score"] <= 100.0

        # Test priority override
        exc_obj = db.query(ExceptionRecord).filter(ExceptionRecord.id == first_exc["exception_id"]).first()
        orig_record_severity = exc_obj.severity if exc_obj else "High"

        override_res = client.post(
            "/api/v1/prioritization/override",
            json={
                "exception_id": first_exc["exception_id"],
                "priority": "Critical",
                "reason": "Executive Escalation: High strategic churn risk"
            },
            headers=auth_headers
        )
        assert override_res.status_code == 200
        assert override_res.json()["manual_override"] is True

        # Restore original priority and severity to maintain deterministic test isolation
        client.post(
            "/api/v1/prioritization/override",
            json={
                "exception_id": first_exc["exception_id"],
                "priority": orig_record_severity,
                "reason": "Restored baseline test fixture state"
            },
            headers=auth_headers
        )


def test_5_usage_meter_integrity(db, auth_headers):
    # Trigger scan
    res = client.post(
        "/api/v1/usage-integrity/scan",
        json={"period": "2026-10", "source_name": "Kafka Primary Stream"},
        headers=auth_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert "integrity_score" in data
    assert "status" in data
    assert 0.0 <= data["integrity_score"] <= 100.0

    # List reports
    list_res = client.get("/api/v1/usage-integrity/reports", headers=auth_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1


def test_6_billing_rules_regression_lab(db, auth_headers):
    rule_payload = {
        "title": "API Calls Tier 2 Allowance Expansion",
        "description": "Increase Tier 1 threshold from 50k to 60k and reduce overage rate to $0.045",
        "test_period": "2026-10",
        "proposed_rule": {
            "tier_threshold_units": 60000,
            "overage_rate": 0.045,
            "base_fee_discount_pct": 5.0
        }
    }
    res = client.post("/api/v1/billing-lab/test", json=rule_payload, headers=auth_headers)
    assert res.status_code == 200
    proposal = res.json()
    proposal_id = proposal["id"]
    assert proposal["test_customers_count"] >= 0
    assert "tests_passed" in proposal
    assert proposal["status"] == "Tested"

    # Review approval
    review_res = client.post(
        f"/api/v1/billing-lab/proposals/{proposal_id}/review",
        json={"new_status": "Approved", "notes": "Regression simulation verified."},
        headers=auth_headers
    )
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "Approved"


def test_7_root_cause_clusters(db, auth_headers):
    res = client.get("/api/v1/root-cause/clusters", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "clusters" in data
    clusters = data["clusters"]
    assert len(clusters) > 0

    first_cluster = clusters[0]
    assert "cluster_code" in first_cluster
    assert "affected_customer_count" in first_cluster
    assert "aggregate_exposure" in first_cluster

    # Confirm cluster
    confirm_res = client.post(
        f"/api/v1/root-cause/clusters/{first_cluster['id']}/confirm",
        json={
            "status": "Confirmed",
            "confirmed_cause": "Systemic misalignment in legacy addendum billing rules.",
            "investigation_notes": "All impacted invoices slated for credit rebill."
        },
        headers=auth_headers
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "Confirmed"


def test_8_audit_evidence_pack(db, auth_headers):
    # Generate pack
    res = client.post(
        "/api/v1/evidence-pack/generate",
        json={"pack_type": "PeriodAudit", "period": "2026-10"},
        headers=auth_headers
    )
    assert res.status_code == 200
    pack = res.json()
    pack_id = pack["id"]
    assert "manifest_checksum" in pack
    assert len(pack["manifest_checksum"]) == 64  # SHA-256
    assert len(pack["sections"]) > 0

    # Download PDF
    pdf_res = client.get(f"/api/v1/evidence-pack/{pack_id}/pdf", headers=auth_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert len(pdf_res.content) > 1000  # valid pdf bytes

    # Download Excel XLSX
    xlsx_res = client.get(f"/api/v1/evidence-pack/{pack_id}/xlsx", headers=auth_headers)
    assert xlsx_res.status_code == 200
    assert "openxmlformats" in xlsx_res.headers["content-type"]
    assert len(xlsx_res.content) > 1000  # valid xlsx bytes
