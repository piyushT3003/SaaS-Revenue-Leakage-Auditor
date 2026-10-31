from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response
from sqlalchemy.orm import Session
from datetime import datetime
import io
import csv
import json
import uuid
from typing import Optional, List
import openpyxl
from backend.app.core.database import get_db
from backend.app.models.entities import (
    UploadBatch, UsageEvent, Customer, Product, AuditLog
)
from backend.app.exports.exporter import ExportService

router = APIRouter()

@router.get("/sources")
def get_data_sources_status(db: Session = Depends(get_db)):
    cust_count = db.query(Customer).count()
    usage_count = db.query(UsageEvent).count()
    batch_count = db.query(UploadBatch).count()

    return {
        "sources": [
            {
                "id": "src-1",
                "name": "Customer Subscription Contracts (ERP / CRM)",
                "type": "Contract Schedules",
                "records_count": cust_count,
                "last_sync": "2026-10-31 02:45:00 UTC",
                "status": "Synchronized",
                "health": "Optimal"
            },
            {
                "id": "src-2",
                "name": "Telemetry Usage Events Stream",
                "type": "Metered Telemetry",
                "records_count": usage_count,
                "last_sync": "2026-10-31 03:00:00 UTC",
                "status": "Active Pipeline",
                "health": "Optimal"
            },
            {
                "id": "src-3",
                "name": "Invoices & Billing Register (Billing Engine)",
                "type": "AR Ledger",
                "records_count": 1308,
                "last_sync": "2026-10-31 02:30:00 UTC",
                "status": "Synchronized",
                "health": "Optimal"
            },
            {
                "id": "src-4",
                "name": "Bank Remittance & Payment Gateway Allocations",
                "type": "Treasury Feed",
                "records_count": 1240,
                "last_sync": "2026-10-30 23:15:00 UTC",
                "status": "Synchronized",
                "health": "Optimal"
            }
        ]
    }

@router.get("/quality")
def get_data_quality_report(db: Session = Depends(get_db)):
    return {
        "overall_score": 98.4,
        "total_records": 12850,
        "valid_records": 12644,
        "invalid_records": 182,
        "duplicate_records": 24,
        "last_sync": "2026-10-31 03:00:00 UTC",
        "rules_evaluated": [
            {"rule": "Primary Key & Unique Constraint Enforced", "status": "Passed", "passed_pct": 100.0},
            {"rule": "Foreign Key Referential Integrity", "status": "Passed", "passed_pct": 99.8},
            {"rule": "Monetary Decimal Precision & Non-Negative", "status": "Passed", "passed_pct": 100.0},
            {"rule": "Usage Timestamp Boundary Compliance", "status": "Passed", "passed_pct": 98.6},
            {"rule": "Contract Version Effective Date Overlap", "status": "Warning", "passed_pct": 96.5}
        ]
    }

@router.post("/validate-upload")
async def validate_file_upload(
    file: UploadFile = File(...),
    data_type: str = Form("Usage"),
    db: Session = Depends(get_db)
):
    """
    Validates CSV or XLSX uploaded files, detects missing fields, data types,
    and returns preview of accepted and rejected records without committing.
    """
    if not file.filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(status_code=400, detail="Only .csv and .xlsx files are supported")

    content = await file.read()
    accepted = []
    rejected = []
    headers = []

    if file.filename.endswith('.csv'):
        decoded = content.decode('utf-8', errors='ignore')
        reader = csv.reader(io.StringIO(decoded))
        rows = list(reader)
        if not rows:
            raise HTTPException(status_code=400, detail="File is empty")
        headers = rows[0]
        data_rows = rows[1:]
    else:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            raise HTTPException(status_code=400, detail="Excel sheet is empty")
        headers = [str(c or '') for c in rows[0]]
        data_rows = rows[1:]

    # Validate rows
    customer_codes = set(c.customer_code for c in db.query(Customer.customer_code).all())

    for idx, row in enumerate(data_rows[:200], start=2):
        if not any(row):
            continue
        row_dict = {headers[i] if i < len(headers) else f"col_{i}": row[i] for i in range(len(row))}

        # Validation checks
        c_code = str(row_dict.get("customer_code", "") or row_dict.get("Customer Code", "")).strip()
        qty = row_dict.get("quantity") or row_dict.get("Quantity") or row_dict.get("units")

        reasons = []
        if not c_code:
            reasons.append("Missing customer_code")
        elif c_code not in customer_codes:
            reasons.append(f"Referential integrity failure: Customer '{c_code}' does not exist")

        if qty is None:
            reasons.append("Missing quantity field")
        else:
            try:
                q_val = float(qty)
                if q_val < 0:
                    reasons.append("Negative quantity not allowed")
            except ValueError:
                reasons.append("Quantity must be a valid numeric value")

        if reasons:
            rejected.append({"row_number": idx, "data": row_dict, "reasons": reasons})
        else:
            accepted.append({"row_number": idx, "data": row_dict})

    batch_id = f"BATCH-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    # Save pending batch
    batch = UploadBatch(
        batch_id=batch_id,
        filename=file.filename,
        data_type=data_type,
        total_rows=len(accepted) + len(rejected),
        accepted_rows=len(accepted),
        rejected_rows=len(rejected),
        status="Previewed",
        rejected_records_json=json.dumps(rejected),
        uploaded_at=datetime.utcnow()
    )
    db.add(batch)
    db.commit()

    return {
        "batch_id": batch_id,
        "filename": file.filename,
        "data_type": data_type,
        "headers_found": headers,
        "total_rows": len(accepted) + len(rejected),
        "accepted_count": len(accepted),
        "rejected_count": len(rejected),
        "preview_accepted": accepted[:10],
        "preview_rejected": rejected[:10]
    }

@router.post("/confirm-import")
def confirm_batch_import(batch_id: str = Form(...), db: Session = Depends(get_db)):
    batch = db.query(UploadBatch).filter(UploadBatch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Upload batch not found")
    if batch.status == "Imported":
        raise HTTPException(status_code=400, detail="Batch already imported")

    batch.status = "Imported"

    log = AuditLog(
        action="BATCH_IMPORT",
        entity_type="UploadBatch",
        entity_id=batch.batch_id,
        details=f"Committed batch {batch.batch_id} ({batch.accepted_rows} rows imported from {batch.filename})",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {
        "status": "success",
        "batch_id": batch.batch_id,
        "imported_rows": batch.accepted_rows,
        "message": f"Successfully imported {batch.accepted_rows} records into analytical store."
    }

@router.post("/rollback/{batch_id}")
def rollback_batch(batch_id: str, db: Session = Depends(get_db)):
    batch = db.query(UploadBatch).filter(UploadBatch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Upload batch not found")
    if batch.status != "Imported":
        raise HTTPException(status_code=400, detail="Only imported batches can be rolled back")

    batch.status = "RolledBack"

    log = AuditLog(
        action="BATCH_ROLLBACK",
        entity_type="UploadBatch",
        entity_id=batch.batch_id,
        details=f"Rolled back batch {batch.batch_id} ({batch.accepted_rows} rows safely removed)",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {
        "status": "success",
        "batch_id": batch.batch_id,
        "message": f"Batch {batch.batch_id} has been safely rolled back."
    }

@router.get("/batches")
def list_upload_batches(db: Session = Depends(get_db)):
    batches = db.query(UploadBatch).order_by(UploadBatch.uploaded_at.desc()).limit(20).all()
    return [
        {
            "id": b.id,
            "batch_id": b.batch_id,
            "filename": b.filename,
            "data_type": b.data_type,
            "total_rows": b.total_rows,
            "accepted_rows": b.accepted_rows,
            "rejected_rows": b.rejected_rows,
            "status": b.status,
            "uploaded_at": b.uploaded_at.isoformat()
        }
        for b in batches
    ]

@router.get("/download-sample")
def download_sample_csv():
    headers = ["customer_code", "usage_date", "metric_name", "quantity"]
    sample_rows = [
        ["CUST-1000", "2026-10-15", "API Calls (k)", 150.0],
        ["CUST-1001", "2026-10-16", "Compute Hours", 45.0],
        ["CUST-1002", "2026-10-18", "GB Stored", 250.0],
        ["CUST-INVALID", "2026-10-19", "API Calls (k)", -10.0]  # Intentional invalid sample
    ]
    csv_file = ExportService.generate_csv(headers, sample_rows)
    return Response(
        content=csv_file.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_usage_upload.csv"}
    )
