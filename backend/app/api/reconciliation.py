from fastapi import APIRouter, Depends, Query, Response, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from backend.app.core.database import get_db
from backend.app.models.entities import User
from backend.app.reconciliation.reconciler import ReconciliationEngine
from backend.app.exports.exporter import ExportService
from backend.app.security.auth import require_role
from backend.app.services.job_tracker import job_tracker

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

@router.get("/readiness")
def get_audit_readiness(
    period: str = Query("2026-10"),
    customer_id: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    engine = ReconciliationEngine(db)
    return engine.check_data_readiness(
        period_str=period,
        customer_id=customer_id,
        product_id=product_id
    )

@router.get("/status")
def get_audit_status(
    period: str = Query("2026-10"),
    db: Session = Depends(get_db)
):
    engine = ReconciliationEngine(db)
    return engine.get_audit_freshness(period_str=period)

@router.get("/jobs")
def list_reconciliation_jobs(limit: int = Query(20, ge=1, le=100)):
    """Returns status and progress of recent background reconciliation and audit jobs."""
    return job_tracker.list_jobs(limit=limit)

@router.get("/jobs/{job_id}")
def get_reconciliation_job_status(job_id: str):
    """Fetches real-time execution state of a specific reconciliation job."""
    job = job_tracker.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.post("/run")
def trigger_reconciliation(
    period: str = Query("2026-10"),
    customer_id: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["Admin", "Analyst"]))
):
    engine = ReconciliationEngine(db)
    readiness = engine.check_data_readiness(period_str=period, customer_id=customer_id, product_id=product_id)
    if not readiness["is_ready"]:
        raise HTTPException(
            status_code=400,
            detail="Pre-audit readiness failed: " + "; ".join(readiness["blocking_reasons"])
        )

    job_id = job_tracker.create_job(
        job_type="ReconciliationAudit",
        metadata={
            "period": period,
            "customer_id": customer_id,
            "product_id": product_id,
            "initiated_by": current_user.email
        }
    )
    job_tracker.set_running(job_id)

    try:
        result = engine.execute_reconciliation(
            period_str=period,
            customer_id=customer_id,
            product_id=product_id,
            record_run=True
        )
        total_rows = len(result.get("rows", []))
        job_tracker.update_progress(job_id, records_processed=total_rows, total_records=total_rows)
        job_tracker.set_completed(job_id, result={"summary": result["summary"], "rows_count": total_rows})

        return {
            "status": "success",
            "message": f"Reconciliation audit executed for period {period}",
            "job_id": job_id,
            "summary": result["summary"],
            "run_id": result["summary"].get("latest_run_id")
        }
    except Exception as exc:
        job_tracker.set_failed(job_id, str(exc))
        raise HTTPException(status_code=500, detail=f"Reconciliation run failed: {str(exc)}")

@router.get("/export")
def export_reconciliation(
    period: str = Query("2026-10"),
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
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
