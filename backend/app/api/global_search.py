from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.entities import Customer, Contract, Invoice, ExceptionRecord

router = APIRouter()

@router.get("")
def global_search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    term = f"%{q}%"
    results = []

    # 1. Search Customers
    customers = (
        db.query(Customer)
        .filter((Customer.name.ilike(term)) | (Customer.customer_code.ilike(term)))
        .limit(5)
        .all()
    )
    for c in customers:
        results.append({
            "category": "Customer",
            "id": c.id,
            "title": c.name,
            "subtitle": f"{c.customer_code} • {c.segment} • Health: {c.health_score}%",
            "route": f"/customers/{c.id}"
        })

    # 2. Search Invoices
    invoices = (
        db.query(Invoice)
        .filter(Invoice.invoice_number.ilike(term))
        .limit(5)
        .all()
    )
    for inv in invoices:
        results.append({
            "category": "Invoice",
            "id": inv.id,
            "title": inv.invoice_number,
            "subtitle": f"{inv.customer.name} • ₹{float(inv.total_amount):,.2f} • {inv.status}",
            "route": f"/billing?invoice={inv.id}"
        })

    # 3. Search Contracts
    contracts = (
        db.query(Contract)
        .filter(Contract.contract_number.ilike(term))
        .limit(5)
        .all()
    )
    for cnt in contracts:
        results.append({
            "category": "Contract",
            "id": cnt.id,
            "title": cnt.contract_number,
            "subtitle": f"{cnt.customer.name} • {cnt.status}",
            "route": f"/customers/{cnt.customer_id}?tab=contracts"
        })

    # 4. Search Exceptions
    exceptions = (
        db.query(ExceptionRecord)
        .filter(
            (ExceptionRecord.exception_code.ilike(term)) |
            (ExceptionRecord.description.ilike(term))
        )
        .limit(5)
        .all()
    )
    for e in exceptions:
        results.append({
            "category": "Exception",
            "id": e.id,
            "title": f"{e.exception_code}: {e.issue_type}",
            "subtitle": f"{e.customer.name} • ₹{float(e.financial_impact):,.2f} • {e.status}",
            "route": f"/exceptions?id={e.id}"
        })

    return {"query": q, "total_results": len(results), "results": results}
