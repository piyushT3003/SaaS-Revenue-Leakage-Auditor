import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_executive_overview_endpoint():
    response = client.get("/api/v1/overview")
    assert response.status_code == 200
    data = response.json()
    assert "mrr_kpi" in data
    assert "leakage_kpi" in data
    assert "outstanding_kpi" in data
    assert "active_customers_kpi" in data
    assert "contribution_margin_kpi" in data
    assert "revenue_health" in data
    assert "recent_exceptions" in data
    assert len(data["recent_exceptions"]) > 0

def test_reconciliation_endpoint():
    response = client.get("/api/v1/reconciliation?period=2026-10")
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "rows" in data
    assert data["summary"]["total_obligations"] > 0

def test_exceptions_list_and_detail():
    response = client.get("/api/v1/exceptions")
    assert response.status_code == 200
    data = response.json()
    assert "metrics" in data
    assert "items" in data
    assert len(data["items"]) > 0

    first_exc_id = data["items"][0]["id"]
    detail_res = client.get(f"/api/v1/exceptions/{first_exc_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert "calculation_explanation" in detail_data
    assert "notes" in detail_data

def test_customers_list():
    response = client.get("/api/v1/customers")
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "items" in data
    assert data["summary"]["total_customers"] == 218

def test_billing_metrics_and_invoices():
    metrics_res = client.get("/api/v1/billing/metrics")
    assert metrics_res.status_code == 200
    m_data = metrics_res.json()
    assert "invoiced_amount" in m_data

    invs_res = client.get("/api/v1/billing/invoices")
    assert invs_res.status_code == 200
    assert len(invs_res.json()["items"]) > 0

def test_unit_economics():
    response = client.get("/api/v1/unit-economics?period=2026-10")
    assert response.status_code == 200
    data = response.json()
    assert "arpc" in data
    assert "acpc" in data
    assert "overall_contribution_margin" in data
    assert "product_profitability" in data
    assert "segment_profitability" in data

def test_ai_query():
    response = client.post("/api/v1/ai/query", json={"question": "Why did revenue leakage increase this month?"})
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "supporting_metrics" in data
    assert len(data["source_references"]) > 0

def test_global_search():
    response = client.get("/api/v1/search?q=TechNova")
    assert response.status_code == 200
    data = response.json()
    assert data["total_results"] > 0
    assert data["results"][0]["title"] == "TechNova Pvt. Ltd."
