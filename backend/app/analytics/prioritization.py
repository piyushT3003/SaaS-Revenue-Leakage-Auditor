"""Intelligent leakage prioritization — transparent, weighted scoring (no opaque AI ranking).

Each factor is normalised to 0..1 and multiplied by its configurable weight (Settings → Revenue
Rules; weights sum to 100), giving a 0..100 score with a per-factor explanation:

* exposure            financial impact ÷ largest impact among the ranked cases
* recurrence          other periods in which the same customer had the same category (max 5)
* customers_affected  customers in the largest root-cause cluster containing the case (max 10)
* evidence            share of expected evidence types present for the category
* match_reliability   HIGH match 1.0, MEDIUM 0.6, certain absence (missing charge) 0.9
* age                 days open ÷ 90 (capped at 1)
* business_impact     segment weight (Enterprise 1.0, Mid-Market 0.7, SMB 0.4), +0.2 if it is leakage
"""
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.money import D
from backend.app.models import Customer, ExceptionCase, ExceptionEvidence, ReconciliationResult
from backend.app.services.settings import get_setting

EXPECTED_EVIDENCE = {
    "PAYMENT_DISCREPANCY": {"PAYMENT"},
    "DUPLICATE_INVOICE": {"CALCULATION", "INVOICE_LINE"},
    "MISSING_CHARGE": {"CALCULATION", "CONTRACT_VERSION", "PRICING_RULE"},
    "UNBILLED_USAGE": {"CALCULATION", "CONTRACT_VERSION", "PRICING_RULE", "USAGE_SUMMARY"},
}
DEFAULT_EVIDENCE = {"CALCULATION", "CONTRACT_VERSION", "PRICING_RULE", "INVOICE_LINE"}
SEGMENT_WEIGHT = {"ENTERPRISE": 1.0, "MID_MARKET": 0.7, "SMB": 0.4}


def rank(db: Session, tenant_id: int, cases: list[ExceptionCase], clusters: list[dict] | None = None) -> list[dict]:
    weights = get_setting(db, tenant_id, "revenue_rules")["priority_weights"]
    if not cases:
        return []
    max_impact = max((D(c.financial_impact) for c in cases), default=D(1)) or D(1)
    seg = dict(db.execute(select(Customer.id, Customer.segment).where(Customer.tenant_id == tenant_id)).all())
    names = dict(db.execute(select(Customer.id, Customer.name).where(Customer.tenant_id == tenant_id)).all())
    recurrence = defaultdict(int)
    for cid, cat, n in db.execute(select(ExceptionCase.customer_id, ExceptionCase.category, func.count(func.distinct(ExceptionCase.period_start)))
                                  .where(ExceptionCase.tenant_id == tenant_id).group_by(ExceptionCase.customer_id, ExceptionCase.category)):
        recurrence[(cid, cat)] = n
    ev_types = defaultdict(set)
    for eid, t in db.execute(select(ExceptionEvidence.exception_id, ExceptionEvidence.evidence_type).where(
            ExceptionEvidence.exception_id.in_([c.id for c in cases]))):
        ev_types[eid].add(t)
    cluster_size = defaultdict(int)
    for cl in clusters or []:
        for eid in cl["exception_ids"]:
            cluster_size[eid] = max(cluster_size[eid], cl["blast_radius"]["customers"])
    confidence = {}
    rr_ids = [c.calculation.get("reconciliation_result_id") for c in cases if c.calculation.get("reconciliation_result_id")]
    for rid, conf in db.execute(select(ReconciliationResult.id, ReconciliationResult.match_confidence).where(ReconciliationResult.id.in_(rr_ids or [0]))):
        confidence[rid] = conf
    now = datetime.now(UTC)
    out = []
    for c in cases:
        expected = EXPECTED_EVIDENCE.get(c.category, DEFAULT_EVIDENCE)
        conf = confidence.get(c.calculation.get("reconciliation_result_id"), "")
        f = {
            "exposure": float(D(c.financial_impact) / max_impact),
            "recurrence": min(1.0, max(0, recurrence[(c.customer_id, c.category)] - 1) / 5),
            "customers_affected": min(1.0, max(0, cluster_size[c.id] - 1) / 9),
            "evidence": len(expected & ev_types[c.id]) / len(expected),
            "match_reliability": {"HIGH": 1.0, "MEDIUM": 0.6}.get(conf, 0.9 if c.category in ("MISSING_CHARGE", "UNBILLED_USAGE") else 0.8),
            "age": min(1.0, (now - c.created_at).days / 90),
            "business_impact": min(1.0, SEGMENT_WEIGHT.get(seg.get(c.customer_id), 0.5) + (0.2 if c.counts_toward_leakage else 0)),
        }
        contributions = {k: round(f[k] * weights.get(k, 0), 2) for k in f}
        score = round(sum(contributions.values()), 1)
        top = sorted(contributions.items(), key=lambda kv: -kv[1])[:3]
        out.append({
            "id": c.id, "exception_code": c.exception_code, "category": c.category, "customer": names.get(c.customer_id),
            "financial_impact": c.financial_impact, "status": c.status, "severity": c.severity, "score": score,
            "priority": "P1" if score >= 60 else "P2" if score >= 40 else "P3",
            "factors": {k: round(v, 3) for k, v in f.items()}, "contributions": contributions, "weights": weights,
            "explanation": "Driven by " + ", ".join(f"{k.replace('_', ' ')} (+{v})" for k, v in top),
        })
    out.sort(key=lambda r: -r["score"])
    for i, r in enumerate(out, start=1):
        r["rank"] = i
    return out
