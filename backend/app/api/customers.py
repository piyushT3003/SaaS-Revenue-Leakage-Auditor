from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import Optional, List
from backend.app.core.database import get_db
from backend.app.models.entities import (
    Customer, Contract, ContractVersion, Subscription, UsageEvent,
    Invoice, Payment, ExceptionRecord, ProductCost
)
from backend.app.schemas.api_schemas import CustomerListItem, CustomerDetail
from backend.app.exports.exporter import ExportService

router = APIRouter()

@router.get("")
def list_customers(
    search: Optional[str] = Query(None),
    segment: Optional[str] = Query(None),
    plan_tier: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    query = db.query(Customer)

    if search:
        search_filter = f"%{search}%"
        query = query.filter((Customer.name.ilike(search_filter)) | (Customer.customer_code.ilike(search_filter)))
    if segment and segment != "All":
        query = query.filter(Customer.segment == segment)
    if plan_tier and plan_tier != "All":
        query = query.filter(Customer.plan_tier == plan_tier)
    if status and status != "All":
        query = query.filter(Customer.status == status)

    total_count = query.count()
    customers = query.order_by(Customer.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    # Pre-aggregate metrics
    items = []
    for c in customers:
        subs = [s for s in c.subscriptions if s.status == "Active"]
        mrr = sum(float(s.mrr) for s in subs)
        open_excs = sum(1 for e in c.exceptions if e.status in ["Open", "In Progress"])
        outstanding = sum(float(i.balance_due) for i in c.invoices if i.status != "Cancelled")

        items.append({
            "id": c.id,
            "customer_code": c.customer_code,
            "name": c.name,
            "segment": c.segment,
            "plan_tier": c.plan_tier,
            "status": c.status,
            "mrr": mrr,
            "annual_revenue": mrr * 12.0,
            "health_score": float(c.health_score),
            "health_status": c.health_status,
            "active_subscriptions": len(subs),
            "open_exceptions_count": open_excs,
            "outstanding_balance": outstanding
        })

    # Summary cards
    all_custs = db.query(Customer).all()
    total_custs = len(all_custs)
    new_custs = sum(1 for c in all_custs if c.created_at.year == 2026 and c.created_at.month >= 8)
    at_risk = sum(1 for c in all_custs if c.status == "At-Risk" or c.health_score < 65)
    expansion = sum(1 for c in all_custs if c.health_score >= 90 and c.segment in ["Enterprise", "Mid-Market"])

    return {
        "summary": {
            "total_customers": total_custs,
            "new_customers": new_custs,
            "at_risk_customers": at_risk,
            "expansion_opportunities": expansion
        },
        "total": total_count,
        "page": page,
        "limit": limit,
        "items": items
    }

@router.get("/{id}")
def get_customer_360_profile(id: str, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.id == id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")

    subs = [s for s in c.subscriptions if s.status == "Active"]
    mrr = sum(float(s.mrr) for s in subs)
    open_excs = sum(1 for e in c.exceptions if e.status in ["Open", "In Progress"])
    outstanding = sum(float(i.balance_due) for i in c.invoices if i.status != "Cancelled")

    cust_summary = {
        "id": c.id,
        "customer_code": c.customer_code,
        "name": c.name,
        "domain": c.domain,
        "segment": c.segment,
        "plan_tier": c.plan_tier,
        "status": c.status,
        "billing_currency": c.billing_currency,
        "payment_terms_days": c.payment_terms_days,
        "health_score": float(c.health_score),
        "health_status": c.health_status,
        "mrr": mrr,
        "annual_revenue": mrr * 12.0,
        "active_subscriptions": len(subs),
        "open_exceptions_count": open_excs,
        "outstanding_balance": outstanding
    }

    contracts = [
        {
            "id": cnt.id,
            "contract_number": cnt.contract_number,
            "start_date": str(cnt.start_date),
            "end_date": str(cnt.end_date),
            "status": cnt.status,
            "versions": [
                {
                    "version_number": v.version_number,
                    "effective_from": str(v.effective_from),
                    "effective_to": str(v.effective_to),
                    "fixed_fee": float(v.fixed_fee),
                    "included_units": v.included_units,
                    "overage_rate": float(v.overage_rate),
                    "discount_pct": float(v.discount_pct),
                    "is_current": v.is_current
                }
                for v in cnt.versions
            ]
        }
        for cnt in c.contracts
    ]

    subscriptions = [
        {
            "id": s.id,
            "product_name": s.product.name,
            "category": s.product.category,
            "billing_cycle": s.billing_cycle,
            "mrr": float(s.mrr),
            "start_date": str(s.start_date),
            "status": s.status
        }
        for s in c.subscriptions
    ]

    invoices = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "period": f"{inv.billing_period_start} - {inv.billing_period_end}",
            "issue_date": str(inv.issue_date),
            "total_amount": float(inv.total_amount),
            "paid_amount": float(inv.paid_amount),
            "balance_due": float(inv.balance_due),
            "status": inv.status
        }
        for inv in sorted(c.invoices, key=lambda x: x.issue_date, reverse=True)[:12]
    ]

    payments = [
        {
            "id": p.id,
            "payment_reference": p.payment_reference,
            "payment_date": str(p.payment_date),
            "amount": float(p.amount),
            "method": p.payment_method,
            "status": p.status
        }
        for p in sorted(c.payments, key=lambda x: x.payment_date, reverse=True)[:12]
    ]

    exceptions = [
        {
            "id": e.id,
            "exception_code": e.exception_code,
            "issue_type": e.issue_type,
            "severity": e.severity,
            "financial_impact": float(e.financial_impact),
            "status": e.status,
            "description": e.description,
            "detected_at": e.detected_at.isoformat()
        }
        for e in c.exceptions
    ]

    # Unit economics for this customer
    costs = db.query(ProductCost).filter(ProductCost.customer_id == c.id, ProductCost.period == "2026-10").all()
    direct_cost = sum(float(cost.total_direct_cost) for cost in costs) if costs else (mrr * 0.4)
    rev = mrr
    contribution = rev - direct_cost
    margin_pct = (contribution / rev * 100.0) if rev > 0 else 0.0

    return {
        "customer": cust_summary,
        "contracts": contracts,
        "subscriptions": subscriptions,
        "usage_trends": [
            {"month": "May", "units": 120},
            {"month": "Jun", "units": 145},
            {"month": "Jul", "units": 160},
            {"month": "Aug", "units": 190},
            {"month": "Sep", "units": 210},
            {"month": "Oct", "units": 240}
        ],
        "invoices": invoices,
        "payments": payments,
        "exceptions": exceptions,
        "unit_economics": {
            "period": "October 2026",
            "monthly_revenue": rev,
            "direct_costs": direct_cost,
            "contribution": contribution,
            "margin_pct": round(margin_pct, 1)
        }
    }

@router.get("/export")
def export_customers(format: str = Query("csv", pattern="^(csv|xlsx)$"), db: Session = Depends(get_db)):
    customers = db.query(Customer).order_by(Customer.name.asc()).all()
    headers = ["Customer Code", "Customer Name", "Segment", "Plan Tier", "Status", "Health Score", "Health Status", "Payment Terms"]
    rows = [
        [c.customer_code, c.name, c.segment, c.plan_tier, c.status, float(c.health_score), c.health_status, f"Net {c.payment_terms_days}"]
        for c in customers
    ]

    if format == "csv":
        csv_file = ExportService.generate_csv(headers, rows)
        return Response(
            content=csv_file.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=Customer_Directory.csv"}
        )
    else:
        xlsx_file = ExportService.generate_xlsx("Customers", headers, rows, title="Customer Intelligence Directory")
        return Response(
            content=xlsx_file.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Customer_Directory.xlsx"}
        )
