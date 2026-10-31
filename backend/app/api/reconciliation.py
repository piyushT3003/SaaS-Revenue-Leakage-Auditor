from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from typing import Optional
from backend.app.core.database import get_db
from backend.app.reconciliation.reconciler import ReconciliationEngine
from backend.app.exports.exporter import ExportService

router = APIRouter()

@router.get("")
def get_reconciliation_data(
    period: str = Query("2026-10"),
    customer_id: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    engine = ReconciliationEngine(db)
    result = engine.execute_reconciliation(
        period_str=period,
        customer_id=customer_id,
        product_id=product_id
    )

    if status and status != "All":
        result["rows"] = [r for r in result["rows"] if r["status"].lower() == status.lower()]

    return result

@router.post("/run")
def trigger_reconciliation(
    period: str = Query("2026-10"),
    customer_id: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    engine = ReconciliationEngine(db)
    result = engine.execute_reconciliation(
        period_str=period,
        customer_id=customer_id,
        product_id=product_id
    )
    return {"status": "success", "message": f"Reconciliation executed for period {period}", "summary": result["summary"]}

@router.get("/export")
def export_reconciliation(
    period: str = Query("2026-10"),
    format: str = Query("csv", regex="^(csv|xlsx)$"),
    db: Session = Depends(get_db)
):
    engine = ReconciliationEngine(db)
    result = engine.execute_reconciliation(period_str=period)

    headers = ["Reconciliation ID", "Customer", "Contract #", "Product", "Period", "Contract Amount (₹)", "Usage Value (₹)", "Invoiced Amount (₹)", "Variance (₹)", "Variance %", "Status"]
    rows = [
        [r["id"], r["customer_name"], r["contract_number"], r["product_name"], r["billing_period"], r["contract_amount"], r["usage_value"], r["invoiced_amount"], r["variance"], r["variance_pct"], r["status"]]
        for r in result["rows"]
    ]

    if format == "csv":
        csv_file = ExportService.generate_csv(headers, rows)
        return Response(
            content=csv_file.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=Reconciliation_{period}.csv"}
        )
    else:
        xlsx_file = ExportService.generate_xlsx("Reconciliation", headers, rows, title=f"Revenue Reconciliation {period}")
        return Response(
            content=xlsx_file.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=Reconciliation_{period}.xlsx"}
        )
