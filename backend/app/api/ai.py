from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.entities import User
from backend.app.schemas.api_schemas import AIQueryRequest, AIQueryResponse
from backend.app.ai.assistant import AIAssistantEngine
from backend.app.exports.exporter import ExportService
from backend.app.security.auth import get_current_user

router = APIRouter()

@router.post("/query", response_model=AIQueryResponse)
def ask_ai_investigation(
    payload: AIQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    engine = AIAssistantEngine(db, user_id=current_user.id)
    result = engine.execute_query(payload.question)
    return result

@router.get("/suggested")
def get_suggested_questions():
    return [
        {"question": "Why is revenue leakage up this month?", "category": "Leakage Analysis", "icon": "trending-up"},
        {"question": "Show top 5 underbilled customers", "category": "Underbilling", "icon": "users"},
        {"question": "Explain the discount drift for InfiniIT", "category": "Contract Audit", "icon": "file-text"},
        {"question": "Which customers have negative contribution margins?", "category": "Profitability", "icon": "pie-chart"},
        {"question": "Which customers have the highest outstanding balances?", "category": "Collections", "icon": "credit-card"},
        {"question": "Compare expected revenue with actual invoiced revenue", "category": "Reconciliation", "icon": "layers"}
    ]

@router.post("/export-report")
def export_ai_investigation_report(
    payload: AIQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    engine = AIAssistantEngine(db, user_id=current_user.id)
    result = engine.execute_query(payload.question)

    headers = ["Investigation Field", "Details"]
    rows = [
        ["User Question", payload.question],
        ["Audit Answer", result["answer"]],
        ["Reporting Period", result["reporting_period"]],
        ["Calculation Explanation", result["explanation"]],
        ["Data Sources Grounding", ", ".join(result["source_references"])],
        ["Integration Mode", result["status_note"] or "Grounded in Database"]
    ]

    for cust in result.get("affected_customers", []):
        rows.append(["Affected Account", f"{cust.get('name', '')} (Impact: ₹{float(cust.get('impact', 0)):,.2f})"])

    csv_file = ExportService.generate_csv(headers, rows)
    return Response(
        content=csv_file.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=AI_Investigation_Audit_Report.csv"}
    )
