import uuid
import json
from decimal import Decimal
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.models.entities import (
    BillingRuleProposal, Customer, Subscription, Product, UsageEvent, Invoice, User
)
from backend.app.analytics.financial_engine import quantize_money

class BillingRulesLabService:
    """
    Simulates and regression-tests proposed pricing rules, commitment logic,
    and tier boundaries against production customer datasets before deployment.
    """
    def __init__(self, db: Session):
        self.db = db

    def create_and_test_proposal(
        self,
        title: str,
        description: Optional[str],
        test_period: str = "2026-10",
        proposed_rule: Optional[Dict[str, Any]] = None,
        submitted_by_id: Optional[str] = None
    ) -> Dict[str, Any]:
        proposal_code = f"RULE-{datetime.utcnow().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

        if not proposed_rule:
            proposed_rule = {
                "rule_name": "Tier 2 Volume Discount Adjustment",
                "tier_threshold_units": 60000,
                "overage_rate": 0.045,
                "base_fee_discount_pct": 5.0,
                "minimum_commit_enforced": True
            }

        baseline_rule = {
            "rule_name": "Standard Production Billing Rules",
            "tier_threshold_units": 50000,
            "overage_rate": 0.050,
            "base_fee_discount_pct": 0.0,
            "minimum_commit_enforced": True
        }

        # Query test customers
        customers = self.db.query(Customer).filter(Customer.status.in_(["Active", "At-Risk"])).all()

        tests_passed = 0
        tests_failed = 0
        tests_warning = 0
        net_financial_diff = Decimal("0.00")
        detailed_results: List[Dict[str, Any]] = []

        prop_tier_threshold = Decimal(str(proposed_rule.get("tier_threshold_units", 60000)))
        prop_overage_rate = Decimal(str(proposed_rule.get("overage_rate", 0.045)))
        prop_discount_pct = Decimal(str(proposed_rule.get("base_fee_discount_pct", 0.0))) / Decimal("100.0")

        base_tier_threshold = Decimal(str(baseline_rule.get("tier_threshold_units", 50000)))
        base_overage_rate = Decimal(str(baseline_rule.get("overage_rate", 0.050)))

        for cust in customers:
            try:
                # Query period usage
                usage_sum = (
                    self.db.query(func.coalesce(func.sum(UsageEvent.quantity), 0.0))
                    .filter(
                        UsageEvent.customer_id == cust.id,
                        func.strftime("%Y-%m", UsageEvent.timestamp) == test_period
                    )
                    .scalar()
                )
                d_usage = Decimal(str(usage_sum))

                # Query base fee from subscription
                active_sub = next((s for s in cust.subscriptions if s.status == "Active"), None)
                if not active_sub and cust.subscriptions:
                    active_sub = cust.subscriptions[0]

                base_fee = active_sub.product.base_fee if (active_sub and active_sub.product) else Decimal("1200.00")

                # Baseline calculation
                baseline_overage_units = max(Decimal("0.00"), d_usage - base_tier_threshold)
                baseline_charge = base_fee + (baseline_overage_units * base_overage_rate)

                # Proposed calculation
                prop_overage_units = max(Decimal("0.00"), d_usage - prop_tier_threshold)
                prop_base_fee = base_fee * (Decimal("1.0") - prop_discount_pct)
                prop_charge = prop_base_fee + (prop_overage_units * prop_overage_rate)

                diff = prop_charge - baseline_charge
                net_financial_diff += diff

                pct_diff = (
                    (diff / baseline_charge) * Decimal("100.0")
                    if baseline_charge > Decimal("0.00")
                    else Decimal("0.00")
                )

                # Assertion & validation logic
                if prop_charge < Decimal("0.00"):
                    test_status = "Failed"
                    tests_failed += 1
                    reason = "Negative invoice charge produced under proposed rules."
                elif abs(pct_diff) > Decimal("25.0"):
                    test_status = "Warning"
                    tests_warning += 1
                    reason = f"High variance ({float(pct_diff):+.1f}%). Exceeds volatility threshold."
                else:
                    test_status = "Passed"
                    tests_passed += 1
                    reason = f"Calculated cleanly within expected tolerance ({float(pct_diff):+.1f}%)."

                detailed_results.append({
                    "customer_id": cust.id,
                    "customer_name": cust.name,
                    "segment": cust.segment,
                    "usage_units": float(d_usage),
                    "baseline_charge": float(quantize_money(baseline_charge)),
                    "proposed_charge": float(quantize_money(prop_charge)),
                    "net_difference": float(quantize_money(diff)),
                    "pct_change": float(quantize_money(pct_diff)),
                    "status": test_status,
                    "reason": reason
                })

            except Exception as e:
                tests_failed += 1
                detailed_results.append({
                    "customer_id": cust.id,
                    "customer_name": cust.name,
                    "segment": cust.segment,
                    "usage_units": 0.0,
                    "baseline_charge": 0.0,
                    "proposed_charge": 0.0,
                    "net_difference": 0.0,
                    "pct_change": 0.0,
                    "status": "Failed",
                    "reason": f"Calculation exception: {str(e)}"
                })

        overall_status = "Tested"
        proposal = BillingRuleProposal(
            id=str(uuid.uuid4()),
            proposal_code=proposal_code,
            title=title,
            description=description,
            test_period=test_period,
            baseline_rule_json=json.dumps(baseline_rule),
            proposed_rule_json=json.dumps(proposed_rule),
            test_customers_count=len(customers),
            tests_passed=tests_passed,
            tests_failed=tests_failed,
            tests_warning=tests_warning,
            net_financial_difference=quantize_money(net_financial_diff),
            detailed_results_json=json.dumps(detailed_results),
            status=overall_status,
            submitted_by_id=submitted_by_id,
            created_at=datetime.utcnow()
        )
        self.db.add(proposal)
        self.db.commit()
        self.db.refresh(proposal)

        return {
            "id": proposal.id,
            "proposal_code": proposal.proposal_code,
            "title": proposal.title,
            "description": proposal.description,
            "test_period": proposal.test_period,
            "baseline_rule": baseline_rule,
            "proposed_rule": proposed_rule,
            "test_customers_count": proposal.test_customers_count,
            "tests_passed": proposal.tests_passed,
            "tests_failed": proposal.tests_failed,
            "tests_warning": proposal.tests_warning,
            "net_financial_difference": float(proposal.net_financial_difference),
            "status": proposal.status,
            "detailed_results": detailed_results,
            "created_at": proposal.created_at.isoformat()
        }

    def list_proposals(self) -> List[Dict[str, Any]]:
        proposals = self.db.query(BillingRuleProposal).order_by(BillingRuleProposal.created_at.desc()).all()
        return [
            {
                "id": p.id,
                "proposal_code": p.proposal_code,
                "title": p.title,
                "description": p.description,
                "test_period": p.test_period,
                "test_customers_count": p.test_customers_count,
                "tests_passed": p.tests_passed,
                "tests_failed": p.tests_failed,
                "tests_warning": p.tests_warning,
                "net_financial_difference": float(p.net_financial_difference),
                "status": p.status,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None
            }
            for p in proposals
        ]

    def get_proposal(self, proposal_id: str) -> Optional[Dict[str, Any]]:
        p = self.db.query(BillingRuleProposal).filter(BillingRuleProposal.id == proposal_id).first()
        if not p:
            return None
        return {
            "id": p.id,
            "proposal_code": p.proposal_code,
            "title": p.title,
            "description": p.description,
            "test_period": p.test_period,
            "baseline_rule": json.loads(p.baseline_rule_json or "{}"),
            "proposed_rule": json.loads(p.proposed_rule_json or "{}"),
            "test_customers_count": p.test_customers_count,
            "tests_passed": p.tests_passed,
            "tests_failed": p.tests_failed,
            "tests_warning": p.tests_warning,
            "net_financial_difference": float(p.net_financial_difference),
            "detailed_results": json.loads(p.detailed_results_json or "[]"),
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None
        }

    def review_proposal(self, proposal_id: str, new_status: str, reviewer_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        p = self.db.query(BillingRuleProposal).filter(BillingRuleProposal.id == proposal_id).first()
        if not p:
            return None
        p.status = new_status
        p.reviewed_by_id = reviewer_id
        p.reviewed_at = datetime.utcnow()
        self.db.commit()
        return {
            "id": p.id,
            "status": p.status,
            "reviewed_at": p.reviewed_at.isoformat()
        }
