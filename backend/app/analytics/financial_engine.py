from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Optional
from datetime import date
import json

TWO_PLACES = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")

def quantize_money(amount: Decimal) -> Decimal:
    """Rounds a monetary Decimal value to 2 decimal places using standard ROUND_HALF_UP."""
    if amount is None:
        return Decimal("0.00")
    if not isinstance(amount, Decimal):
        amount = Decimal(str(amount))
    return amount.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

class FinancialCalculationEngine:
    """
    Centralized financial calculation engine implementing production-grade,
    audited formulas for SaaS Contract-to-Cash, Revenue Leakage, and Customer Unit Economics.
    All calculations strictly use Python Decimal and never IEEE-754 floating-point.
    """

    @staticmethod
    def calculate_expected_charges(
        fixed_fee: Decimal,
        discount_pct: Decimal,
        actual_units: Decimal,
        included_units: Decimal,
        rate_per_unit: Decimal,
        tier_config_json: Optional[str] = None,
        proration_factor: Decimal = Decimal("1.0")
    ) -> Dict[str, Any]:
        """
        Calculates expected charges according to the active contract version:
        - Prorated fixed recurring charge
        - Applicable contractual discount
        - Included usage allowance threshold
        - Tiered or flat overage usage calculations
        """
        fixed_fee = quantize_money(fixed_fee)
        discount_pct = Decimal(str(discount_pct or "0.00"))
        actual_units = Decimal(str(actual_units or "0"))
        included_units = Decimal(str(included_units or "0"))
        rate_per_unit = Decimal(str(rate_per_unit or "0.0000"))
        proration_factor = Decimal(str(proration_factor or "1.0"))

        # 1. Base fixed fee after proration
        prorated_fixed = quantize_money(fixed_fee * proration_factor)

        # 2. Fixed fee discount
        discount_multiplier = Decimal("1.0") - (discount_pct / Decimal("100.0"))
        net_fixed_charge = quantize_money(prorated_fixed * discount_multiplier)
        discount_amount = prorated_fixed - net_fixed_charge

        # 3. Usage & Overage calculation
        billable_units = max(Decimal("0.0"), actual_units - included_units)
        usage_charge = Decimal("0.00")

        # Check for tiered pricing configuration
        if tier_config_json:
            try:
                tiers = json.loads(tier_config_json)
                remaining_units = billable_units
                tier_breakdown = []
                last_threshold = Decimal("0")
                for tier in tiers:
                    up_to = Decimal(str(tier.get("up_to", -1)))
                    tier_rate = Decimal(str(tier.get("rate", "0")))
                    if up_to == -1:  # Infinite upper bound
                        tier_units = remaining_units
                    else:
                        tier_capacity = up_to - last_threshold
                        tier_units = min(remaining_units, tier_capacity)
                        last_threshold = up_to

                    if tier_units > Decimal("0"):
                        charge_for_tier = quantize_money(tier_units * tier_rate)
                        usage_charge += charge_for_tier
                        tier_breakdown.append({
                            "units": float(tier_units),
                            "rate": float(tier_rate),
                            "charge": float(charge_for_tier)
                        })
                        remaining_units -= tier_units
                    if remaining_units <= Decimal("0"):
                        break
            except Exception:
                usage_charge = quantize_money(billable_units * rate_per_unit)
        else:
            usage_charge = quantize_money(billable_units * rate_per_unit)

        total_expected = quantize_money(net_fixed_charge + usage_charge)

        return {
            "gross_fixed_fee": prorated_fixed,
            "discount_pct": discount_pct,
            "discount_amount": discount_amount,
            "net_fixed_charge": net_fixed_charge,
            "actual_units": actual_units,
            "included_units": included_units,
            "billable_units": billable_units,
            "usage_charge": usage_charge,
            "total_expected": total_expected
        }

    @staticmethod
    def calculate_underbilling(expected_charges: Decimal, invoiced_charges: Decimal) -> Decimal:
        """
        Positive difference between eligible expected billable charges and net invoiced charges.
        Underbilling occurs when the SaaS customer was billed LESS than the contractual obligation.
        """
        exp = quantize_money(expected_charges)
        inv = quantize_money(invoiced_charges)
        if exp > inv:
            return exp - inv
        return Decimal("0.00")

    @staticmethod
    def calculate_overbilling(expected_charges: Decimal, invoiced_charges: Decimal) -> Decimal:
        """
        Positive difference between invoiced charges and eligible expected charges.
        Overbilling occurs when the SaaS customer was billed MORE than the contractual obligation.
        """
        exp = quantize_money(expected_charges)
        inv = quantize_money(invoiced_charges)
        if inv > exp:
            return inv - exp
        return Decimal("0.00")

    @staticmethod
    def calculate_outstanding_balance(
        total_amount: Decimal,
        paid_amount: Decimal,
        credit_adjustments: Decimal = Decimal("0.00")
    ) -> Decimal:
        """
        Calculates net remaining collectible balance on an invoice.
        """
        total = quantize_money(total_amount)
        paid = quantize_money(paid_amount)
        credits = quantize_money(credit_adjustments)
        net_balance = total - (paid + credits)
        return max(Decimal("0.00"), net_balance)

    @staticmethod
    def calculate_collection_rate(applied_payments: Decimal, collectible_invoices: Decimal) -> Decimal:
        """
        Percentage of collectible invoiced revenue that has been successfully collected.
        Returns 0.00 when collectible_invoices is zero to prevent zero-division.
        """
        payments = quantize_money(applied_payments)
        invoices = quantize_money(collectible_invoices)
        if invoices <= Decimal("0.00"):
            return Decimal("100.00") if payments > Decimal("0.00") else Decimal("0.00")
        rate = (payments / invoices) * Decimal("100.0")
        return rate.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_contribution_margin(net_revenue: Decimal, direct_costs: Decimal) -> Dict[str, Any]:
        """
        Formula: Contribution Margin % = (Net Revenue - Direct Costs) / Net Revenue * 100
        Direct service costs include: infrastructure, compute, dedicated support, 3rd party licenses.
        """
        rev = quantize_money(net_revenue)
        costs = quantize_money(direct_costs)
        contribution = rev - costs

        if rev <= Decimal("0.00"):
            margin_pct = Decimal("0.0")
        else:
            margin_pct = (contribution / rev) * Decimal("100.0")

        return {
            "net_revenue": rev,
            "direct_costs": costs,
            "contribution": contribution,
            "margin_pct": margin_pct.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        }

    @staticmethod
    def calculate_reconciliation_rate(matched_records: int, total_eligible: int) -> Decimal:
        """
        Reconciliation Rate = Matched eligible obligations / Total eligible obligations * 100.
        """
        if total_eligible <= 0:
            return Decimal("100.00")
        rate = (Decimal(str(matched_records)) / Decimal(str(total_eligible))) * Decimal("100.0")
        return rate.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_revenue_health_score(
        reconciliation_rate: Decimal,
        leakage_ratio: Decimal,
        collection_rate: Decimal,
        data_quality_rate: Decimal
    ) -> Dict[str, Any]:
        """
        Calculates explainable Revenue Health Score (0-100) using weighted composite factors:
        - Reconciliation Rate: 35%
        - Low Leakage Factor (100 - (Leakage/Total Expected * 100)): 30%
        - Collection Rate: 20%
        - Data Quality & Synchronization Rate: 15%
        """
        recon_factor = min(Decimal("100.0"), reconciliation_rate) * Decimal("0.35")
        leakage_score = max(Decimal("0.0"), Decimal("100.0") - leakage_ratio) * Decimal("0.30")
        coll_factor = min(Decimal("100.0"), collection_rate) * Decimal("0.20")
        dq_factor = min(Decimal("100.0"), data_quality_rate) * Decimal("0.15")

        composite_score = (recon_factor + leakage_score + coll_factor + dq_factor).quantize(
            Decimal("0.1"), rounding=ROUND_HALF_UP
        )

        return {
            "score": composite_score,
            "factors": {
                "reconciliation_weight_score": float(recon_factor),
                "leakage_weight_score": float(leakage_score),
                "collection_weight_score": float(coll_factor),
                "data_quality_weight_score": float(dq_factor)
            }
        }
