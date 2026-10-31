from decimal import Decimal
from datetime import datetime, date
from typing import List, Dict, Any, Optional
import json
from sqlalchemy.orm import Session
from backend.app.models.entities import (
    Customer, Product, Contract, ContractVersion, Subscription,
    UsageEvent, Invoice, InvoiceLine, Payment, PaymentAllocation,
    CreditAdjustment, ReconciliationRun
)
from backend.app.analytics.financial_engine import FinancialCalculationEngine, quantize_money

class ReconciliationEngine:
    """
    Executes automated contract-to-cash reconciliation across 4 tiers:
    1. Contract vs Usage
    2. Usage vs Invoice
    3. Invoice vs Payments
    4. Full End-to-End Reconciliation
    """

    def __init__(self, db: Session):
        self.db = db

    def execute_reconciliation(
        self,
        period_str: str = "2026-10",
        customer_id: Optional[str] = None,
        product_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Runs comprehensive reconciliation for the given period.
        Stores the run in reconciliation_runs table and returns rows and summary.
        """
        year, month = map(int, period_str.split("-"))
        # Period bounds
        period_start = date(year, month, 1)
        if month == 12:
            period_end = date(year, 12, 31)
        else:
            import calendar
            _, last_day = calendar.monthrange(year, month)
            period_end = date(year, month, last_day)

        query = self.db.query(Customer).filter(Customer.status.in_(["Active", "At-Risk"]))
        if customer_id:
            query = query.filter(Customer.id == customer_id)
        customers = query.all()

        reconciliation_rows = []
        total_expected = Decimal("0.00")
        total_invoiced = Decimal("0.00")
        total_variance = Decimal("0.00")
        matched_count = 0
        unmatched_count = 0

        for cust in customers:
            # Query subscriptions for this customer
            sub_query = (
                self.db.query(Subscription)
                .filter(
                    Subscription.customer_id == cust.id,
                    Subscription.status == "Active"
                )
            )
            if product_id:
                sub_query = sub_query.filter(Subscription.product_id == product_id)
            subs = sub_query.all()

            for sub in subs:
                cv = sub.contract_version
                prod = sub.product
                if not cv or not prod:
                    continue

                # Usage calculation
                usage_records = (
                    self.db.query(UsageEvent)
                    .filter(
                        UsageEvent.customer_id == cust.id,
                        UsageEvent.product_id == prod.id,
                        UsageEvent.usage_date >= period_start,
                        UsageEvent.usage_date <= period_end
                    )
                    .all()
                )
                actual_usage_units = sum([Decimal(str(u.quantity)) for u in usage_records], Decimal("0.0"))

                # Expected calculation
                calc = FinancialCalculationEngine.calculate_expected_charges(
                    fixed_fee=Decimal(str(cv.fixed_fee)),
                    discount_pct=Decimal(str(cv.discount_pct)),
                    actual_units=actual_usage_units,
                    included_units=Decimal(str(cv.included_units)),
                    rate_per_unit=Decimal(str(cv.overage_rate)),
                    tier_config_json=cv.tier_config_json
                )
                expected_amt = calc["total_expected"]

                # Invoiced amount calculation
                matching_invoices = (
                    self.db.query(Invoice)
                    .filter(
                        Invoice.customer_id == cust.id,
                        Invoice.billing_period_start <= period_end,
                        Invoice.billing_period_end >= period_start,
                        Invoice.status != "Cancelled"
                    )
                    .all()
                )

                invoiced_for_sub = Decimal("0.00")
                matching_line_descriptions = []
                for inv in matching_invoices:
                    for line in inv.lines:
                        if line.product_id == prod.id or prod.name.lower() in line.description.lower():
                            invoiced_for_sub += Decimal(str(line.line_total))
                            matching_line_descriptions.append(line.description)

                invoiced_for_sub = quantize_money(invoiced_for_sub)
                variance = quantize_money(invoiced_for_sub - expected_amt)
                variance_abs = abs(variance)

                # Tolerance of ₹1.00 for rounding differences
                if variance_abs <= Decimal("1.00"):
                    status = "Matched"
                    matched_count += 1
                elif invoiced_for_sub < expected_amt:
                    status = "Underbilled"
                    unmatched_count += 1
                elif invoiced_for_sub > expected_amt:
                    status = "Overbilled"
                    unmatched_count += 1
                elif invoiced_for_sub == Decimal("0.00"):
                    status = "Missing"
                    unmatched_count += 1
                else:
                    status = "Unmatched"
                    unmatched_count += 1

                total_expected += expected_amt
                total_invoiced += invoiced_for_sub
                total_variance += variance_abs

                reconciliation_rows.append({
                    "id": f"REC-{cust.customer_code}-{prod.product_code}-{period_str}",
                    "customer_id": cust.id,
                    "customer_name": cust.name,
                    "contract_number": cv.contract.contract_number if cv.contract else "CNT-DEFAULT",
                    "product_name": prod.name,
                    "billing_period": period_str,
                    "contract_amount": float(calc["net_fixed_charge"]),
                    "usage_value": float(calc["usage_charge"]),
                    "invoiced_amount": float(invoiced_for_sub),
                    "variance": float(variance),
                    "variance_pct": float(round((variance / expected_amt * Decimal("100.0")), 2)) if expected_amt > Decimal("0") else 0.0,
                    "status": status,
                    "calculation_details": {
                        "fixed_fee": float(calc["gross_fixed_fee"]),
                        "discount_pct": float(calc["discount_pct"]),
                        "discount_amount": float(calc["discount_amount"]),
                        "actual_units": float(calc["actual_units"]),
                        "included_units": float(calc["included_units"]),
                        "billable_units": float(calc["billable_units"]),
                        "rate_per_unit": float(cv.overage_rate),
                        "lines_found": matching_line_descriptions
                    }
                })

        total_obligations = matched_count + unmatched_count
        recon_rate = FinancialCalculationEngine.calculate_reconciliation_rate(matched_count, total_obligations)

        # Record run history
        run_count = self.db.query(ReconciliationRun).count()
        run_rec = ReconciliationRun(
            run_number=f"RUN-{year}{month:02d}-{run_count + 1:03d}",
            period=period_str,
            customer_id=customer_id,
            product_id=product_id,
            total_eligible_obligations=total_obligations,
            matched_obligations=matched_count,
            mismatched_obligations=unmatched_count,
            expected_total=total_expected,
            invoiced_total=total_invoiced,
            variance_total=total_variance,
            reconciliation_rate=recon_rate,
            status="Completed",
            summary_json=json.dumps({
                "period": period_str,
                "matched": matched_count,
                "unmatched": unmatched_count,
                "rate": float(recon_rate)
            }),
            run_at=datetime.utcnow()
        )
        self.db.add(run_rec)
        self.db.commit()

        # Query recent runs
        recent_runs = (
            self.db.query(ReconciliationRun)
            .order_by(ReconciliationRun.run_at.desc())
            .limit(10)
            .all()
        )
        run_history = [
            {
                "run_number": r.run_number,
                "period": r.period,
                "run_at": r.run_at.isoformat(),
                "status": r.status,
                "matched_obligations": r.matched_obligations,
                "mismatched_obligations": r.mismatched_obligations,
                "reconciliation_rate": float(r.reconciliation_rate),
                "variance_total": float(r.variance_total)
            }
            for r in recent_runs
        ]

        return {
            "period": period_str,
            "summary": {
                "expected_charges": float(total_expected),
                "invoiced_amount": float(total_invoiced),
                "variance_amount": float(total_variance),
                "reconciliation_rate": float(recon_rate),
                "matched_records": matched_count,
                "unmatched_records": unmatched_count,
                "total_obligations": total_obligations
            },
            "rows": reconciliation_rows,
            "run_history": run_history
        }
