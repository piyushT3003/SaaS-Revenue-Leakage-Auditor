from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional, List
import uuid
from backend.app.core.database import get_db
from backend.app.models.entities import (
    Invoice, InvoiceLine, Payment, PaymentAllocation, CreditAdjustment,
    Customer, Product, AuditLog
)
from backend.app.schemas.api_schemas import (
    InvoiceListItem, InvoiceDetail, DraftInvoiceCreate,
    PaymentRecordRequest, CreditAdjustmentCreate, AgeingAnalysis
)
from backend.app.analytics.financial_engine import FinancialCalculationEngine, quantize_money
from backend.app.exports.exporter import ExportService

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
def create_draft_invoice(payload: DraftInvoiceCreate, db: Session = Depends(get_db)):
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
def record_payment(payload: PaymentRecordRequest, db: Session = Depends(get_db)):
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

    # Allocate to specific invoice if provided
    allocated_to_inv = False
    if payload.invoice_id:
        inv = db.query(Invoice).filter(Invoice.id == payload.invoice_id).first()
        if inv and inv.balance_due > Decimal("0.00"):
            alloc_amt = min(payment_amt, Decimal(str(inv.balance_due)))
            alloc = PaymentAllocation(
                id=str(uuid.uuid4()),
                payment_id=pmt_id,
                invoice_id=inv.id,
                allocated_amount=alloc_amt,
                allocated_at=datetime.utcnow()
            )
            db.add(alloc)

            pmt.allocated_amount = alloc_amt
            pmt.unallocated_amount = payment_amt - alloc_amt

            inv.paid_amount += alloc_amt
            inv.balance_due -= alloc_amt
            if inv.balance_due <= Decimal("0.00"):
                inv.status = "Paid"
            else:
                inv.status = "Partial"
            allocated_to_inv = True

    log = AuditLog(
        action="RECORD_PAYMENT",
        entity_type="Payment",
        entity_id=pmt.id,
        details=f"Recorded payment {ref} for {cust.name} (₹{payment_amt:,.2f})",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return {
        "status": "success",
        "payment_reference": ref,
        "amount": float(payment_amt),
        "allocated_to_invoice": allocated_to_inv
    }

@router.post("/credits")
def create_credit_adjustment(payload: CreditAdjustmentCreate, db: Session = Depends(get_db)):
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
        authorized_by="Revenue Operations",
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
