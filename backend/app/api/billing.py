from fastapi import APIRouter, Depends, HTTPException, Query, Response, Form, status
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional, List
import uuid
from pydantic import BaseModel
from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models.entities import (
    Invoice, InvoiceLine, Payment, PaymentAllocation, CreditAdjustment,
    Customer, Product, AuditLog, ExceptionRecord, User
)
from backend.app.schemas.api_schemas import (
    InvoiceListItem, InvoiceDetail, DraftInvoiceCreate,
    PaymentRecordRequest, CreditAdjustmentCreate, AgeingAnalysis
)
from backend.app.analytics.financial_engine import FinancialCalculationEngine, quantize_money
from backend.app.exports.exporter import ExportService
from backend.app.security.auth import require_role, get_current_user

router = APIRouter()

@router.get("/metrics")
def get_billing_metrics(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).filter(Invoice.status != "Cancelled").all()
    invoiced_amount = sum(float(i.total_amount) for i in invoices)
    payments_received = sum(float(i.paid_amount) for i in invoices)
    outstanding_balance = sum(float(i.balance_due) for i in invoices)

    overdue_invoices = [i for i in invoices if i.status == "Overdue" or (i.balance_due > Decimal("0.00") and i.due_date < date.today())]
    overdue_amount = sum(float(i.balance_due) for i in overdue_invoices)

    coll_rate = (payments_received / invoiced_amount * 100.0) if invoiced_amount > 0 else 0.0

    return {
        "invoiced_amount": invoiced_amount,
        "payments_received": payments_received,
        "outstanding_balance": outstanding_balance,
        "collection_rate": round(coll_rate, 1),
        "overdue_amount": overdue_amount
    }

@router.get("/invoices")
def list_invoices(
    search: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    query = db.query(Invoice).filter(Invoice.status != "Cancelled")

    if search:
        search_filter = f"%{search}%"
        query = query.filter((Invoice.invoice_number.ilike(search_filter)))
    if customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    if status and status != "All":
        query = query.filter(Invoice.status == status)

    total_count = query.count()
    invoices = (
        query.order_by(Invoice.issue_date.desc(), Invoice.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "items": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "customer_id": inv.customer_id,
                "customer_name": inv.customer.name,
                "billing_period_start": str(inv.billing_period_start),
                "billing_period_end": str(inv.billing_period_end),
                "issue_date": str(inv.issue_date),
                "due_date": str(inv.due_date),
                "subtotal": float(inv.subtotal),
                "tax_amount": float(inv.tax_amount),
                "total_amount": float(inv.total_amount),
                "paid_amount": float(inv.paid_amount),
                "balance_due": float(inv.balance_due),
                "status": inv.status
            }
            for inv in invoices
        ]
    }

@router.get("/invoices/{id}")
def get_invoice_detail(id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    lines = [
        {
            "id": l.id,
            "product_id": l.product_id,
            "description": l.description,
            "quantity": float(l.quantity),
            "unit_price": float(l.unit_price),
            "discount_pct": float(l.discount_pct),
            "line_total": float(l.line_total),
            "line_type": l.line_type
        }
        for l in inv.lines
    ]

    allocations = [
        {
            "id": a.id,
            "payment_reference": a.payment.payment_reference,
            "payment_date": str(a.payment.payment_date),
            "allocated_amount": float(a.allocated_amount),
            "allocated_at": a.allocated_at.isoformat()
        }
        for a in inv.allocations
    ]

    credit_adjs = [
        {
            "id": c.id,
            "amount": float(c.amount),
            "reason": c.reason,
            "authorized_by": c.authorized_by,
            "status": c.status,
            "created_at": c.created_at.isoformat()
        }
        for c in inv.credit_adjustments
    ]

    return {
        "invoice": {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "customer_id": inv.customer_id,
            "customer_name": inv.customer.name,
            "customer_email": inv.customer.contact_email,
            "billing_period_start": str(inv.billing_period_start),
            "billing_period_end": str(inv.billing_period_end),
            "issue_date": str(inv.issue_date),
            "due_date": str(inv.due_date),
            "subtotal": float(inv.subtotal),
            "tax_amount": float(inv.tax_amount),
            "total_amount": float(inv.total_amount),
            "paid_amount": float(inv.paid_amount),
            "balance_due": float(inv.balance_due),
            "status": inv.status
        },
        "lines": lines,
        "allocations": allocations,
        "credit_adjustments": credit_adjs
    }

@router.post("/invoices/draft")
def create_draft_invoice(
    payload: DraftInvoiceCreate,
    current_user: User = Depends(require_role(["Admin", "Analyst"])),
    db: Session = Depends(get_db)
):
    cust = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    count = db.query(Invoice).count()
    inv_num = f"INV-DRAFT-{count + 1:04d}"

    subtotal = Decimal("0.00")
    inv_id = str(uuid.uuid4())
    lines = []

    for l in payload.lines:
        line_total = quantize_money(Decimal(str(l.quantity)) * Decimal(str(l.unit_price)) * (Decimal("1.0") - Decimal(str(l.discount_pct)) / Decimal("100.0")))
        subtotal += line_total
        line_obj = InvoiceLine(
            id=str(uuid.uuid4()),
            invoice_id=inv_id,
            product_id=l.product_id,
            description=l.description,
            quantity=Decimal(str(l.quantity)),
            unit_price=Decimal(str(l.unit_price)),
            discount_pct=Decimal(str(l.discount_pct)),
            line_total=line_total,
            line_type=l.line_type
        )
        lines.append(line_obj)

    tax = quantize_money(subtotal * Decimal("0.18"))
    total = subtotal + tax

    invoice = Invoice(
        id=inv_id,
        invoice_number=inv_num,
        customer_id=cust.id,
        billing_period_start=payload.billing_period_start,
        billing_period_end=payload.billing_period_end,
        issue_date=date.today(),
        due_date=payload.due_date,
        subtotal=subtotal,
        tax_amount=tax,
        total_amount=total,
        paid_amount=Decimal("0.00"),
        balance_due=total,
        status="Draft"
    )

    db.add(invoice)
    db.add_all(lines)

    log = AuditLog(
        action="CREATE_DRAFT_INVOICE",
        entity_type="Invoice",
        entity_id=invoice.id,
        details=f"Draft invoice {inv_num} created for {cust.name} (₹{total:,.2f})",
        user_id=current_user.id,
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {"status": "success", "invoice_id": invoice.id, "invoice_number": inv_num, "total": float(total)}

@router.get("/invoices/{id}/pdf")
def download_invoice_pdf(id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice_data = {
        "invoice_number": inv.invoice_number,
        "customer_name": inv.customer.name,
        "customer_email": inv.customer.contact_email,
        "issue_date": str(inv.issue_date),
        "due_date": str(inv.due_date),
        "billing_period": f"{inv.billing_period_start} to {inv.billing_period_end}",
        "subtotal": float(inv.subtotal),
        "tax_amount": float(inv.tax_amount),
        "total_amount": float(inv.total_amount),
        "paid_amount": float(inv.paid_amount),
        "balance_due": float(inv.balance_due),
        "status": inv.status,
        "lines": [
            {
                "description": l.description,
                "quantity": float(l.quantity),
                "unit_price": float(l.unit_price),
                "discount_pct": float(l.discount_pct),
                "line_total": float(l.line_total)
            }
            for l in inv.lines
        ]
    }

    pdf_buffer = ExportService.generate_invoice_pdf(invoice_data)
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={inv.invoice_number}.pdf"}
    )

@router.get("/payments")
def list_payments(page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    total = db.query(Payment).count()
    pmts = db.query(Payment).order_by(Payment.payment_date.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [
            {
                "id": p.id,
                "payment_reference": p.payment_reference,
                "customer_id": p.customer_id,
                "customer_name": p.customer.name,
                "payment_date": str(p.payment_date),
                "amount": float(p.amount),
                "method": p.payment_method,
                "allocated_amount": float(p.allocated_amount),
                "unallocated_amount": float(p.unallocated_amount),
                "status": p.status
            }
            for p in pmts
        ]
    }

@router.post("/payments")
def record_payment(
    payload: PaymentRecordRequest,
    current_user: User = Depends(require_role(["Admin", "Analyst"])),
    db: Session = Depends(get_db)
):
    cust = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    count = db.query(Payment).count()
    ref = f"PAY-MANUAL-{count + 1:04d}"

    payment_amt = quantize_money(Decimal(str(payload.amount)))
    pmt_id = str(uuid.uuid4())
    pmt = Payment(
        id=pmt_id,
        payment_reference=ref,
        customer_id=cust.id,
        payment_date=payload.payment_date,
        amount=payment_amt,
        payment_method=payload.payment_method,
        allocated_amount=Decimal("0.00"),
        unallocated_amount=payment_amt,
        status="Processed"
    )
    db.add(pmt)

    # Allocate to specific invoice if provided, otherwise FIFO across customer unpaid invoices
    allocated_to_inv = False
    remaining_to_allocate = payment_amt

    try:
        inv_query = db.query(Invoice).filter(Invoice.balance_due > Decimal("0.00"), Invoice.status != "Cancelled")
        if not settings.DATABASE_URL.startswith("sqlite"):
            inv_query = inv_query.with_for_update()

        if payload.invoice_id:
            target_invoices = inv_query.filter(Invoice.id == payload.invoice_id).all()
        else:
            target_invoices = (
                inv_query.filter(Invoice.customer_id == cust.id)
                .order_by(Invoice.due_date.asc(), Invoice.issue_date.asc())
                .all()
            )

        for inv in target_invoices:
            if remaining_to_allocate <= Decimal("0.00"):
                break
            alloc_amt = min(remaining_to_allocate, Decimal(str(inv.balance_due)))
            alloc = PaymentAllocation(
                id=str(uuid.uuid4()),
                payment_id=pmt_id,
                invoice_id=inv.id,
                allocated_amount=alloc_amt,
                allocated_at=datetime.utcnow()
            )
            db.add(alloc)

            pmt.allocated_amount += alloc_amt
            remaining_to_allocate -= alloc_amt

            inv.paid_amount += alloc_amt
            inv.balance_due -= alloc_amt
            if inv.balance_due <= Decimal("0.00"):
                inv.status = "Paid"
            else:
                inv.status = "Partial"
            allocated_to_inv = True

        pmt.unallocated_amount = remaining_to_allocate

        log = AuditLog(
            action="RECORD_PAYMENT",
            entity_type="Payment",
            entity_id=pmt.id,
            details=f"Recorded payment {ref} for {cust.name} (₹{payment_amt:,.2f})",
            user_id=current_user.id,
            created_at=datetime.utcnow()
        )
        db.add(log)
        db.commit()

        return {
            "status": "success",
            "payment_id": pmt.id,
            "payment_reference": ref,
            "amount": float(payment_amt),
            "allocated_to_invoice": allocated_to_inv
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Payment processing failed, transaction rolled back: {str(e)}")

@router.post("/payments/{id}/refund")
def refund_payment(
    id: str,
    payload: Optional[Dict[str, Any]] = None,
    current_user: User = Depends(require_role(["Admin"])),
    db: Session = Depends(get_db)
):
    reason = (payload.get("reason") if payload else None) or "Commercial refund or disputed charge reversal"
    pmt = db.query(Payment).filter(Payment.id == id).first()
    if not pmt:
        raise HTTPException(status_code=404, detail="Payment not found")
    if pmt.status == "Refunded":
        raise HTTPException(status_code=400, detail="Payment has already been refunded")

    try:
        # Revert allocations
        for alloc in pmt.allocations:
            inv = alloc.invoice
            if inv:
                inv.paid_amount -= alloc.allocated_amount
                inv.balance_due += alloc.allocated_amount
                if inv.balance_due >= inv.total_amount:
                    inv.status = "Issued"
                else:
                    inv.status = "Partial"
            db.delete(alloc)

        pmt.status = "Refunded"
        pmt.unallocated_amount = pmt.amount
        pmt.allocated_amount = Decimal("0.00")

        log = AuditLog(
            action="REFUND_PAYMENT",
            entity_type="Payment",
            entity_id=pmt.id,
            details=f"Refunded payment {pmt.payment_reference} (₹{pmt.amount:,.2f}). Reason: {reason}",
            user_id=current_user.id,
            created_at=datetime.utcnow()
        )
        db.add(log)
        db.commit()

        return {
            "status": "success",
            "payment_reference": pmt.payment_reference,
            "refunded_amount": float(pmt.amount),
            "message": f"Payment {pmt.payment_reference} refunded and invoice balances restored."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Refund failed, safely rolled back: {str(e)}")

@router.get("/credits")
def list_credit_adjustments(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    total = db.query(CreditAdjustment).count()
    adjs = (
        db.query(CreditAdjustment)
        .order_by(CreditAdjustment.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    items = []
    for adj in adjs:
        cust = db.query(Customer).filter(Customer.id == adj.customer_id).first()
        inv = db.query(Invoice).filter(Invoice.id == adj.invoice_id).first() if adj.invoice_id else None
        items.append({
            "id": adj.id,
            "customer_id": adj.customer_id,
            "customer_name": cust.name if cust else "Unknown",
            "invoice_id": adj.invoice_id,
            "invoice_number": inv.invoice_number if inv else "—",
            "amount": float(adj.amount),
            "reason": adj.reason,
            "authorized_by": adj.authorized_by,
            "status": adj.status,
            "created_at": adj.created_at.isoformat()
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": items
    }

@router.post("/credits")
def create_credit_adjustment(
    payload: CreditAdjustmentCreate,
    current_user: User = Depends(require_role(["Admin", "Analyst"])),
    db: Session = Depends(get_db)
):
    cust = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    credit_amt = quantize_money(Decimal(str(payload.amount)))

    adj = CreditAdjustment(
        id=str(uuid.uuid4()),
        customer_id=cust.id,
        invoice_id=payload.invoice_id,
        amount=credit_amt,
        reason=payload.reason,
        authorized_by=current_user.full_name or "Revenue Operations",
        status="Applied"
    )
    db.add(adj)

    # Deduct from invoice balance if specified
    if payload.invoice_id:
        inv = db.query(Invoice).filter(Invoice.id == payload.invoice_id).first()
        if inv:
            inv.balance_due = max(Decimal("0.00"), Decimal(str(inv.balance_due)) - credit_amt)
            if inv.balance_due <= Decimal("0.00"):
                inv.status = "Paid"

    log = AuditLog(
        action="CREATE_CREDIT_ADJUSTMENT",
        entity_type="CreditAdjustment",
        entity_id=adj.id,
        details=f"Credit adjustment of ₹{credit_amt:,.2f} applied to {cust.name}: {payload.reason}",
        user_id=current_user.id,
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {"status": "success", "credit_id": adj.id, "amount": float(credit_amt)}

@router.get("/ageing", response_model=AgeingAnalysis)
def get_ageing_analysis(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).filter(Invoice.balance_due > Decimal("0.00"), Invoice.status != "Cancelled").all()
    today = date.today()

    current = Decimal("0.00")
    b_1_30 = Decimal("0.00")
    b_31_60 = Decimal("0.00")
    b_61_90 = Decimal("0.00")
    b_over_90 = Decimal("0.00")

    for inv in invoices:
        due = inv.due_date
        bal = Decimal(str(inv.balance_due))
        if due >= today:
            current += bal
        else:
            days_overdue = (today - due).days
            if days_overdue <= 30:
                b_1_30 += bal
            elif days_overdue <= 60:
                b_31_60 += bal
            elif days_overdue <= 90:
                b_61_90 += bal
            else:
                b_over_90 += bal

    total = current + b_1_30 + b_31_60 + b_61_90 + b_over_90

    return {
        "current": float(current),
        "days_1_30": float(b_1_30),
        "days_31_60": float(b_31_60),
        "days_61_90": float(b_61_90),
        "days_over_90": float(b_over_90),
        "total_outstanding": float(total)
    }

class BillingCorrectionRequest(BaseModel):
    customer_id: str
    amount: float
    description: str = "Supplementary Invoice for Billing Correction"
    reason: str
    exception_id: Optional[str] = None
    original_invoice_id: Optional[str] = None
    period_start: Optional[date] = date(2026, 10, 1)
    period_end: Optional[date] = date(2026, 10, 31)

@router.post("/corrections")
def create_billing_correction(
    payload: BillingCorrectionRequest,
    current_user: User = Depends(require_role(["Admin", "Analyst"])),
    db: Session = Depends(get_db)
):
    cust = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    corr_amt = quantize_money(Decimal(str(payload.amount)))
    if corr_amt <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Correction amount must be positive")

    orig_inv = None
    if payload.original_invoice_id:
        orig_inv = db.query(Invoice).filter(Invoice.id == payload.original_invoice_id).first()

    # Generate supplementary invoice
    inv_count = db.query(Invoice).count()
    inv_num = f"INV-CORR-{inv_count + 1:04d}"
    
    tax_amt = quantize_money(corr_amt * Decimal("0.18"))
    tot_amt = corr_amt + tax_amt

    new_inv = Invoice(
        id=str(uuid.uuid4()),
        invoice_number=inv_num,
        customer_id=cust.id,
        billing_period_start=payload.period_start or date(2026, 10, 1),
        billing_period_end=payload.period_end or date(2026, 10, 31),
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        subtotal=corr_amt,
        tax_amount=tax_amt,
        total_amount=tot_amt,
        paid_amount=Decimal("0.00"),
        balance_due=tot_amt,
        status="Unpaid"
    )
    db.add(new_inv)
    db.flush()

    line = InvoiceLine(
        id=str(uuid.uuid4()),
        invoice_id=new_inv.id,
        description=payload.description,
        line_type="Adjustment",
        quantity=Decimal("1.00"),
        unit_price=corr_amt,
        line_total=corr_amt
    )
    db.add(line)

    # If exception_id is linked, update exception to Resolved
    resolved_exc = None
    if payload.exception_id:
        exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == payload.exception_id).first()
        if exc:
            exc.status = "Resolved"
            exc.resolved_reason = f"Billing correction invoice {inv_num} issued for ₹{corr_amt:,.2f}"
            exc.resolved_by_id = current_user.id
            exc.resolved_at = datetime.utcnow()
            resolved_exc = exc.id

    log = AuditLog(
        action="BILLING_CORRECTION",
        entity_type="Invoice",
        entity_id=new_inv.id,
        details=f"Created billing correction invoice {inv_num} for ₹{corr_amt:,.2f}. Reason: {payload.reason}",
        user_id=current_user.id,
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {
        "status": "success",
        "correction_invoice_id": new_inv.id,
        "invoice_number": inv_num,
        "amount": float(corr_amt),
        "tax": float(tax_amt),
        "total": float(tot_amt),
        "resolved_exception_id": resolved_exc,
        "message": f"Correction invoice {inv_num} created and posted to customer ledger."
    }
