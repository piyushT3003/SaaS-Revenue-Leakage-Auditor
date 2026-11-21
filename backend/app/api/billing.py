"""Billing & Payments: invoice register, invoice PDF, draft invoices from obligations (with duplicate
prevention), authorised corrections, payment register, manual payments, allocations, credits, ageing."""
from __future__ import annotations

import io
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.analytics import metrics as M
from backend.app.api.common import J, Page, not_found, pagination
from backend.app.core.database import get_db
from backend.app.core.money import D, money
from backend.app.models import (
    Contract,
    CreditAdjustment,
    Customer,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    Product,
    Subscription,
    Tenant,
)
from backend.app.reconciliation.billing import match_invoice_lines
from backend.app.reconciliation.obligations import build_expected_obligations
from backend.app.reconciliation.payments import AGEING_BUCKETS, ageing_bucket
from backend.app.security.auth import CurrentUser, require
from backend.app.services.tenancy import notify, record_audit

router = APIRouter()
GST_RATE = Decimal("0.18")


def _balances(db: Session, tenant_id: int, as_of: date) -> dict[int, dict]:
    out = {}
    for r in M._invoice_balances(db, tenant_id, as_of):
        bal = money(D(r.total_amount) - D(r.credit) - D(r.paid))
        bucket, dpd = ageing_bucket(r.due_date, as_of)
        status = "PAID" if bal == 0 and D(r.paid) > 0 else "CREDITED" if bal == 0 else "OVER_APPLIED" if bal < 0 else \
            ("OVERDUE" if dpd > 0 else ("PARTIALLY_PAID" if D(r.paid) > 0 else "PENDING"))
        out[r.id] = {"outstanding": bal, "paid": money(D(r.paid)), "credits": money(D(r.credit)), "payment_status": status,
                     "ageing_bucket": bucket if bal > 0 else "", "days_past_due": dpd if bal > 0 else 0}
    return out


@router.get("/billing/summary")
def summary(period_start: date, period_end: date, as_of: date | None = None, user: CurrentUser = Depends(require("read")),
            db: Session = Depends(get_db)):
    t, as_of = user.tenant_id, as_of or date.today()
    invoiced = db.scalar(select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
        Invoice.tenant_id == t, Invoice.status == "ISSUED", Invoice.issue_date >= period_start, Invoice.issue_date <= period_end))
    received = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.tenant_id == t, Payment.status == "RECEIVED", Payment.received_on >= period_start, Payment.received_on <= period_end))
    ageing = {b: Decimal("0") for b in AGEING_BUCKETS}
    counts = {b: 0 for b in AGEING_BUCKETS}
    for b in _balances(db, t, as_of).values():
        if b["outstanding"] > 0:
            ageing[b["ageing_bucket"]] += b["outstanding"]
            counts[b["ageing_bucket"]] += 1
    unallocated = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0) - func.coalesce(
        select(func.sum(PaymentAllocation.amount)).join(Payment).where(Payment.tenant_id == t, Payment.status == "RECEIVED",
                                                         PaymentAllocation.reversed_at.is_(None)).scalar_subquery(), 0))
        .where(Payment.tenant_id == t, Payment.status == "RECEIVED"))
    return J({
        "invoiced_amount": {"value": invoiced, "basis": f"Total (incl. tax) of ISSUED invoices dated {period_start}..{period_end}"},
        "payments_received": {"value": received, "basis": f"Payments recorded {period_start}..{period_end} (UNVERIFIED unless bank-confirmed)"},
        "outstanding": M.outstanding(db, t, as_of).to_dict(),
        "collection_rate": M.collection_rate(db, t, period_start, period_end, as_of).to_dict(),
        "ageing": [{"bucket": b, "amount": money(ageing[b]), "invoices": counts[b]} for b in AGEING_BUCKETS],
        "unallocated_cash": money(D(unallocated)), "as_of": as_of,
    })


@router.get("/billing/invoices")
def invoices(search: str | None = None, status: str | None = None, payment_status: str | None = None,
             ageing: str | None = None, customer_id: int | None = None, period_start: date | None = None,
             period_end: date | None = None, as_of: date | None = None,
             sort: str = Query("-issue_date", pattern="^-?(issue_date|due_date|total|outstanding|number)$"),
             page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    t = user.tenant_id
    q = select(Invoice, Customer.name, Customer.customer_code).join(Customer).where(Invoice.tenant_id == t)
    if search:
        like = f"%{search}%"
        q = q.where(or_(Invoice.invoice_number.ilike(like), Customer.name.ilike(like)))
    if status:
        q = q.where(Invoice.status.in_(status.upper().split(",")))
    if customer_id:
        q = q.where(Invoice.customer_id == customer_id)
    if period_start:
        q = q.where(Invoice.issue_date >= period_start)
    if period_end:
        q = q.where(Invoice.issue_date <= period_end)
    rows = db.execute(q).all()
    bal = _balances(db, t, as_of or date.today())
    items = []
    for inv, cname, ccode in rows:
        b = bal.get(inv.id, {"outstanding": None, "paid": None, "credits": None, "payment_status": inv.status,
                             "ageing_bucket": "", "days_past_due": 0})
        items.append({"id": inv.id, "number": inv.invoice_number, "customer": {"id": inv.customer_id, "name": cname, "code": ccode},
                      "issue_date": inv.issue_date, "due_date": inv.due_date, "status": inv.status, "subtotal": inv.subtotal,
                      "tax": inv.tax_amount, "total": inv.total_amount, **b, "replaces_invoice_id": inv.replaces_invoice_id})
    if payment_status:
        items = [i for i in items if i["payment_status"] in payment_status.upper().split(",")]
    if ageing:
        items = [i for i in items if i["ageing_bucket"] == ageing]
    key = {"issue_date": "issue_date", "due_date": "due_date", "total": "total", "outstanding": "outstanding", "number": "number"}[sort.lstrip("-")]
    items.sort(key=lambda i: (i[key] is not None, i[key] if i[key] is not None else 0), reverse=sort.startswith("-"))
    return page.wrap(J(items[page.offset: page.offset + page.page_size]), len(items))


def _invoice(db: Session, user: CurrentUser, invoice_id: int) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if inv is None or inv.tenant_id != user.tenant_id:
        raise not_found("Invoice")
    return inv


@router.get("/billing/invoices/{invoice_id}")
def invoice_detail(invoice_id: int, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    inv = _invoice(db, user, invoice_id)
    cust = db.get(Customer, inv.customer_id)
    lines = db.execute(select(InvoiceLine, Product.name, Subscription.subscription_code).outerjoin(Product, Product.id == InvoiceLine.product_id)
                       .outerjoin(Subscription, Subscription.id == InvoiceLine.subscription_id)
                       .where(InvoiceLine.invoice_id == inv.id).order_by(InvoiceLine.line_number)).all()
    allocs = db.execute(select(PaymentAllocation, Payment.payment_number).join(Payment).where(PaymentAllocation.invoice_id == inv.id, PaymentAllocation.reversed_at.is_(None))).all()
    credits = db.scalars(select(CreditAdjustment).where(CreditAdjustment.invoice_id == inv.id)).all()
    b = _balances(db, user.tenant_id, date.today()).get(inv.id)
    return J({"id": inv.id, "number": inv.invoice_number, "status": inv.status, "issue_date": inv.issue_date, "due_date": inv.due_date,
              "currency": inv.currency, "subtotal": inv.subtotal, "tax": inv.tax_amount, "total": inv.total_amount,
              "void_reason": inv.void_reason, "replaces_invoice_id": inv.replaces_invoice_id, "balance": b,
              "customer": {"id": cust.id, "name": cust.name, "code": cust.customer_code},
              "lines": [{"id": ln.id, "line_number": ln.line_number, "product": pname, "subscription": scode, "charge_type": ln.charge_type,
                         "description": ln.description, "period_start": ln.period_start, "period_end": ln.period_end,
                         "quantity": ln.quantity, "unit_price": ln.unit_price, "discount_pct": ln.discount_pct,
                         "discount_amount": ln.discount_amount, "line_amount": ln.line_amount,
                         "billing_obligation_ref": ln.billing_obligation_ref} for ln, pname, scode in lines],
              "allocations": [{"id": a.id, "payment_number": pn, "amount": a.amount, "allocated_on": a.allocated_on} for a, pn in allocs],
              "credits": [{"id": c.id, "number": c.credit_number, "type": c.adjustment_type, "amount": c.amount, "status": c.status,
                           "reason": c.reason} for c in credits],
              "source": {"batch_id": inv.source_batch_id, "row": inv.source_row_number}})


@router.get("/billing/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    d = invoice_detail(invoice_id, user, db)
    tenant = db.get(Tenant, user.tenant_id)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm,
                            title=f"Invoice {d['number']}", author=tenant.name)
    st = getSampleStyleSheet()
    rs = lambda s: f"Rs. {Decimal(s):,.2f}"  # noqa: E731  (built-in PDF fonts have no ₹ glyph)
    story = [Paragraph(f"<b>{tenant.name}</b>", st["Title"]),
             Paragraph(f"Invoice <b>{d['number']}</b> &nbsp; Status: <b>{d['status']}</b>", st["Normal"]),
             Paragraph(f"Customer: {d['customer']['name']} ({d['customer']['code']})", st["Normal"]),
             Paragraph(f"Issue date: {d['issue_date']} &nbsp; Due date: {d['due_date']} &nbsp; Currency: {d['currency']}", st["Normal"]),
             Spacer(1, 6 * mm)]
    data = [["#", "Description", "Period", "Qty", "Unit price", "Disc %", "Amount"]]
    for ln in d["lines"]:
        data.append([ln["line_number"], Paragraph(ln["description"] or ln["product"] or "", st["BodyText"]),
                     f"{ln['period_start'] or ''}\n{ln['period_end'] or ''}", f"{Decimal(ln['quantity']):,.2f}",
                     rs(ln["unit_price"]), ln["discount_pct"], rs(ln["line_amount"])])
    data += [["", "", "", "", "", "Subtotal", rs(d["subtotal"])], ["", "", "", "", "", "Tax", rs(d["tax"])],
             ["", "", "", "", "", "Total", rs(d["total"])]]
    tbl = Table(data, colWidths=[8 * mm, 62 * mm, 24 * mm, 16 * mm, 26 * mm, 18 * mm, 28 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1B3A")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                             ("FONTSIZE", (0, 0), (-1, -1), 8), ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
                             ("GRID", (0, 0), (-1, -4), 0.25, colors.grey), ("FONTNAME", (5, -1), (-1, -1), "Helvetica-Bold")]))
    story += [tbl, Spacer(1, 6 * mm)]
    if d["balance"]:
        story.append(Paragraph(f"Paid: {rs(d['balance']['paid'])} &nbsp; Credits: {rs(d['balance']['credits'])} &nbsp; "
                               f"Outstanding: <b>{rs(d['balance']['outstanding'])}</b>", st["Normal"]))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Generated by SaaS Revenue Assurance from recorded invoice data. Demonstration data is synthetic.", st["Italic"]))
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{d["number"]}.pdf"'})


# ----------------------------------------------------------------------------- draft invoices (coverage + duplicate prevention)
class DraftRequest(BaseModel):
    customer_id: int
    period_start: date
    period_end: date


@router.post("/billing/invoices/draft/preview")
def draft_preview(body: DraftRequest, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    return J(_draft_lines(db, user.tenant_id, body))


def _draft_lines(db: Session, tenant_id: int, body: DraftRequest) -> dict:
    build = build_expected_obligations(db, tenant_id, body.period_start, body.period_end, [body.customer_id])
    matched = match_invoice_lines(db, tenant_id, body.period_start, body.period_end, build.obligations, {body.customer_id})
    referenced = set(db.scalars(select(InvoiceLine.billing_obligation_ref).join(Invoice).where(
        Invoice.tenant_id == tenant_id, Invoice.status.in_(("DRAFT", "ISSUED")),
        InvoiceLine.billing_obligation_ref.in_([o.key for o in build.obligations] or [""]))))
    eligible, covered, excluded = [], [], []
    for m in matched.matches:
        o = m.obligation
        if o.excluded:
            excluded.append({"obligation_key": o.key, "reason": o.exclusion_reason})
        elif m.allocations or o.key in referenced:
            covered.append({"obligation_key": o.key, "subscription": o.subscription_code, "charge_type": o.charge_type,
                            "invoices": sorted({a.line.invoice_number for a in m.allocations}) or ["(draft)"]})
        elif o.calc and o.calc.total > 0:
            gross = sum((c.amount for c in o.calc.components if c.component_type != "DISCOUNT"), Decimal("0"))
            qty = o.calc.expected_quantity or Decimal("1")
            eligible.append({"obligation_key": o.key, "subscription_id": o.subscription_id, "subscription": o.subscription_code,
                             "product_id": o.product_id, "charge_type": o.charge_type, "period_start": o.period_start,
                             "period_end": o.period_end, "quantity": qty,
                             "unit_price": o.calc.expected_unit_price if o.calc.expected_unit_price is not None else (gross / qty).quantize(Decimal("0.0001")),
                             "discount_pct": o.calc.expected_discount_pct or Decimal("0"), "discount_amount": money(gross - o.calc.total),
                             "line_amount": o.calc.total, "formula": "; ".join(c.formula for c in o.calc.components)})
    return {"eligible": eligible, "already_covered": covered, "excluded": excluded,
            "subtotal": money(sum((e["line_amount"] for e in eligible), Decimal("0")))}


@router.post("/billing/invoices/draft", status_code=201)
def create_draft(body: DraftRequest, user: CurrentUser = Depends(require("finance:correct")), db: Session = Depends(get_db)):
    cust = db.get(Customer, body.customer_id)
    if cust is None or cust.tenant_id != user.tenant_id:
        raise not_found("Customer")
    plan = _draft_lines(db, user.tenant_id, body)
    if not plan["eligible"]:
        raise HTTPException(409, "Every eligible billing obligation for this period is already invoiced; no draft created")
    n = (db.scalar(select(func.count(Invoice.id)).where(Invoice.tenant_id == user.tenant_id, Invoice.invoice_number.like("DRF-%"))) or 0) + 1
    ctr = db.scalar(select(Contract).where(Contract.customer_id == cust.id).order_by(Contract.start_date.desc()))
    subtotal = plan["subtotal"]
    tax = money(subtotal * GST_RATE)
    inv = Invoice(tenant_id=user.tenant_id, invoice_number=f"DRF-{body.period_start:%y%m}-{n:05d}", customer_id=cust.id,
                  contract_id=ctr.id if ctr else None, issue_date=date.today(),
                  due_date=date.today() + timedelta(days=ctr.payment_terms_days if ctr else 30), status="DRAFT",
                  subtotal=subtotal, tax_amount=tax, total_amount=money(subtotal + tax))
    db.add(inv)
    db.flush()
    for i, e in enumerate(plan["eligible"], start=1):
        db.add(InvoiceLine(tenant_id=user.tenant_id, invoice_id=inv.id, line_number=i, product_id=e["product_id"],
                           subscription_id=e["subscription_id"], charge_type=e["charge_type"],
                           description=f"{e['subscription']} {e['charge_type'].lower()} {e['period_start']:%b %Y}",
                           period_start=e["period_start"], period_end=e["period_end"], quantity=e["quantity"],
                           unit_price=e["unit_price"], discount_pct=e["discount_pct"], discount_amount=e["discount_amount"],
                           line_amount=e["line_amount"], billing_obligation_ref=e["obligation_key"]))
    record_audit(db, user.tenant_id, user.id, "DRAFT_INVOICE_CREATED", "invoice", inv.id, number=inv.invoice_number,
                 lines=len(plan["eligible"]), subtotal=str(subtotal))
    db.commit()
    return invoice_detail(inv.id, user, db)


class IssueBody(BaseModel):
    invoice_number: str | None = Field(default=None, max_length=40)


@router.post("/billing/invoices/{invoice_id}/issue")
def issue(invoice_id: int, body: IssueBody, user: CurrentUser = Depends(require("finance:approve")), db: Session = Depends(get_db)):
    inv = _invoice(db, user, invoice_id)
    if inv.status != "DRAFT":
        raise HTTPException(409, "Only DRAFT invoices can be issued")
    refs = [ln.billing_obligation_ref for ln in inv.lines if ln.billing_obligation_ref]
    clash = db.scalar(select(Invoice.invoice_number).join(InvoiceLine).where(
        Invoice.tenant_id == user.tenant_id, Invoice.status == "ISSUED", Invoice.id != inv.id, InvoiceLine.billing_obligation_ref.in_(refs or [""])))
    if clash:
        raise HTTPException(409, f"An obligation on this draft is already billed on issued invoice {clash}")
    if body.invoice_number:
        inv.invoice_number = body.invoice_number
    inv.status, inv.issue_date = "ISSUED", date.today()
    record_audit(db, user.tenant_id, user.id, "INVOICE_ISSUED", "invoice", inv.id, number=inv.invoice_number)
    db.commit()
    return {"ok": True, "status": inv.status, "number": inv.invoice_number}


class CorrectionLine(BaseModel):
    line_id: int
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    discount_pct: Decimal | None = Field(default=None, ge=0, le=100)


class CorrectionBody(BaseModel):
    reason: str = Field(min_length=10, max_length=500)
    lines: list[CorrectionLine] = Field(default_factory=list)
    add_missing_obligations: bool = False


@router.post("/billing/invoices/{invoice_id}/correct", status_code=201)
def correct(invoice_id: int, body: CorrectionBody, user: CurrentUser = Depends(require("finance:correct")), db: Session = Depends(get_db)):
    """STAGE 12 — authorised correction. The original invoice is voided (never edited) and a replacement
    invoice is issued, so history stays intact and the next audit sees the corrected records."""
    inv = _invoice(db, user, invoice_id)
    if inv.status != "ISSUED":
        raise HTTPException(409, "Only ISSUED invoices can be corrected")
    if not body.lines and not body.add_missing_obligations:
        raise HTTPException(422, "Specify at least one line change or add_missing_obligations")
    changes = {c.line_id: c for c in body.lines}
    if set(changes) - {ln.id for ln in inv.lines}:
        raise HTTPException(422, "A corrected line does not belong to this invoice")
    n = (db.scalar(select(func.count(Invoice.id)).where(Invoice.tenant_id == user.tenant_id, Invoice.replaces_invoice_id.is_not(None))) or 0) + 1
    new = Invoice(tenant_id=user.tenant_id, invoice_number=f"{inv.invoice_number}-R{n}", customer_id=inv.customer_id,
                  contract_id=inv.contract_id, issue_date=date.today(), due_date=max(inv.due_date, date.today()), status="ISSUED",
                  currency=inv.currency, replaces_invoice_id=inv.id)
    db.add(new)
    db.flush()
    subtotal = Decimal("0")
    k = 0
    for ln in inv.lines:
        c = changes.get(ln.id)
        qty = D(c.quantity) if c and c.quantity is not None else D(ln.quantity)
        price = D(c.unit_price) if c and c.unit_price is not None else D(ln.unit_price)
        disc_pct = D(c.discount_pct) if c and c.discount_pct is not None else D(ln.discount_pct)
        if c:
            gross = money(qty * price)
            disc = money(gross * disc_pct / 100)
            amount = money(gross - disc)
        else:
            disc, amount = D(ln.discount_amount), D(ln.line_amount)
        k += 1
        db.add(InvoiceLine(tenant_id=user.tenant_id, invoice_id=new.id, line_number=k, product_id=ln.product_id,
                           subscription_id=ln.subscription_id, charge_type=ln.charge_type, description=ln.description,
                           period_start=ln.period_start, period_end=ln.period_end, quantity=qty, unit_price=price,
                           discount_pct=disc_pct, discount_amount=disc, line_amount=amount,
                           billing_obligation_ref=ln.billing_obligation_ref, contract_ref=ln.contract_ref))
        subtotal += amount
    if body.add_missing_obligations:
        periods = sorted({(ln.period_start, ln.period_end) for ln in inv.lines if ln.period_start})
        if periods:
            plan = _draft_lines(db, user.tenant_id, DraftRequest(customer_id=inv.customer_id, period_start=periods[0][0], period_end=periods[0][0]))
            for e in plan["eligible"]:
                k += 1
                db.add(InvoiceLine(tenant_id=user.tenant_id, invoice_id=new.id, line_number=k, product_id=e["product_id"],
                                   subscription_id=e["subscription_id"], charge_type=e["charge_type"],
                                   description=f"{e['subscription']} {e['charge_type'].lower()} (added by correction)",
                                   period_start=e["period_start"], period_end=e["period_end"], quantity=e["quantity"],
                                   unit_price=e["unit_price"], discount_pct=e["discount_pct"], discount_amount=e["discount_amount"],
                                   line_amount=e["line_amount"], billing_obligation_ref=e["obligation_key"]))
                subtotal += e["line_amount"]
    tax_rate = (D(inv.tax_amount) / D(inv.subtotal)) if D(inv.subtotal) else GST_RATE
    new.subtotal, new.tax_amount = money(subtotal), money(subtotal * tax_rate)
    new.total_amount = money(new.subtotal + new.tax_amount)
    inv.status, inv.void_reason, inv.voided_at = "VOID", f"Replaced by {new.invoice_number}: {body.reason}", datetime.now(UTC)
    # Allocations are append-only: reverse each one on the voided invoice and re-apply it to the replacement.
    for a in db.scalars(select(PaymentAllocation).where(PaymentAllocation.invoice_id == inv.id, PaymentAllocation.reversed_at.is_(None))):
        a.reversed_at, a.reversal_reason = datetime.now(UTC), f"Invoice {inv.invoice_number} voided by correction"
        db.add(PaymentAllocation(tenant_id=a.tenant_id, payment_id=a.payment_id, invoice_id=new.id, amount=a.amount,
                                 allocated_on=a.allocated_on, allocated_by=user.id, method="CORRECTION"))
    record_audit(db, user.tenant_id, user.id, "INVOICE_CORRECTED", "invoice", inv.id, replacement=new.invoice_number,
                 reason=body.reason, changed_lines=list(changes), added_missing=body.add_missing_obligations)
    notify(db, user.tenant_id, "SYSTEM", f"Invoice {inv.invoice_number} corrected", f"Replacement {new.invoice_number}; re-run the audit",
           link=f"/billing?invoice={new.id}")
    db.commit()
    return invoice_detail(new.id, user, db)


# ----------------------------------------------------------------------------- payments
@router.get("/billing/payments")
def payments(search: str | None = None, allocation: str | None = Query(None, pattern="^(ALLOCATED|PARTIAL|UNALLOCATED)$"),
             period_start: date | None = None, period_end: date | None = None, page: Page = Depends(pagination),
             user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    q = (select(Payment, Customer.name).outerjoin(Customer).options(selectinload(Payment.allocations))
         .where(Payment.tenant_id == user.tenant_id))
    if search:
        like = f"%{search}%"
        q = q.where(or_(Payment.payment_number.ilike(like), Payment.transaction_reference.ilike(like), Customer.name.ilike(like)))
    if period_start:
        q = q.where(Payment.received_on >= period_start)
    if period_end:
        q = q.where(Payment.received_on <= period_end)
    items = []
    for p, cname in db.execute(q.order_by(Payment.received_on.desc(), Payment.id.desc())).unique():
        allocated = money(sum((D(a.amount) for a in p.allocations if a.reversed_at is None), Decimal("0")))
        state = "ALLOCATED" if allocated >= D(p.amount) else "PARTIAL" if allocated > 0 else "UNALLOCATED"
        items.append({"id": p.id, "number": p.payment_number, "customer": cname, "customer_id": p.customer_id, "received_on": p.received_on,
                      "amount": p.amount, "method": p.method, "reference": p.transaction_reference, "remittance": p.remittance_invoice_ref,
                      "allocated": allocated, "unallocated": money(D(p.amount) - allocated), "allocation_state": state,
                      "source": p.source, "verification_status": p.verification_status, "status": p.status})
    if allocation:
        items = [i for i in items if i["allocation_state"] == allocation]
    return page.wrap(J(items[page.offset: page.offset + page.page_size]), len(items))


class PaymentBody(BaseModel):
    customer_id: int
    received_on: date
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)
    method: str = Field(default="BANK_TRANSFER", pattern="^(BANK_TRANSFER|UPI|CARD|CHEQUE|CASH)$")
    transaction_reference: str = Field(min_length=3, max_length=80)
    note: str = ""

    @field_validator("received_on")
    @classmethod
    def _not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("received_on cannot be in the future")
        return v


@router.post("/billing/payments", status_code=201)
def record_payment(body: PaymentBody, user: CurrentUser = Depends(require("finance:correct")), db: Session = Depends(get_db)):
    cust = db.get(Customer, body.customer_id)
    if cust is None or cust.tenant_id != user.tenant_id:
        raise not_found("Customer")
    dup = db.scalar(select(Payment.payment_number).where(Payment.tenant_id == user.tenant_id, Payment.customer_id == cust.id,
                                                         Payment.transaction_reference == body.transaction_reference,
                                                         Payment.amount == body.amount))
    if dup:
        raise HTTPException(409, f"A payment with this reference and amount already exists ({dup})")
    n = (db.scalar(select(func.count(Payment.id)).where(Payment.tenant_id == user.tenant_id, Payment.source == "MANUAL_ENTRY")) or 0) + 1
    p = Payment(tenant_id=user.tenant_id, payment_number=f"MPAY-{n:05d}", customer_id=cust.id, received_on=body.received_on,
                amount=body.amount, method=body.method, transaction_reference=body.transaction_reference,
                source="MANUAL_ENTRY", verification_status="UNVERIFIED")
    db.add(p)
    db.flush()
    record_audit(db, user.tenant_id, user.id, "PAYMENT_RECORDED", "payment", p.id, amount=str(body.amount), note=body.note)
    db.commit()
    return J({"id": p.id, "number": p.payment_number, "verification_status": p.verification_status})


class AllocationBody(BaseModel):
    invoice_id: int
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)


@router.post("/billing/payments/{payment_id}/allocate", status_code=201)
def allocate(payment_id: int, body: AllocationBody, user: CurrentUser = Depends(require("finance:correct")), db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if p is None or p.tenant_id != user.tenant_id:
        raise not_found("Payment")
    inv = _invoice(db, user, body.invoice_id)
    if inv.status != "ISSUED":
        raise HTTPException(409, "Payments can only be allocated to ISSUED invoices")
    if p.customer_id != inv.customer_id:
        raise HTTPException(409, "Payment and invoice belong to different customers")
    unallocated = D(p.amount) - sum((D(a.amount) for a in p.allocations if a.reversed_at is None), Decimal("0"))
    outstanding = _balances(db, user.tenant_id, date.today())[inv.id]["outstanding"]
    if body.amount > unallocated:
        raise HTTPException(409, f"Only {money(unallocated)} of this payment is unallocated")
    if body.amount > outstanding:
        raise HTTPException(409, f"Invoice outstanding is only {outstanding}")
    a = PaymentAllocation(tenant_id=user.tenant_id, payment_id=p.id, invoice_id=inv.id, amount=body.amount,
                          allocated_on=date.today(), allocated_by=user.id, method="MANUAL")
    db.add(a)
    db.flush()
    record_audit(db, user.tenant_id, user.id, "PAYMENT_ALLOCATED", "payment_allocation", a.id, payment=p.payment_number,
                 invoice=inv.invoice_number, amount=str(body.amount))
    db.commit()
    return {"ok": True, "allocation_id": a.id}


# ----------------------------------------------------------------------------- credits & adjustments
@router.get("/billing/credits")
def credits(status: str | None = None, page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")),
            db: Session = Depends(get_db)):
    q = (select(CreditAdjustment, Customer.name, Invoice.invoice_number).select_from(CreditAdjustment)
         .join(Customer, Customer.id == CreditAdjustment.customer_id).outerjoin(Invoice, Invoice.id == CreditAdjustment.invoice_id)
         .where(CreditAdjustment.tenant_id == user.tenant_id))
    if status:
        q = q.where(CreditAdjustment.status == status.upper())
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(CreditAdjustment.id.desc()).offset(page.offset).limit(page.page_size)).all()
    return page.wrap(J([{"id": c.id, "number": c.credit_number, "customer": cn, "invoice": inn, "type": c.adjustment_type,
                         "amount": c.amount, "reason": c.reason, "status": c.status, "effective_date": c.effective_date,
                         "requested_by": c.requested_by, "approved_by": c.approved_by} for c, cn, inn in rows]), total)


class CreditBody(BaseModel):
    customer_id: int
    invoice_id: int | None = None
    adjustment_type: str = Field(pattern="^(CREDIT_NOTE|DEBIT_ADJUSTMENT|WRITE_OFF)$")
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)
    reason: str = Field(min_length=10, max_length=1000)
    effective_date: date


@router.post("/billing/credits", status_code=201)
def create_credit(body: CreditBody, user: CurrentUser = Depends(require("finance:correct")), db: Session = Depends(get_db)):
    cust = db.get(Customer, body.customer_id)
    if cust is None or cust.tenant_id != user.tenant_id:
        raise not_found("Customer")
    if body.invoice_id:
        inv = _invoice(db, user, body.invoice_id)
        if inv.customer_id != cust.id:
            raise HTTPException(409, "Invoice belongs to a different customer")
    n = (db.scalar(select(func.count(CreditAdjustment.id)).where(CreditAdjustment.tenant_id == user.tenant_id)) or 0) + 1
    c = CreditAdjustment(tenant_id=user.tenant_id, credit_number=f"ADJ-{n:05d}", customer_id=cust.id, invoice_id=body.invoice_id,
                         adjustment_type=body.adjustment_type, amount=body.amount, reason=body.reason, status="PENDING",
                         effective_date=body.effective_date, requested_by=user.id)
    db.add(c)
    db.flush()
    record_audit(db, user.tenant_id, user.id, "ADJUSTMENT_REQUESTED", "credit_adjustment", c.id, amount=str(body.amount),
                 type=body.adjustment_type, reason=body.reason)
    notify(db, user.tenant_id, "SYSTEM", f"{c.credit_number} awaiting approval", f"{body.adjustment_type} of {body.amount} for {cust.name}",
           link="/billing?tab=credits")
    db.commit()
    return J({"id": c.id, "number": c.credit_number, "status": c.status})


class DecisionBody(BaseModel):
    decision: str = Field(pattern="^(APPROVED|REJECTED)$")
    note: str = Field(default="", max_length=500)


@router.post("/billing/credits/{credit_id}/decision")
def decide_credit(credit_id: int, body: DecisionBody, user: CurrentUser = Depends(require("finance:approve")), db: Session = Depends(get_db)):
    c = db.get(CreditAdjustment, credit_id)
    if c is None or c.tenant_id != user.tenant_id:
        raise not_found("Adjustment")
    if c.status != "PENDING":
        raise HTTPException(409, f"Adjustment is already {c.status}")
    if c.requested_by == user.id:
        raise HTTPException(403, "Segregation of duties: the requester cannot approve their own adjustment")
    c.status, c.approved_by, c.approved_at = body.decision, user.id, datetime.now(UTC)
    record_audit(db, user.tenant_id, user.id, f"ADJUSTMENT_{body.decision}", "credit_adjustment", c.id, note=body.note)
    db.commit()
    return {"ok": True, "status": c.status}
