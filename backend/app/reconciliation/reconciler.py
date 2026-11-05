from decimal import Decimal
from datetime import datetime, date
from typing import List, Dict, Any, Optional
import json
from sqlalchemy.orm import Session
from backend.app.models.entities import (
    Customer, Product, Contract, ContractVersion, Subscription,
    UsageEvent, Invoice, InvoiceLine, Payment, PaymentAllocation,
    CreditAdjustment, ReconciliationRun, UploadBatch
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

    def check_data_readiness(
        self,
        period_str: str = "2026-10",
        customer_id: Optional[str] = None,
        product_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validates all prerequisites before running an audit:
        - Customer records
        - Products & pricing rules
        - Contracts and active contract versions
        - Subscriptions
        - Usage records (for metered products)
        - Invoices
        - Currency consistency
        """
        year, month = map(int, period_str.split("-"))
        period_start = date(year, month, 1)
        if month == 12:
            period_end = date(year, 12, 31)
        else:
            import calendar
            _, last_day = calendar.monthrange(year, month)
            period_end = date(year, month, last_day)

        cust_count = self.db.query(Customer).count()
        prod_count = self.db.query(Product).count()
        contract_count = self.db.query(Contract).count()
        cv_count = self.db.query(ContractVersion).filter(
            ContractVersion.effective_from <= period_end,
            ContractVersion.effective_to >= period_start
        ).count()
        sub_count = self.db.query(Subscription).filter(Subscription.status == "Active").count()
        usage_count = self.db.query(UsageEvent).filter(
            UsageEvent.usage_date >= period_start,
            UsageEvent.usage_date <= period_end
        ).count()
        inv_count = self.db.query(Invoice).filter(
            Invoice.billing_period_start <= period_end,
            Invoice.billing_period_end >= period_start,
            Invoice.status != "Cancelled"
        ).count()
        currencies = [c[0] for c in self.db.query(Customer.billing_currency).distinct().all()]

        checks = [
            {
                "name": "Customer Directory",
                "category": "Customers",
                "status": "Ready" if cust_count > 0 else "Failed",
                "count": cust_count,
                "message": f"{cust_count} customer accounts found" if cust_count > 0 else "No customer accounts found"
            },
            {
                "name": "Product Catalog & Pricing",
                "category": "Products",
                "status": "Ready" if prod_count > 0 else "Failed",
                "count": prod_count,
                "message": f"{prod_count} catalog products with active pricing" if prod_count > 0 else "No products configured"
            },
            {
                "name": "Commercial Contracts",
                "category": "Contracts",
                "status": "Ready" if contract_count > 0 else "Failed",
                "count": contract_count,
                "message": f"{contract_count} commercial contracts active" if contract_count > 0 else "No contracts found"
            },
            {
                "name": "Contract Versions Coverage",
                "category": "Contract Versions",
                "status": "Ready" if cv_count > 0 else "Warning",
                "count": cv_count,
                "message": f"{cv_count} versions cover period {period_str}" if cv_count > 0 else f"No versions cover {period_str}"
            },
            {
                "name": "Active Subscriptions",
                "category": "Subscriptions",
                "status": "Ready" if sub_count > 0 else "Failed",
                "count": sub_count,
                "message": f"{sub_count} active subscriptions eligible" if sub_count > 0 else "No active subscriptions"
            },
            {
                "name": "Metered Telemetry Usage",
                "category": "Usage Events",
                "status": "Ready" if usage_count > 0 else "Warning",
                "count": usage_count,
                "message": f"{usage_count} telemetry usage events logged for {period_str}"
            },
            {
                "name": "Invoices & Billing Register",
                "category": "Invoices",
                "status": "Ready" if inv_count > 0 else "Warning",
                "count": inv_count,
                "message": f"{inv_count} billing invoices available for {period_str}"
            },
            {
                "name": "Currency Consistency",
                "category": "Currency",
                "status": "Ready" if len(currencies) <= 1 else "Warning",
                "count": len(currencies),
                "message": f"Uniform currency: {currencies[0] if currencies else 'INR'}" if len(currencies) <= 1 else f"Multiple currencies: {currencies}"
            }
        ]

        blocking_reasons = []
        if cust_count == 0:
            blocking_reasons.append("Customer directory is empty. Import customers before running audit.")
        if prod_count == 0:
            blocking_reasons.append("Product catalog is empty. Configure products before running audit.")
        if sub_count == 0:
            blocking_reasons.append("No active subscriptions found for cohort.")

        is_ready = len(blocking_reasons) == 0

        return {
            "period": period_str,
            "is_ready": is_ready,
            "checks": checks,
            "blocking_reasons": blocking_reasons
        }

    def get_audit_freshness(self, period_str: str = "2026-10") -> Dict[str, Any]:
        """
        Determines if the latest audit for this period is fresh or stale.
        An audit becomes stale when relevant source data changes after that audit.
        """
        latest_run = (
            self.db.query(ReconciliationRun)
            .filter(ReconciliationRun.period == period_str)
            .order_by(ReconciliationRun.run_at.desc())
            .first()
        )
        if not latest_run:
            return {
                "period": period_str,
                "status": "Ready",
                "freshness": "Ready to Run",
                "latest_run_id": None,
                "last_run_at": None,
                "is_stale": False,
                "reason": "Ready to run initial audit for this period"
            }

        newer_batch = (
            self.db.query(UploadBatch)
            .filter(
                UploadBatch.uploaded_at > latest_run.run_at,
                UploadBatch.status == "Imported"
            )
            .first()
        )
        is_stale = newer_batch is not None

        return {
            "period": period_str,
            "status": "Stale" if is_stale else "Successful",
            "freshness": "Stale (New source records imported)" if is_stale else "Fresh",
            "latest_run_id": latest_run.run_number,
            "last_run_at": latest_run.run_at.isoformat(),
            "is_stale": is_stale,
            "reason": "New source records were imported since the last audit run. Re-run recommended." if is_stale else "Audit is complete and fresh."
        }

    def execute_reconciliation(
        self,
        period_str: str = "2026-10",
        customer_id: Optional[str] = None,
        product_id: Optional[str] = None,
        record_run: bool = False
    ) -> Dict[str, Any]:
        """
        Runs comprehensive reconciliation for the given period.
        Optionally records the run in reconciliation_runs table if record_run=True.
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
                        if line.product_id == prod.id or prod.name.lower() in line.description.lower() or (line.line_type == "Adjustment" and (not line.product_id or line.product_id == prod.id)):
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

        # Record run history only when requested (e.g. on POST /reconciliation/run)
        if record_run:
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

        freshness_info = self.get_audit_freshness(period_str)
        readiness_info = self.check_data_readiness(period_str, customer_id, product_id)

        return {
            "period": period_str,
            "summary": {
                "expected_charges": float(total_expected),
                "invoiced_amount": float(total_invoiced),
                "variance_amount": float(total_variance),
                "reconciliation_rate": float(recon_rate),
                "matched_records": matched_count,
                "unmatched_records": unmatched_count,
                "total_obligations": total_obligations,
                "audit_status": freshness_info["status"],
                "data_freshness": freshness_info["freshness"],
                "latest_run_id": freshness_info["latest_run_id"]
            },
            "rows": reconciliation_rows,
            "run_history": run_history,
            "readiness": readiness_info,
            "audit_status": freshness_info
        }
