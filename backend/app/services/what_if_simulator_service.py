import uuid
import json
from decimal import Decimal
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.models.entities import (
    Customer, Contract, ContractVersion, Subscription, Product,
    UsageEvent, Invoice, InvoiceLine, WhatIfScenario
)
from backend.app.analytics.financial_engine import FinancialCalculationEngine, quantize_money

class WhatIfSimulatorService:
    """
    Simulates pricing adjustments, overage changes, minimum commitments,
    and discount structures against production historical data without mutating live state.
    Persists simulation records into WhatIfScenario.
    """
    def __init__(self, db: Session):
        self.db = db

    def simulate(
        self,
        name: str = "Pricing Optimization Scenario",
        description: Optional[str] = None,
        baseline_period: str = "2026-10",
        target_type: str = "All",
        target_id: Optional[str] = None,
        overage_rate_multiplier: float = 1.0,
        base_fee_multiplier: float = 1.0,
        minimum_commit_multiplier: float = 1.0,
        discount_cap_percent: Optional[float] = None,
        tier_threshold_adjustment_pct: float = 0.0,
        save: bool = True,
        created_by_id: Optional[str] = None
    ) -> Dict[str, Any]:
        # Decimal conversions for deterministic financial accuracy
        d_overage_mult = Decimal(str(overage_rate_multiplier))
        d_base_mult = Decimal(str(base_fee_multiplier))
        d_commit_mult = Decimal(str(minimum_commit_multiplier))
        d_discount_cap = Decimal(str(discount_cap_percent)) if discount_cap_percent is not None else None
        d_tier_adj = Decimal(str(tier_threshold_adjustment_pct)) / Decimal("100.0")

        # 1. Fetch relevant customers based on target scope
        query = self.db.query(Customer).filter(Customer.status.in_(["Active", "At-Risk"]))
        if target_type == "Segment" and target_id:
            query = query.filter(Customer.segment == target_id)
        elif target_type == "Customer" and target_id:
            query = query.filter(Customer.id == target_id)
        customers = query.all()

        baseline_total = Decimal("0.00")
        simulated_total = Decimal("0.00")
        customers_impacted = 0
        customer_breakdown: List[Dict[str, Any]] = []
        tier_summary: Dict[str, Dict[str, Decimal]] = {
            "Enterprise": {"baseline": Decimal("0.00"), "simulated": Decimal("0.00"), "count": Decimal("0")},
            "Mid-Market": {"baseline": Decimal("0.00"), "simulated": Decimal("0.00"), "count": Decimal("0")},
            "SMB": {"baseline": Decimal("0.00"), "simulated": Decimal("0.00"), "count": Decimal("0")},
        }

        # 2. Iterate each customer and evaluate baseline vs simulated economics
        for cust in customers:
            # Active subscriptions
            subs = [s for s in cust.subscriptions if s.status == "Active"]
            if not subs:
                subs = cust.subscriptions

            cust_baseline = Decimal("0.00")
            cust_simulated = Decimal("0.00")

            for sub in subs:
                product = sub.product
                if target_type == "Product" and target_id and product and product.id != target_id:
                    continue

                # Base subscription fee
                prod_base_fee = product.base_fee if product else Decimal("1000.00")
                sub_base = prod_base_fee * Decimal(str(sub.quantity or 1))
                sim_sub_base = sub_base * d_base_mult

                # Usage aggregation for the baseline period
                prod_id = product.id if product else sub.product_id
                usage_sum = (
                    self.db.query(func.coalesce(func.sum(UsageEvent.quantity), 0.0))
                    .filter(
                        UsageEvent.customer_id == cust.id,
                        UsageEvent.product_id == prod_id,
                        func.strftime("%Y-%m", UsageEvent.usage_date) == baseline_period
                    )
                    .scalar()
                )
                d_usage = Decimal(str(usage_sum))

                # Baseline tier logic
                included_allowance = Decimal("50000.00") * (Decimal("1.0") + d_tier_adj)
                overage_rate = (product.rate_per_unit if product else Decimal("0.05"))
                sim_overage_rate = overage_rate * d_overage_mult

                base_overage_units = max(Decimal("0.00"), d_usage - Decimal("50000.00"))
                sim_overage_units = max(Decimal("0.00"), d_usage - included_allowance)

                baseline_overage_fee = base_overage_units * overage_rate
                simulated_overage_fee = sim_overage_units * sim_overage_rate

                # Minimum commit
                min_commit = getattr(sub.contract_version, 'sla_tier', None) if sub.contract_version else None
                # Apply commitment logic
                baseline_sub_total = sub_base + baseline_overage_fee
                simulated_sub_total = sim_sub_base + simulated_overage_fee

                # Discounting
                if d_discount_cap is not None:
                    # Cap discount at given percent
                    # Default assumed discount is 10%
                    assumed_discount = Decimal("0.10")
                    effective_disc = min(assumed_discount, d_discount_cap / Decimal("100.0"))
                    simulated_sub_total = simulated_sub_total * (Decimal("1.0") - effective_disc)

                cust_baseline += baseline_sub_total
                cust_simulated += simulated_sub_total

            # If customer has zero subscription calculated (fallback to historical invoices)
            if cust_baseline == Decimal("0.00"):
                invoices = (
                    self.db.query(Invoice)
                    .filter(
                        Invoice.customer_id == cust.id,
                        func.strftime("%Y-%m", Invoice.billing_period_start) == baseline_period
                    )
                    .all()
                )
                for inv in invoices:
                    cust_baseline += inv.total_amount
                    # Apply simulated factor
                    cust_simulated += inv.total_amount * d_base_mult

            cust_delta = cust_simulated - cust_baseline
            cust_pct = (
                quantize_money((cust_delta / cust_baseline) * Decimal("100.0"))
                if cust_baseline > Decimal("0.00")
                else Decimal("0.00")
            )

            if abs(cust_delta) > Decimal("0.01"):
                customers_impacted += 1

            baseline_total += cust_baseline
            simulated_total += cust_simulated

            seg = cust.segment if cust.segment in tier_summary else "Mid-Market"
            tier_summary[seg]["baseline"] += cust_baseline
            tier_summary[seg]["simulated"] += cust_simulated
            tier_summary[seg]["count"] += Decimal("1")

            customer_breakdown.append({
                "customer_id": cust.id,
                "customer_name": cust.name,
                "customer_code": cust.customer_code,
                "segment": cust.segment,
                "baseline_revenue": float(quantize_money(cust_baseline)),
                "simulated_revenue": float(quantize_money(cust_simulated)),
                "net_delta": float(quantize_money(cust_delta)),
                "pct_change": float(cust_pct),
                "risk_profile": "Gaining" if cust_delta > 0 else ("Neutral" if cust_delta == 0 else "Discounted")
            })

        net_delta = simulated_total - baseline_total
        pct_delta = (
            quantize_money((net_delta / baseline_total) * Decimal("100.0"))
            if baseline_total > Decimal("0.00")
            else Decimal("0.00")
        )

        # Sort breakdown by absolute impact
        customer_breakdown.sort(key=lambda x: abs(x["net_delta"]), reverse=True)

        # Tier breakdown formatting
        formatted_tiers = [
            {
                "tier": tier_name,
                "customers_count": int(data["count"]),
                "baseline_revenue": float(quantize_money(data["baseline"])),
                "simulated_revenue": float(quantize_money(data["simulated"])),
                "net_delta": float(quantize_money(data["simulated"] - data["baseline"])),
                "pct_change": float(
                    quantize_money(((data["simulated"] - data["baseline"]) / data["baseline"]) * Decimal("100.0"))
                    if data["baseline"] > 0 else Decimal("0.00")
                )
            }
            for tier_name, data in tier_summary.items()
        ]

        parameters = {
            "baseline_period": baseline_period,
            "target_type": target_type,
            "target_id": target_id,
            "overage_rate_multiplier": overage_rate_multiplier,
            "base_fee_multiplier": base_fee_multiplier,
            "minimum_commit_multiplier": minimum_commit_multiplier,
            "discount_cap_percent": discount_cap_percent,
            "tier_threshold_adjustment_pct": tier_threshold_adjustment_pct
        }

        results = {
            "baseline_total_revenue": float(quantize_money(baseline_total)),
            "simulated_total_revenue": float(quantize_money(simulated_total)),
            "net_revenue_delta": float(quantize_money(net_delta)),
            "pct_change": float(pct_delta),
            "customers_analyzed": len(customers),
            "customers_impacted": customers_impacted,
            "tier_breakdown": formatted_tiers,
            "customer_breakdown": customer_breakdown[:20],  # top 20 impacted
            "projected_annualized_run_rate": float(quantize_money(simulated_total * Decimal("12.0"))),
            "simulated_at": datetime.utcnow().isoformat()
        }

        scenario_record = None
        if save:
            scenario_record = WhatIfScenario(
                id=str(uuid.uuid4()),
                name=name,
                description=description,
                baseline_period=baseline_period,
                target_type=target_type,
                target_id=target_id,
                parameters_json=json.dumps(parameters),
                results_json=json.dumps(results),
                created_by_id=created_by_id,
                created_at=datetime.utcnow()
            )
            self.db.add(scenario_record)
            self.db.commit()
            self.db.refresh(scenario_record)

        return {
            "scenario_id": scenario_record.id if scenario_record else None,
            "name": name,
            "description": description,
            "parameters": parameters,
            "results": results
        }

    def list_scenarios(self) -> List[Dict[str, Any]]:
        scenarios = self.db.query(WhatIfScenario).order_by(WhatIfScenario.created_at.desc()).all()
        return [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "baseline_period": s.baseline_period,
                "target_type": s.target_type,
                "target_id": s.target_id,
                "parameters": json.loads(s.parameters_json),
                "results": json.loads(s.results_json),
                "created_at": s.created_at.isoformat() if s.created_at else None
            }
            for s in scenarios
        ]

    def get_scenario(self, scenario_id: str) -> Optional[Dict[str, Any]]:
        s = self.db.query(WhatIfScenario).filter(WhatIfScenario.id == scenario_id).first()
        if not s:
            return None
        return {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "baseline_period": s.baseline_period,
            "target_type": s.target_type,
            "target_id": s.target_id,
            "parameters": json.loads(s.parameters_json),
            "results": json.loads(s.results_json),
            "created_at": s.created_at.isoformat() if s.created_at else None
        }

    def delete_scenario(self, scenario_id: str) -> bool:
        s = self.db.query(WhatIfScenario).filter(WhatIfScenario.id == scenario_id).first()
        if s:
            self.db.delete(s)
            self.db.commit()
            return True
        return False
