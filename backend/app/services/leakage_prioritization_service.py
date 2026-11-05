import uuid
import json
from decimal import Decimal
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from backend.app.models.entities import ExceptionRecord, ExceptionPriorityScore, Customer, User
from backend.app.analytics.financial_engine import quantize_money

class LeakagePrioritizationService:
    """
    Computes explainable, deterministic multi-factor priority scores for revenue exceptions.
    Factors: Exposure (35%), Recurrence (20%), Customer Tier (15%), Evidence (15%), Age (15%).
    Updates or creates ExceptionPriorityScore records.
    """
    def __init__(self, db: Session):
        self.db = db

    def evaluate_all_exceptions(self) -> Dict[str, Any]:
        exceptions = self.db.query(ExceptionRecord).filter(ExceptionRecord.status != "Resolved").all()
        scored_records = []

        # Precompute customer exception counts for recurrence scoring
        customer_counts: Dict[str, int] = {}
        for exc in self.db.query(ExceptionRecord).all():
            cid = exc.customer_id
            customer_counts[cid] = customer_counts.get(cid, 0) + 1

        now = datetime.utcnow()

        for exc in exceptions:
            score_data = self._compute_exception_score(exc, customer_counts.get(exc.customer_id, 1), now)
            
            # Check if priority score already exists
            existing_score = self.db.query(ExceptionPriorityScore).filter(ExceptionPriorityScore.exception_id == exc.id).first()
            if not existing_score:
                new_score = ExceptionPriorityScore(
                    id=str(uuid.uuid4()),
                    exception_id=exc.id,
                    composite_score=score_data["composite_score"],
                    assigned_priority=score_data["assigned_priority"],
                    exposure_score=score_data["exposure_score"],
                    recurrence_score=score_data["recurrence_score"],
                    customer_tier_score=score_data["customer_tier_score"],
                    evidence_score=score_data["evidence_score"],
                    age_score=score_data["age_score"],
                    factors_json=json.dumps(score_data["factors"]),
                    assigned_to_id=exc.assigned_to_id,
                    manual_override=False,
                    updated_at=datetime.utcnow()
                )
                self.db.add(new_score)
                self.db.flush()
                record_id = new_score.id
            else:
                if not existing_score.manual_override:
                    existing_score.composite_score = score_data["composite_score"]
                    existing_score.assigned_priority = score_data["assigned_priority"]
                    existing_score.exposure_score = score_data["exposure_score"]
                    existing_score.recurrence_score = score_data["recurrence_score"]
                    existing_score.customer_tier_score = score_data["customer_tier_score"]
                    existing_score.evidence_score = score_data["evidence_score"]
                    existing_score.age_score = score_data["age_score"]
                    existing_score.factors_json = json.dumps(score_data["factors"])
                    existing_score.updated_at = datetime.utcnow()
                    self.db.flush()
                record_id = existing_score.id

            scored_records.append({
                "id": record_id,
                "exception_id": exc.id,
                "exception_code": exc.exception_code,
                "customer_name": exc.customer.name if exc.customer else "Unknown",
                "customer_segment": exc.customer.segment if exc.customer else "SMB",
                "category": exc.issue_type,
                "financial_impact": float(exc.financial_impact or 0.0),
                "composite_score": float(existing_score.composite_score if (existing_score and existing_score.manual_override) else score_data["composite_score"]),
                "assigned_priority": existing_score.assigned_priority if (existing_score and existing_score.manual_override) else score_data["assigned_priority"],
                "exposure_score": float(score_data["exposure_score"]),
                "recurrence_score": float(score_data["recurrence_score"]),
                "customer_tier_score": float(score_data["customer_tier_score"]),
                "evidence_score": float(score_data["evidence_score"]),
                "age_score": float(score_data["age_score"]),
                "factors": score_data["factors"],
                "assigned_to": exc.assigned_to.full_name if exc.assigned_to else "Unassigned",
                "manual_override": existing_score.manual_override if existing_score else False
            })

        self.db.commit()

        # Sort by composite score descending
        scored_records.sort(key=lambda x: x["composite_score"], reverse=True)

        # Summary statistics
        tier_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        total_exposure = Decimal("0.00")
        for r in scored_records:
            tier_counts[r["assigned_priority"]] = tier_counts.get(r["assigned_priority"], 0) + 1
            total_exposure += Decimal(str(r["financial_impact"]))

        return {
            "total_scored": len(scored_records),
            "total_exposure": float(quantize_money(total_exposure)),
            "priority_distribution": tier_counts,
            "scored_exceptions": scored_records
        }

    def _compute_exception_score(self, exc: ExceptionRecord, customer_exc_count: int, now: datetime) -> Dict[str, Any]:
        # 1. Exposure Score (35% weight)
        impact = exc.financial_impact or Decimal("0.00")
        # Normalize: $0 -> 0, $25,000+ -> 100
        exposure_val = min(Decimal("100.00"), (abs(impact) / Decimal("25000.00")) * Decimal("100.00"))
        exposure_score = quantize_money(exposure_val)

        # 2. Recurrence Score (20% weight)
        if customer_exc_count >= 5:
            recurrence_val = Decimal("100.00")
        elif customer_exc_count >= 3:
            recurrence_val = Decimal("80.00")
        elif customer_exc_count == 2:
            recurrence_val = Decimal("50.00")
        else:
            recurrence_val = Decimal("20.00")
        recurrence_score = quantize_money(recurrence_val)

        # 3. Customer Tier Score (15% weight)
        cust_tier = exc.customer.segment if exc.customer else "SMB"
        if cust_tier == "Enterprise":
            tier_val = Decimal("100.00")
        elif cust_tier == "Mid-Market":
            tier_val = Decimal("65.00")
        else:
            tier_val = Decimal("35.00")
        customer_tier_score = quantize_money(tier_val)

        # 4. Evidence Score (15% weight)
        category = exc.issue_type or ""
        if "Contract Mismatch" in category or "Version" in category:
            evidence_val = Decimal("95.00")
        elif "Unbilled Usage" in category or "Meter" in category:
            evidence_val = Decimal("90.00")
        elif "Pricing" in category or "Rate" in category:
            evidence_val = Decimal("85.00")
        else:
            evidence_val = Decimal("70.00")
        evidence_score = quantize_money(evidence_val)

        # 5. Age Score (15% weight)
        detected = exc.detected_at or now
        age_days = (now - detected).days
        if age_days > 30:
            age_val = Decimal("100.00")
        elif age_days > 14:
            age_val = Decimal("80.00")
        elif age_days > 7:
            age_val = Decimal("60.00")
        else:
            age_val = Decimal("35.00")
        age_score = quantize_money(age_val)

        # Weighted composite score
        # 0.35 * exposure + 0.20 * recurrence + 0.15 * customer_tier + 0.15 * evidence + 0.15 * age
        composite = (
            (exposure_score * Decimal("0.35")) +
            (recurrence_score * Decimal("0.20")) +
            (customer_tier_score * Decimal("0.15")) +
            (evidence_score * Decimal("0.15")) +
            (age_score * Decimal("0.15"))
        )
        composite_score = quantize_money(composite)

        # Priority classification
        if composite_score >= Decimal("80.00"):
            assigned_priority = "Critical"
        elif composite_score >= Decimal("60.00"):
            assigned_priority = "High"
        elif composite_score >= Decimal("40.00"):
            assigned_priority = "Medium"
        else:
            assigned_priority = "Low"

        factors = {
            "exposure": {
                "score": float(exposure_score),
                "weight": 0.35,
                "detail": f"${float(impact):,.2f} financial exposure"
            },
            "recurrence": {
                "score": float(recurrence_score),
                "weight": 0.20,
                "detail": f"{customer_exc_count} historic exceptions for this account"
            },
            "customer_tier": {
                "score": float(customer_tier_score),
                "weight": 0.15,
                "detail": f"{cust_tier} strategic account tier"
            },
            "evidence": {
                "score": float(evidence_score),
                "weight": 0.15,
                "detail": f"Category: {category} (high audit confidence)"
            },
            "age": {
                "score": float(age_score),
                "weight": 0.15,
                "detail": f"{age_days} days since initial detection"
            }
        }

        return {
            "composite_score": composite_score,
            "assigned_priority": assigned_priority,
            "exposure_score": exposure_score,
            "recurrence_score": recurrence_score,
            "customer_tier_score": customer_tier_score,
            "evidence_score": evidence_score,
            "age_score": age_score,
            "factors": factors
        }

    def assign_bulk(self, exception_ids: List[str], assignee_id: str) -> int:
        count = 0
        user = self.db.query(User).filter(User.id == assignee_id).first()
        for exc_id in exception_ids:
            exc = self.db.query(ExceptionRecord).filter(ExceptionRecord.id == exc_id).first()
            if exc:
                exc.assigned_to_id = assignee_id
                exc.status = "In Progress"
                score_rec = self.db.query(ExceptionPriorityScore).filter(ExceptionPriorityScore.exception_id == exc.id).first()
                if score_rec:
                    score_rec.assigned_to_id = assignee_id
                count += 1
        self.db.commit()
        return count

    def set_priority_override(self, exception_id: str, priority: str, reason: str) -> Optional[Dict[str, Any]]:
        score_rec = self.db.query(ExceptionPriorityScore).filter(ExceptionPriorityScore.exception_id == exception_id).first()
        if not score_rec:
            return None
        score_rec.assigned_priority = priority
        score_rec.manual_override = True
        score_rec.override_reason = reason
        score_rec.updated_at = datetime.utcnow()

        exc = self.db.query(ExceptionRecord).filter(ExceptionRecord.id == exception_id).first()
        if exc:
            exc.severity = priority

        self.db.commit()
        return {
            "exception_id": exception_id,
            "assigned_priority": priority,
            "manual_override": True,
            "override_reason": reason
        }
