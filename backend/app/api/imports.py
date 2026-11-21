"""Data Management: dataset catalogue, upload/validate, column mapping, confirm, rollback, history."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.api.common import J, Page, not_found, pagination
from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.ingestion.datasets import DATASETS
from backend.app.ingestion.pipeline import ImportError_, confirm, create_batch, remap, rollback
from backend.app.models import ImportBatch, ImportRow, User
from backend.app.security.auth import CurrentUser, require
from backend.app.services.tenancy import notify, record_audit

router = APIRouter()


def _err(exc: ImportError_) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content=J({"detail": str(exc), **exc.extra}))


def _batch(db: Session, user: CurrentUser, batch_id: int) -> ImportBatch:
    b = db.get(ImportBatch, batch_id)
    if b is None or b.tenant_id != user.tenant_id:
        raise not_found("Import batch")
    return b


def batch_dict(b: ImportBatch, db: Session | None = None) -> dict:
    names = {}
    if db is not None:
        ids = {i for i in (b.uploaded_by, b.confirmed_by) if i}
        names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}
    return J({
        "id": b.id, "batch_code": b.batch_code, "dataset_type": b.dataset_type,
        "dataset_label": DATASETS[b.dataset_type].label, "file_name": b.file_name, "file_sha256": b.file_sha256,
        "file_size_bytes": b.file_size_bytes, "data_origin": b.data_origin, "status": b.status,
        "source_columns": b.source_columns, "column_mapping": b.column_mapping, "total_rows": b.total_rows,
        "accepted_rows": b.accepted_rows, "rejected_rows": b.rejected_rows, "duplicate_rows": b.duplicate_rows,
        "inserted_rows": b.inserted_rows, "issues_summary": b.issues_summary, "created_at": b.created_at,
        "uploaded_by": names.get(b.uploaded_by), "confirmed_by": names.get(b.confirmed_by), "confirmed_at": b.confirmed_at,
        "rolled_back_at": b.rolled_back_at, "rollback_reason": b.rollback_reason,
    })


@router.get("/datasets")
def datasets(user: CurrentUser = Depends(require("read"))):
    return [{"key": s.key, "label": s.label, "category": s.category, "description": s.description, "order": s.order,
             "natural_key": list(s.natural_key),
             "fields": [{"name": f.name, "type": f.type, "required": f.required, "choices": list(f.choices),
                         "references": f.ref.model.__tablename__ if f.ref else None, "synonyms": list(f.synonyms)}
                        for f in s.fields]}
            for s in sorted(DATASETS.values(), key=lambda s: s.order)]


@router.post("/upload", status_code=201)
async def upload(file: UploadFile = File(...), dataset_type: str | None = Form(None),
                 user: CurrentUser = Depends(require("import:write")), db: Session = Depends(get_db)):
    content = await file.read(settings.MAX_UPLOAD_SIZE_BYTES + 1)
    try:
        batch, candidates = create_batch(db, user.tenant_id, user.id, file.filename or "upload.csv", content, dataset_type or None)
    except ImportError_ as exc:
        db.rollback()
        return _err(exc)
    record_audit(db, user.tenant_id, user.id, "IMPORT_VALIDATED", "import_batch", batch.id, dataset=batch.dataset_type,
                 file=batch.file_name, accepted=batch.accepted_rows, rejected=batch.rejected_rows, duplicates=batch.duplicate_rows)
    db.commit()
    return {**batch_dict(batch, db), "dataset_candidates": candidates}


@router.get("/batches")
def list_batches(dataset_type: str | None = None, status: str | None = None, page: Page = Depends(pagination),
                 user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    q = select(ImportBatch).where(ImportBatch.tenant_id == user.tenant_id)
    if dataset_type:
        q = q.where(ImportBatch.dataset_type == dataset_type)
    if status:
        q = q.where(ImportBatch.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.scalars(q.order_by(ImportBatch.id.desc()).offset(page.offset).limit(page.page_size)).all()
    return page.wrap([batch_dict(b, db) for b in items], total)


@router.get("/batches/{batch_id}")
def get_batch(batch_id: int, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    return batch_dict(_batch(db, user, batch_id), db)


@router.get("/batches/{batch_id}/rows")
def batch_rows(batch_id: int, status: str | None = None, page: Page = Depends(pagination),
               user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    _batch(db, user, batch_id)
    q = select(ImportRow).where(ImportRow.batch_id == batch_id)
    if status:
        q = q.where(ImportRow.status == status.upper())
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(ImportRow.row_number).offset(page.offset).limit(page.page_size)).all()
    return page.wrap([J({"row_number": r.row_number, "status": r.status, "raw": r.raw_values, "normalized": r.normalized_values,
                         "errors": r.errors, "entity_table": r.entity_table, "entity_id": r.entity_id}) for r in rows], total)


class MappingBody(BaseModel):
    column_mapping: dict[str, str] = Field(description="source column → dataset field ('' to ignore)")


@router.put("/batches/{batch_id}/mapping")
def update_mapping(batch_id: int, body: MappingBody, user: CurrentUser = Depends(require("import:write")),
                   db: Session = Depends(get_db)):
    batch = _batch(db, user, batch_id)
    valid = {f.name for f in DATASETS[batch.dataset_type].fields}
    bad = [t for t in body.column_mapping.values() if t and t not in valid]
    if bad:
        raise HTTPException(422, f"Unknown target fields: {bad}")
    try:
        remap(db, batch, {k: v for k, v in body.column_mapping.items() if v})
    except ImportError_ as exc:
        db.rollback()
        return _err(exc)
    db.commit()
    return batch_dict(batch, db)


@router.post("/batches/{batch_id}/confirm")
def confirm_batch(batch_id: int, user: CurrentUser = Depends(require("import:write")), db: Session = Depends(get_db)):
    batch = _batch(db, user, batch_id)
    try:
        inserted = confirm(db, batch, user.id)
    except ImportError_ as exc:
        if batch.status == "FAILED":
            db.commit()  # keep the FAILED status + reason; no data rows were inserted
        else:
            db.rollback()
        return _err(exc)
    record_audit(db, user.tenant_id, user.id, "IMPORT_CONFIRMED", "import_batch", batch.id, dataset=batch.dataset_type, inserted=inserted)
    notify(db, user.tenant_id, "IMPORT", f"{DATASETS[batch.dataset_type].label}: {inserted} records imported",
           f"Batch {batch.batch_code} from {batch.file_name}", link=f"/data-management?batch={batch.id}")
    db.commit()
    return {**batch_dict(batch, db), "inserted": inserted}


class RollbackBody(BaseModel):
    reason: str = Field(min_length=5, max_length=255)


@router.post("/batches/{batch_id}/rollback")
def rollback_batch(batch_id: int, body: RollbackBody, user: CurrentUser = Depends(require("import:rollback")),
                   db: Session = Depends(get_db)):
    batch = _batch(db, user, batch_id)
    try:
        removed = rollback(db, batch, body.reason)
    except ImportError_ as exc:
        db.rollback()
        return _err(exc)
    record_audit(db, user.tenant_id, user.id, "IMPORT_ROLLED_BACK", "import_batch", batch.id, removed=removed, reason=body.reason)
    db.commit()
    return {**batch_dict(batch, db), "removed": removed}


@router.get("/sources")
def sources(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    """Every dataset the engine uses, with record counts, freshness and the latest import batch."""
    out = []
    for spec in sorted(DATASETS.values(), key=lambda s: s.order):
        m = spec.model
        count, latest = db.execute(select(func.count(m.id), func.max(m.updated_at)).where(m.tenant_id == user.tenant_id)).one()
        last = db.scalar(select(ImportBatch).where(ImportBatch.tenant_id == user.tenant_id, ImportBatch.dataset_type == spec.key)
                         .order_by(ImportBatch.id.desc()))
        rejected = db.scalar(select(func.coalesce(func.sum(ImportBatch.rejected_rows + ImportBatch.duplicate_rows), 0)).where(
            ImportBatch.tenant_id == user.tenant_id, ImportBatch.dataset_type == spec.key)) or 0
        total = db.scalar(select(func.coalesce(func.sum(ImportBatch.total_rows), 0)).where(
            ImportBatch.tenant_id == user.tenant_id, ImportBatch.dataset_type == spec.key)) or 0
        out.append(J({"dataset": spec.key, "label": spec.label, "category": spec.category, "records": count, "last_updated": latest,
                      "last_batch": None if last is None else {"id": last.id, "code": last.batch_code, "status": last.status,
                                                               "origin": last.data_origin, "at": last.created_at},
                      "rows_uploaded": total, "rows_rejected_or_duplicate": rejected,
                      "status": "SYNCED" if count and (last is None or last.status in ("IMPORTED", "ROLLED_BACK")) else
                      ("VALIDATED" if last is not None and last.status == "VALIDATED" else ("EMPTY" if not count else last.status))}))
    return out


@router.get("/templates/{dataset}.csv")
def template(dataset: str, user: CurrentUser = Depends(require("read"))):
    from fastapi.responses import Response

    if dataset not in DATASETS:
        raise not_found("Dataset")
    spec = DATASETS[dataset]
    header = ",".join(f.name for f in spec.fields)
    return Response(header + "\n", media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{dataset}_template.csv"'})
