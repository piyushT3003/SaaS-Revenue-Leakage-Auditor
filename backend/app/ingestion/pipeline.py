"""STAGES 1–3: upload → identify dataset → map columns → validate → confirm → store (with lineage).

Rules:
* Structure is validated (types, required values, allowed values, references, duplicates).
  Business correctness of invoices is *not* "fixed" on import — wrong prices are exactly what
  the audit must detect, so they are imported as received.
* Nothing is written to operational tables until a user explicitly confirms the batch.
* Re-uploading an identical file, or rows whose natural key already exists, never creates
  duplicate records.
* Every inserted record keeps ``source_batch_id`` + ``source_row_number``; raw rows stay in
  ``import_rows``.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from decimal import Decimal
from pathlib import PurePath
from zoneinfo import ZoneInfo

from sqlalchemy import Date, DateTime, Numeric, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.money import D
from backend.app.ingestion.datasets import DATASETS, DatasetSpec, FieldSpec
from backend.app.models import (
    Contract,
    ContractVersion,
    ImportBatch,
    ImportRow,
    Invoice,
    InvoiceLine,
    Subscription,
    Tenant,
)

MAX_ROWS = 250_000


class ImportError_(ValueError):
    def __init__(self, message: str, status: int = 422, **extra):
        super().__init__(message)
        self.status = status
        self.extra = extra


# ----------------------------------------------------------------------------- parsing
def normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(h or "").strip().lower()).strip("_")


def parse_file(filename: str, content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    ext = PurePath(filename).suffix.lower()
    if ext not in settings.allowed_extensions:
        raise ImportError_(f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(settings.allowed_extensions))}", 415)
    if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise ImportError_(f"File exceeds the {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB upload limit", 413)
    if not content:
        raise ImportError_("The file is empty")
    if ext == ".csv":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ImportError_("CSV must be UTF-8 encoded") from exc
        reader = csv.DictReader(io.StringIO(text))
        columns = [c for c in (reader.fieldnames or []) if c is not None]
        rows = []
        for i, r in enumerate(reader):
            if i >= MAX_ROWS:
                raise ImportError_(f"File has more than {MAX_ROWS} rows; split it into smaller files")
            rows.append({k: (v if v is not None else "") for k, v in r.items() if k is not None})
    else:
        from openpyxl import load_workbook

        if not content.startswith(b"PK"):
            raise ImportError_("File is not a valid .xlsx workbook")
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        it = ws.iter_rows(values_only=True)
        header = next(it, None) or ()
        columns = [str(h).strip() for h in header if h is not None]
        rows = []
        for i, values in enumerate(it):
            if i >= MAX_ROWS:
                raise ImportError_(f"Sheet has more than {MAX_ROWS} rows; split it into smaller files")
            if values is None or all(v is None or str(v).strip() == "" for v in values):
                continue
            rows.append({columns[j]: ("" if v is None else (v.isoformat() if isinstance(v, (date, datetime)) else str(v)))
                         for j, v in enumerate(values[: len(columns)])})
        wb.close()
    if not columns:
        raise ImportError_("No header row found")
    rows = [r for r in rows if any(str(v).strip() for v in r.values())]
    return columns, rows


def suggest_mapping(spec: DatasetSpec, columns: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    used: set[str] = set()
    for col in columns:
        n = normalize_header(col)
        for f in spec.fields:
            if f.name in used:
                continue
            if n == f.name or n in f.synonyms:
                mapping[col] = f.name
                used.add(f.name)
                break
    return mapping


def identify_dataset(columns: list[str]) -> list[dict]:
    scores = []
    normalized = {normalize_header(c) for c in columns}
    for spec in DATASETS.values():
        mapping = suggest_mapping(spec, columns)
        mapped = set(mapping.values())
        missing = [r for r in spec.required if r not in mapped]
        exact = sum(1 for f in spec.fields if f.name in normalized)
        score = len(mapped) * 2 + exact - len(missing) * 5
        scores.append({"dataset": spec.key, "label": spec.label, "score": score, "missing_required": missing})
    return sorted(scores, key=lambda s: -s["score"])


# ----------------------------------------------------------------------------- coercion
_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%b %d %Y", "%Y-%m")


def coerce(f: FieldSpec, raw: str, tz: ZoneInfo):
    s = str(raw).strip()
    if s == "":
        return None
    if f.max_length and len(s) > f.max_length:
        raise ValueError(f"longer than {f.max_length} characters")
    if f.type == "str":
        return s
    if f.type == "enum":
        v = s.upper().replace(" ", "_").replace("-", "_")
        if v not in f.choices:
            raise ValueError(f"'{s}' is not one of {', '.join(f.choices)}")
        return v
    if f.type == "int":
        d = D(s)
        if d != d.to_integral_value():
            raise ValueError(f"'{s}' is not a whole number")
        return int(d)
    if f.type == "decimal":
        try:
            return D(s)
        except ValueError as exc:
            raise ValueError(f"'{s}' is not a valid number") from exc
    if f.type == "date":
        if "T" in s:
            s = s.split("T")[0]
        if " " in s and re.match(r"^\d{4}-\d{2}-\d{2} ", s):
            s = s.split(" ")[0]
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
        raise ValueError(f"'{s}' is not a recognised date (use YYYY-MM-DD)")
    if f.type == "datetime":
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            try:
                return datetime.combine(coerce(FieldSpec(f.name, "date"), s, tz), time.min, tz)
            except ValueError as exc:
                raise ValueError(f"'{s}' is not a valid timestamp (ISO-8601)") from exc
        return dt if dt.tzinfo else dt.replace(tzinfo=tz)
    if f.type == "json":
        try:
            v = json.loads(s)
        except json.JSONDecodeError as exc:
            raise ValueError("must be valid JSON") from exc
        if not isinstance(v, list) or not all(isinstance(t, dict) and "unit_price" in t for t in v):
            raise ValueError('tiers must be a JSON list like [{"up_to": 1000, "unit_price": 1.5}, {"up_to": null, "unit_price": 1}]')
        return [{"up_to": None if t.get("up_to") in (None, "") else str(D(t["up_to"])), "unit_price": str(D(t["unit_price"]))} for t in v]
    raise ValueError(f"unsupported type {f.type}")


def _jsonable(v):
    if isinstance(v, Decimal):
        return format(v, "f")
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


# ----------------------------------------------------------------------------- validation
@dataclass
class RowResult:
    row_number: int
    raw: dict
    values: dict = field(default_factory=dict)  # coerced values by field name
    resolved: dict = field(default_factory=dict)  # model attribute → value (ids resolved)
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    status: str = "ACCEPTED"
    natural_key: str = ""


def _resolve_refs(db: Session, tenant_id: int, spec: DatasetSpec, results: list[RowResult]) -> None:
    for f in spec.fields:
        if f.ref is None:
            continue
        codes = {r.values.get(f.name) for r in results if r.values.get(f.name)}
        found: dict[str, object] = {}
        if codes:
            model = f.ref.model
            col = getattr(model, f.ref.code_attr)
            for obj in db.scalars(select(model).where(model.tenant_id == tenant_id, col.in_(codes))):
                found[getattr(obj, f.ref.code_attr)] = obj
        for r in results:
            code = r.values.get(f.name)
            if not code:
                if f.ref.target not in r.resolved:
                    r.resolved[f.ref.target] = None
                continue
            obj = found.get(code)
            if obj is None:
                r.errors.append({"field": f.name, "message": f"{f.name} '{code}' does not exist — import {f.ref.model.__tablename__} first"})
            else:
                r.resolved[f.ref.target] = obj.id
                r.resolved[f"_{f.ref.target}_obj"] = obj


def _dataset_specific(db: Session, tenant_id: int, spec: DatasetSpec, results: list[RowResult], tz: ZoneInfo) -> None:
    key = spec.key
    for r in results:
        v, res = r.values, r.resolved
        if key == "pricing_rules":
            cn, cv = v.get("contract_number"), v.get("contract_version")
            if (cn is None) != (cv is None):
                r.errors.append({"field": "contract_version", "message": "contract_number and contract_version must be given together"})
            elif cn is not None:
                ver = db.scalar(select(ContractVersion).join(Contract).where(
                    Contract.tenant_id == tenant_id, Contract.contract_number == cn, ContractVersion.version_number == cv))
                if ver is None:
                    r.errors.append({"field": "contract_version", "message": f"Contract {cn} has no version {cv}"})
                else:
                    res["contract_version_id"] = ver.id
            else:
                res["contract_version_id"] = None
            if v.get("pricing_model") in ("TIERED_GRADUATED", "TIERED_VOLUME") and not v.get("tiers"):
                r.errors.append({"field": "tiers", "message": "tiered pricing models require tiers"})
            disc = v.get("discount_pct")
            if disc is not None and not (Decimal("0") <= disc <= Decimal("100")):
                r.errors.append({"field": "discount_pct", "message": "discount must be between 0 and 100"})
        elif key == "subscriptions":
            contract = res.get("_contract_id_obj")
            if contract is not None and res.get("customer_id") and contract.customer_id != res["customer_id"]:
                r.errors.append({"field": "contract_number", "message": "contract belongs to a different customer"})
        elif key == "usage_events":
            sub = res.get("_subscription_id_obj")
            if sub is not None:
                res["customer_id"], res["product_id"] = sub.customer_id, sub.product_id
            if v.get("occurred_at") and v["occurred_at"] > datetime.now(UTC):
                r.errors.append({"field": "occurred_at", "message": "event timestamp is in the future"})
            if v.get("quantity") is not None and v["quantity"] < 0:
                r.errors.append({"field": "quantity", "message": "quantity cannot be negative"})
        elif key == "product_costs":
            if v.get("period_month"):
                res["period_month"] = v["period_month"].replace(day=1)
            if v.get("customer_code") and not v.get("allocation_basis"):
                res["allocation_basis"] = "DIRECT"
        elif key == "invoices":
            total, tax = v.get("total_amount"), v.get("tax_amount") or Decimal("0")
            if v.get("subtotal") is None and total is not None:
                res["subtotal"] = total - tax
            elif total is not None and v.get("subtotal") is not None and v["subtotal"] + tax != total:
                r.warnings.append({"field": "total_amount", "message": "subtotal + tax does not equal total (imported as received)"})
            if v.get("issue_date") and v.get("due_date") and v["due_date"] < v["issue_date"]:
                r.errors.append({"field": "due_date", "message": "due date is before issue date"})
        elif key == "invoice_lines":
            qty, price = v.get("quantity") or Decimal("0"), v.get("unit_price") or Decimal("0")
            disc = v.get("discount_amount") or Decimal("0")
            if v.get("line_amount") is not None and abs(qty * price - disc - v["line_amount"]) > Decimal("0.05"):
                r.warnings.append({"field": "line_amount", "message": "line amount differs from quantity × unit price − discount (imported as received)"})
        elif key == "payments":
            res["source"] = "IMPORTED_FILE"
            res["verification_status"] = "UNVERIFIED"
            if v.get("amount") is not None and v["amount"] <= 0:
                r.errors.append({"field": "amount", "message": "payment amount must be positive"})
        elif key in ("payment_allocations", "credit_adjustments"):
            if v.get("amount") is not None and v["amount"] <= 0:
                r.errors.append({"field": "amount", "message": "amount must be positive"})
        for a, b in (("start_date", "end_date"), ("effective_from", "effective_to"), ("period_start", "period_end")):
            if v.get(a) and v.get(b) and v[b] < v[a]:
                r.errors.append({"field": b, "message": f"{b} is before {a}"})


def _nk_attrs(spec: DatasetSpec) -> list[str]:
    out = []
    for name in spec.natural_key:
        f = spec.field(name)
        out.append(f.ref.target if f.ref else name)
    return out


def _nk_value(r: RowResult, spec: DatasetSpec) -> tuple:
    vals = []
    for attr, name in zip(_nk_attrs(spec), spec.natural_key):
        val = r.resolved.get(attr, r.values.get(name))
        if attr == "period_month" and isinstance(val, date):
            val = val.replace(day=1)
        vals.append(_norm_key(val))
    return tuple(vals)


def _norm_key(v):
    if isinstance(v, Decimal):
        return format(v.normalize(), "f")
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return None if v is None else str(v)


def _check_duplicates(db: Session, tenant_id: int, spec: DatasetSpec, results: list[RowResult]) -> None:
    seen: dict[tuple, int] = {}
    for r in results:
        if r.errors:
            continue
        k = _nk_value(r, spec)
        r.natural_key = "|".join("" if x is None else x for x in k)
        if k in seen:
            r.status = "DUPLICATE"
            r.errors.append({"field": ",".join(spec.natural_key), "message": f"duplicate of row {seen[k]} in this file"})
        else:
            seen[k] = r.row_number
    attrs = _nk_attrs(spec)
    first = attrs[0]
    candidates = {r.resolved.get(first, r.values.get(spec.natural_key[0])) for r in results if r.status == "ACCEPTED" and not r.errors}
    candidates.discard(None)
    if not candidates:
        return
    model = spec.model
    cols = [getattr(model, a) for a in attrs]
    existing = set()
    tenant_col = getattr(model, "tenant_id")
    for row in db.execute(select(*cols).where(tenant_col == tenant_id, getattr(model, first).in_(candidates))):
        existing.add(tuple(_norm_key(x) for x in row))
    for r in results:
        if r.status == "ACCEPTED" and not r.errors and _nk_value(r, spec) in existing:
            r.status = "DUPLICATE"
            r.errors.append({"field": ",".join(spec.natural_key), "message": "a record with this key already exists (not imported again)"})


def validate(db: Session, tenant_id: int, spec: DatasetSpec, rows: list[dict], mapping: dict[str, str]) -> list[RowResult]:
    tz = ZoneInfo(db.get(Tenant, tenant_id).timezone)
    reverse = {target: src for src, target in mapping.items() if target}
    results: list[RowResult] = []
    for i, raw in enumerate(rows, start=2):  # row 1 is the header
        r = RowResult(row_number=i, raw=raw)
        for f in spec.fields:
            src = reverse.get(f.name)
            try:
                val = coerce(f, raw.get(src, ""), tz) if src else None
            except ValueError as exc:
                r.errors.append({"field": f.name, "message": str(exc)})
                continue
            if val is None and f.default is not None:
                val = coerce(f, f.default, tz) if isinstance(f.default, str) else f.default
            if val is None and f.required:
                r.errors.append({"field": f.name, "message": "required value is missing"})
            r.values[f.name] = val
        results.append(r)
    _resolve_refs(db, tenant_id, spec, results)
    _dataset_specific(db, tenant_id, spec, results, tz)
    _check_duplicates(db, tenant_id, spec, results)
    for r in results:
        if r.errors and r.status == "ACCEPTED":
            r.status = "REJECTED"
    return results


# ----------------------------------------------------------------------------- batch lifecycle
def _batch_code(db: Session, tenant_id: int) -> str:
    n = (db.scalar(select(func.count(ImportBatch.id)).where(ImportBatch.tenant_id == tenant_id)) or 0) + 1
    return f"IMP-{datetime.now(UTC):%Y%m%d}-{n:05d}"


def _store_results(db: Session, batch: ImportBatch, results: list[RowResult]) -> None:
    db.execute(delete(ImportRow).where(ImportRow.batch_id == batch.id))
    batch.total_rows = len(results)
    batch.accepted_rows = sum(1 for r in results if r.status == "ACCEPTED")
    batch.rejected_rows = sum(1 for r in results if r.status == "REJECTED")
    batch.duplicate_rows = sum(1 for r in results if r.status == "DUPLICATE")
    issues: dict[str, int] = {}
    for r in results:
        for e in r.errors:
            issues[f"{e['field']}: {e['message'].split(' — ')[0][:80]}"] = issues.get(f"{e['field']}: {e['message'].split(' — ')[0][:80]}", 0) + 1
    batch.issues_summary = {"errors": dict(sorted(issues.items(), key=lambda x: -x[1])[:25]),
                            "warnings": sum(len(r.warnings) for r in results)}
    db.bulk_insert_mappings(ImportRow, [dict(
        batch_id=batch.id, row_number=r.row_number, raw_values=r.raw,
        normalized_values={**{k: _jsonable(v) for k, v in r.values.items()},
                           **{k: _jsonable(v) for k, v in r.resolved.items() if not k.startswith("_")},
                           **({"_warnings": r.warnings} if r.warnings else {})},
        status=r.status, errors=r.errors, natural_key=r.natural_key[:255]) for r in results])


def create_batch(db: Session, tenant_id: int, user_id: int | None, filename: str, content: bytes,
                 dataset_key: str | None = None, mapping: dict[str, str] | None = None,
                 data_origin: str = "USER_UPLOAD") -> tuple[ImportBatch, list[dict]]:
    filename = PurePath(filename or "upload").name[:255]
    columns, rows = parse_file(filename, content)
    if not rows:
        raise ImportError_("The file has a header but no data rows")
    candidates = identify_dataset(columns)
    if dataset_key is None:
        best = candidates[0]
        if best["missing_required"]:
            raise ImportError_("Could not identify the dataset from the column headers; choose the dataset type explicitly",
                               candidates=candidates[:3])
        dataset_key = best["dataset"]
    if dataset_key not in DATASETS:
        raise ImportError_(f"Unknown dataset '{dataset_key}'")
    spec = DATASETS[dataset_key]
    sha = hashlib.sha256(content).hexdigest()
    prior = db.scalar(select(ImportBatch).where(ImportBatch.tenant_id == tenant_id, ImportBatch.file_sha256 == sha,
                                                ImportBatch.dataset_type == dataset_key, ImportBatch.status == "IMPORTED"))
    if prior is not None:
        raise ImportError_(f"This exact file was already imported as {prior.batch_code}; nothing to import", 409,
                           batch_id=prior.id, batch_code=prior.batch_code)
    mapping = mapping or suggest_mapping(spec, columns)
    unknown = [t for t in mapping.values() if t and t not in {f.name for f in spec.fields}]
    if unknown:
        raise ImportError_(f"Mapping targets unknown fields: {unknown}")
    batch = ImportBatch(tenant_id=tenant_id, batch_code=_batch_code(db, tenant_id), dataset_type=dataset_key,
                        file_name=filename, file_sha256=sha, file_size_bytes=len(content), data_origin=data_origin,
                        status="VALIDATED", source_columns=columns, column_mapping=mapping, uploaded_by=user_id)
    db.add(batch)
    db.flush()
    results = validate(db, tenant_id, spec, rows, mapping)
    _store_results(db, batch, results)
    return batch, candidates[:3]


def remap(db: Session, batch: ImportBatch, mapping: dict[str, str]) -> ImportBatch:
    if batch.status != "VALIDATED":
        raise ImportError_(f"Batch is {batch.status}; only VALIDATED batches can be re-mapped", 409)
    spec = DATASETS[batch.dataset_type]
    raws = [r.raw_values for r in db.scalars(select(ImportRow).where(ImportRow.batch_id == batch.id).order_by(ImportRow.row_number))]
    batch.column_mapping = mapping
    results = validate(db, batch.tenant_id, spec, raws, mapping)
    _store_results(db, batch, results)
    return batch


def _entity_kwargs(spec: DatasetSpec, normalized: dict) -> dict:
    cols = {c.key for c in spec.model.__table__.columns}
    kw = {}
    for k, v in normalized.items():
        if k.startswith("_") or k not in cols:
            continue
        kw[k] = v
    # restore typed values from their JSON representation
    for c in spec.model.__table__.columns:
        val = kw.get(c.key)
        if val is None or not isinstance(val, str):
            continue
        if isinstance(c.type, Numeric):
            kw[c.key] = D(val)
        elif isinstance(c.type, DateTime):
            kw[c.key] = datetime.fromisoformat(val)
        elif isinstance(c.type, Date):
            kw[c.key] = date.fromisoformat(val)
    return kw


def confirm(db: Session, batch: ImportBatch, user_id: int | None) -> int:
    """Insert accepted rows atomically. References are re-validated first because the
    database may have changed since the batch was validated."""
    if batch.status != "VALIDATED":
        raise ImportError_(f"Batch is {batch.status}; only VALIDATED batches can be confirmed", 409)
    spec = DATASETS[batch.dataset_type]
    rows = list(db.scalars(select(ImportRow).where(ImportRow.batch_id == batch.id).order_by(ImportRow.row_number)))
    results = validate(db, batch.tenant_id, spec, [r.raw_values for r in rows], batch.column_mapping)
    _store_results(db, batch, results)
    db.flush()
    rows = list(db.scalars(select(ImportRow).where(ImportRow.batch_id == batch.id, ImportRow.status == "ACCEPTED")
                           .order_by(ImportRow.row_number)))
    if not rows:
        raise ImportError_("No accepted rows to import", 409)
    entities = []
    for r in rows:
        kw = _entity_kwargs(spec, r.normalized_values)
        if spec.key == "payments" and batch.data_origin == "SYNTHETIC_DEMO":
            kw["source"] = "SYNTHETIC_DEMO"
        entities.append((r, spec.model(tenant_id=batch.tenant_id, source_batch_id=batch.id, source_row_number=r.row_number, **kw)))
    try:
        with db.begin_nested():
            db.add_all([e for _, e in entities])
            db.flush()
    except IntegrityError as exc:
        batch.status = "FAILED"
        batch.issues_summary = {**batch.issues_summary, "database_error": str(exc.orig).split("\n")[0][:300]}
        raise ImportError_("The database rejected the batch; nothing was imported", 409, detail=str(exc.orig).split("\n")[0][:300]) from exc
    for r, e in entities:
        r.entity_table, r.entity_id = spec.model.__tablename__, e.id
    batch.inserted_rows = len(entities)
    batch.status, batch.confirmed_by, batch.confirmed_at = "IMPORTED", user_id, datetime.now(UTC)
    return len(entities)


def rollback(db: Session, batch: ImportBatch, reason: str) -> int:
    """Delete exactly the records this batch inserted — only if nothing else depends on them."""
    if batch.status != "IMPORTED":
        raise ImportError_(f"Batch is {batch.status}; only IMPORTED batches can be rolled back", 409)
    spec = DATASETS[batch.dataset_type]
    model = spec.model
    ids = list(db.scalars(select(ImportRow.entity_id).where(ImportRow.batch_id == batch.id, ImportRow.entity_id.is_not(None))))
    if model is Invoice:
        dependent = db.scalar(select(func.count(InvoiceLine.id)).where(InvoiceLine.invoice_id.in_(ids)))
        if dependent:
            raise ImportError_(f"{dependent} invoice line(s) belong to these invoices; roll back the invoice-line batch first", 409)
    try:
        with db.begin_nested():
            for i in range(0, len(ids), 1000):
                db.execute(delete(model).where(model.id.in_(ids[i:i + 1000])))
    except IntegrityError as exc:
        raise ImportError_("Records from this batch are referenced by other data (later imports or audit results) and "
                           "cannot be removed safely", 409, detail=str(exc.orig).split("\n")[0][:300]) from exc
    batch.status, batch.rolled_back_at, batch.rollback_reason = "ROLLED_BACK", datetime.now(UTC), reason[:255]
    return len(ids)


def import_records_direct(db: Session, tenant_id: int, dataset_key: str, records: list[dict], file_name: str,
                          data_origin: str = "SYNTHETIC_DEMO", user_id: int | None = None) -> ImportBatch:
    """Programmatic import through the same validation + lineage path (used by the seed)."""
    spec = DATASETS[dataset_key]
    buf = io.StringIO()
    cols = [f.name for f in spec.fields]
    w = csv.DictWriter(buf, fieldnames=cols)
    w.writeheader()
    for rec in records:
        w.writerow({k: ("" if rec.get(k) is None else (json.dumps(rec[k]) if isinstance(rec.get(k), list) else _jsonable(rec[k])))
                    for k in cols})
    batch, _ = create_batch(db, tenant_id, user_id, file_name, buf.getvalue().encode(), dataset_key, None, data_origin)
    if batch.rejected_rows or batch.duplicate_rows:
        bad = db.scalars(select(ImportRow).where(ImportRow.batch_id == batch.id, ImportRow.status != "ACCEPTED").limit(3)).all()
        raise ImportError_(f"{dataset_key}: {batch.rejected_rows} rejected / {batch.duplicate_rows} duplicate rows",
                           detail=[r.errors for r in bad])
    confirm(db, batch, user_id)
    return batch
