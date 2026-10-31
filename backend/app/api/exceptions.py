from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
import json
from backend.app.core.database import get_db
from backend.app.models.entities import (
    ExceptionRecord, ExceptionEvidence, InvestigationNote, User, AuditLog, NotificationEvent
)
from backend.app.schemas.api_schemas import (
    ExceptionDetail, ExceptionResolveRequest, ExceptionAssignRequest,
    ExceptionStatusRequest, ExceptionNoteCreate
)
from backend.app.exports.exporter import ExportService

router = APIRouter()

@router.get("")
def list_exceptions(
    search: Optional[str] = Query(None),
    issue_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    query = db.query(ExceptionRecord)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (ExceptionRecord.exception_code.ilike(search_filter)) |
            (ExceptionRecord.description.ilike(search_filter))
        )
    if issue_type and issue_type != "All":
        query = query.filter(ExceptionRecord.issue_type == issue_type)
    if severity and severity != "All":
        query = query.filter(ExceptionRecord.severity == severity)
    if status and status != "All":
        query = query.filter(ExceptionRecord.status == status)
    if customer_id:
        query = query.filter(ExceptionRecord.customer_id == customer_id)

    total_count = query.count()
    exceptions = (
        query.order_by(ExceptionRecord.financial_impact.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Calculate overall metrics
    all_excs = db.query(ExceptionRecord).all()
    total_exceptions = len(all_excs)
    open_count = sum(1 for e in all_excs if e.status == "Open")
    in_progress_count = sum(1 for e in all_excs if e.status == "In Progress")
    resolved_count = sum(1 for e in all_excs if e.status == "Resolved")
    financial_exposure = sum(float(e.financial_impact) for e in all_excs if e.status != "Resolved")

    return {
        "metrics": {
            "total_exceptions": total_exceptions,
            "open_exceptions": open_count,
            "in_progress": in_progress_count,
            "resolved": resolved_count,
            "financial_exposure": financial_exposure
        },
        "total": total_count,
        "page": page,
        "limit": limit,
        "items": [
            {
                "id": e.id,
                "exception_code": e.exception_code,
                "customer_id": e.customer_id,
                "customer_name": e.customer.name,
                "issue_type": e.issue_type,
                "severity": e.severity,
                "financial_impact": float(e.financial_impact),
                "status": e.status,
                "assigned_to_id": e.assigned_to_id,
                "assigned_to_name": e.assigned_to.full_name if e.assigned_to else "Unassigned",
                "description": e.description,
                "calculation_explanation": e.calculation_explanation,
                "detected_at": e.detected_at.isoformat()
            }
            for e in exceptions
        ]
    }

@router.get("/{id}", response_model=ExceptionDetail)
def get_exception_detail(id: str, db: Session = Depends(get_db)):
    exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")

    notes = [
        {
            "id": n.id,
            "user_name": n.user.full_name,
            "note_text": n.note_text,
            "created_at": n.created_at
        }
        for n in exc.notes
    ]

    evidence = [
        {
            "id": ev.id,
            "evidence_type": ev.evidence_type,
            "title": ev.title,
            "data": json.loads(ev.data_json) if ev.data_json else {},
            "created_at": ev.created_at
        }
        for ev in exc.evidence
    ]

    return {
        "id": exc.id,
        "exception_code": exc.exception_code,
        "customer_id": exc.customer_id,
        "customer_name": exc.customer.name,
        "issue_type": exc.issue_type,
        "severity": exc.severity,
        "financial_impact": float(exc.financial_impact),
        "status": exc.status,
        "assigned_to_id": exc.assigned_to_id,
        "assigned_to_name": exc.assigned_to.full_name if exc.assigned_to else "Unassigned",
        "description": exc.description,
        "calculation_explanation": exc.calculation_explanation,
        "source_records": json.loads(exc.source_records_json) if exc.source_records_json else {},
        "resolved_reason": exc.resolved_reason,
        "resolved_by_name": exc.assigned_to.full_name if exc.resolved_by_id else None,
        "resolved_at": exc.resolved_at,
        "detected_at": exc.detected_at,
        "notes": notes,
        "evidence": evidence
    }

@router.post("/{id}/assign")
def assign_exception(id: str, payload: ExceptionAssignRequest, db: Session = Depends(get_db)):
    exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")

    user = db.query(User).filter(User.id == payload.assigned_to_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Assignee user not found")

    exc.assigned_to_id = user.id
    if exc.status == "Open":
        exc.status = "In Progress"

    log = AuditLog(
        user_id=user.id,
        action="ASSIGN_EXCEPTION",
        entity_type="Exception",
        entity_id=exc.id,
        details=f"Assigned exception {exc.exception_code} to {user.full_name}",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {"status": "success", "message": f"Assigned to {user.full_name}", "exception_status": exc.status}

@router.post("/{id}/status")
def update_exception_status(id: str, payload: ExceptionStatusRequest, db: Session = Depends(get_db)):
    exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")

    if payload.status not in ["Open", "In Progress", "Resolved"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    old_status = exc.status
    exc.status = payload.status

    log = AuditLog(
        user_id=exc.assigned_to_id,
        action="CHANGE_STATUS",
        entity_type="Exception",
        entity_id=exc.id,
        details=f"Status changed from {old_status} to {payload.status}",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {"status": "success", "old_status": old_status, "new_status": exc.status}

@router.post("/{id}/notes")
def add_investigation_note(id: str, payload: ExceptionNoteCreate, db: Session = Depends(get_db)):
    exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")

    user = db.query(User).filter(User.role == "Admin").first()
    user_id = user.id if user else "SYSTEM"

    note = InvestigationNote(
        exception_id=exc.id,
        user_id=user_id,
        note_text=payload.note_text,
        created_at=datetime.utcnow()
    )
    db.add(note)

    log = AuditLog(
        user_id=user_id,
        action="ADD_NOTE",
        entity_type="Exception",
        entity_id=exc.id,
        details=f"Added investigation note to {exc.exception_code}",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {"status": "success", "note_id": note.id, "created_at": note.created_at.isoformat()}

@router.post("/{id}/resolve")
def resolve_exception(id: str, payload: ExceptionResolveRequest, db: Session = Depends(get_db)):
    exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")

    user = db.query(User).filter(User.role == "Admin").first()

    exc.status = "Resolved"
    exc.resolved_reason = payload.resolution_reason
    exc.resolved_at = datetime.utcnow()
    exc.resolved_by_id = user.id if user else None

    # Never delete the record; preserve audit history
    log = AuditLog(
        user_id=user.id if user else None,
        action="RESOLVE_EXCEPTION",
        entity_type="Exception",
        entity_id=exc.id,
        details=f"Resolved exception {exc.exception_code}: {payload.resolution_reason}",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {"status": "success", "message": f"Exception {exc.exception_code} resolved", "resolved_at": exc.resolved_at.isoformat()}

@router.get("/export")
def export_exceptions(format: str = Query("csv", regex="^(csv|xlsx)$"), db: Session = Depends(get_db)):
    excs = db.query(ExceptionRecord).order_by(ExceptionRecord.financial_impact.desc()).all()
    headers = ["Exception Code", "Customer", "Issue Type", "Severity", "Financial Impact (₹)", "Status", "Description", "Calculation Details"]
    rows = [
        [e.exception_code, e.customer.name, e.issue_type, e.severity, float(e.financial_impact), e.status, e.description, e.calculation_explanation]
        for e in excs
    ]

    if format == "csv":
        csv_file = ExportService.generate_csv(headers, rows)
        return Response(
            content=csv_file.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=Exception_Register.csv"}
        )
    else:
        xlsx_file = ExportService.generate_xlsx("Exceptions", headers, rows, title="Exception Register")
        return Response(
            content=xlsx_file.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Exception_Register.xlsx"}
        )
