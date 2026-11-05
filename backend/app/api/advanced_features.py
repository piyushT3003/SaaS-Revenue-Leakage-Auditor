from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from backend.app.core.database import get_db
from backend.app.security.auth import get_current_user
from backend.app.models.entities import User, HistoricalReplayRun

from backend.app.services.evidence_graph_service import RevenueEvidenceGraphService
from backend.app.services.historical_replay_service import HistoricalBillingReplayService
from backend.app.services.what_if_simulator_service import WhatIfSimulatorService
from backend.app.services.leakage_prioritization_service import LeakagePrioritizationService
from backend.app.services.usage_integrity_service import UsageIntegrityService
from backend.app.services.billing_rules_lab_service import BillingRulesLabService
from backend.app.services.root_cause_service import RootCauseAnalysisService
from backend.app.services.evidence_pack_service import AuditEvidencePackService

router = APIRouter()

# ----------------- PYDANTIC SCHEMAS -----------------

class ReplayRunRequest(BaseModel):
    period: str = Field(default="2026-08")
    customer_id: Optional[str] = Field(default=None)

class WhatIfSimulateRequest(BaseModel):
    name: str = Field(default="Optimization Scenario")
    description: Optional[str] = Field(default=None)
    baseline_period: str = Field(default="2026-10")
    target_type: str = Field(default="All")  # All, Segment, Customer, Product
    target_id: Optional[str] = Field(default=None)
    overage_rate_multiplier: float = Field(default=1.0)
    base_fee_multiplier: float = Field(default=1.0)
    minimum_commit_multiplier: float = Field(default=1.0)
    discount_cap_percent: Optional[float] = Field(default=None)
    tier_threshold_adjustment_pct: float = Field(default=0.0)
    save: bool = Field(default=True)

class BulkAssignRequest(BaseModel):
    exception_ids: List[str]
    assignee_id: str

class PriorityOverrideRequest(BaseModel):
    exception_id: str
    priority: str
    reason: str

class UsageScanRequest(BaseModel):
    period: str = Field(default="2026-10")
    source_name: str = Field(default="Primary Ingestion API Stream")

class RuleProposalRequest(BaseModel):
    title: str
    description: Optional[str] = None
    test_period: str = Field(default="2026-10")
    proposed_rule: Optional[Dict[str, Any]] = None

class RuleReviewRequest(BaseModel):
    new_status: str  # Approved, Rejected, PendingApproval
    notes: Optional[str] = None

class ClusterConfirmRequest(BaseModel):
    status: str  # Confirmed, Inconclusive, Potential
    confirmed_cause: str
    investigation_notes: Optional[str] = None

class EvidencePackGenerateRequest(BaseModel):
    pack_type: str = Field(default="Exception")  # Exception, Customer, PeriodAudit
    target_id: Optional[str] = None
    period: str = Field(default="2026-10")


# =====================================================
# 1. REVENUE EVIDENCE GRAPH
# =====================================================

@router.get("/evidence-graph")
def get_revenue_evidence_graph(
    customer_id: Optional[str] = Query(None),
    exception_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    service = RevenueEvidenceGraphService(db)
    graph = service.build_graph(customer_id=customer_id, exception_id=exception_id)
    return graph


# =====================================================
# 2. HISTORICAL BILLING REPLAY ENGINE
# =====================================================

@router.post("/historical-replay/run")
def run_historical_replay(
    req: ReplayRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = HistoricalBillingReplayService(db)
    result = service.execute_replay(
        period=req.period,
        customer_id=req.customer_id,
        created_by_id=current_user.id if current_user else None
    )
    return result

@router.get("/historical-replay/runs")
def list_historical_replay_runs(db: Session = Depends(get_db)):
    runs = db.query(HistoricalReplayRun).order_by(HistoricalReplayRun.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "replay_code": r.replay_code,
            "period": r.period,
            "status": r.status,
            "expected_total": float(r.expected_total),
            "original_invoiced_total": float(r.original_invoiced_total),
            "historical_variance": float(r.historical_variance),
            "discrepancy_count": r.discrepancy_count,
            "records_reconstructed": r.records_reconstructed,
            "is_incomplete": r.is_incomplete,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in runs
    ]

@router.get("/historical-replay/compare")
def compare_historical_replay_runs(
    run_id_a: str = Query(...),
    run_id_b: str = Query(...),
    db: Session = Depends(get_db)
):
    service = HistoricalBillingReplayService(db)
    comparison = service.compare_runs(run_id_a, run_id_b)
    if "error" in comparison:
        raise HTTPException(status_code=404, detail=comparison["error"])
    return comparison


# =====================================================
# 3. WHAT-IF REVENUE RECOVERY SIMULATOR
# =====================================================

@router.post("/what-if/simulate")
def run_what_if_simulation(
    req: WhatIfSimulateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = WhatIfSimulatorService(db)
    res = service.simulate(
        name=req.name,
        description=req.description,
        baseline_period=req.baseline_period,
        target_type=req.target_type,
        target_id=req.target_id,
        overage_rate_multiplier=req.overage_rate_multiplier,
        base_fee_multiplier=req.base_fee_multiplier,
        minimum_commit_multiplier=req.minimum_commit_multiplier,
        discount_cap_percent=req.discount_cap_percent,
        tier_threshold_adjustment_pct=req.tier_threshold_adjustment_pct,
        save=req.save,
        created_by_id=current_user.id if current_user else None
    )
    return res

@router.get("/what-if/scenarios")
def list_what_if_scenarios(db: Session = Depends(get_db)):
    service = WhatIfSimulatorService(db)
    return service.list_scenarios()

@router.get("/what-if/scenarios/{scenario_id}")
def get_what_if_scenario(scenario_id: str, db: Session = Depends(get_db)):
    service = WhatIfSimulatorService(db)
    s = service.get_scenario(scenario_id)
    if not s:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return s

@router.delete("/what-if/scenarios/{scenario_id}")
def delete_what_if_scenario(scenario_id: str, db: Session = Depends(get_db)):
    service = WhatIfSimulatorService(db)
    success = service.delete_scenario(scenario_id)
    if not success:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"message": "Scenario deleted successfully"}


# =====================================================
# 4. INTELLIGENT LEAKAGE PRIORITIZATION
# =====================================================

@router.get("/prioritization/scores")
def get_prioritized_exceptions(db: Session = Depends(get_db)):
    service = LeakagePrioritizationService(db)
    return service.evaluate_all_exceptions()

@router.post("/prioritization/assign")
def assign_prioritized_exceptions(
    req: BulkAssignRequest,
    db: Session = Depends(get_db)
):
    service = LeakagePrioritizationService(db)
    assigned_count = service.assign_bulk(req.exception_ids, req.assignee_id)
    return {"assigned_count": assigned_count, "message": f"Successfully assigned {assigned_count} exceptions."}

@router.post("/prioritization/override")
def override_exception_priority(
    req: PriorityOverrideRequest,
    db: Session = Depends(get_db)
):
    service = LeakagePrioritizationService(db)
    res = service.set_priority_override(req.exception_id, req.priority, req.reason)
    if not res:
        raise HTTPException(status_code=404, detail="Exception not found or not scored yet")
    return res


# =====================================================
# 5. USAGE METER INTEGRITY MONITOR
# =====================================================

@router.post("/usage-integrity/scan")
def scan_usage_integrity(
    req: UsageScanRequest,
    db: Session = Depends(get_db)
):
    service = UsageIntegrityService(db)
    return service.scan_integrity(period=req.period, source_name=req.source_name)

@router.get("/usage-integrity/reports")
def list_usage_integrity_reports(db: Session = Depends(get_db)):
    service = UsageIntegrityService(db)
    return service.list_reports()

@router.get("/usage-integrity/reports/{report_id}")
def get_usage_integrity_report(report_id: str, db: Session = Depends(get_db)):
    service = UsageIntegrityService(db)
    rep = service.get_report(report_id)
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found")
    return rep


# =====================================================
# 6. BILLING RULES REGRESSION LAB
# =====================================================

@router.post("/billing-lab/test")
def create_and_test_rule(
    req: RuleProposalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = BillingRulesLabService(db)
    return service.create_and_test_proposal(
        title=req.title,
        description=req.description,
        test_period=req.test_period,
        proposed_rule=req.proposed_rule,
        submitted_by_id=current_user.id if current_user else None
    )

@router.get("/billing-lab/proposals")
def list_rule_proposals(db: Session = Depends(get_db)):
    service = BillingRulesLabService(db)
    return service.list_proposals()

@router.get("/billing-lab/proposals/{proposal_id}")
def get_rule_proposal(proposal_id: str, db: Session = Depends(get_db)):
    service = BillingRulesLabService(db)
    prop = service.get_proposal(proposal_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return prop

@router.post("/billing-lab/proposals/{proposal_id}/review")
def review_rule_proposal(
    proposal_id: str,
    req: RuleReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = BillingRulesLabService(db)
    updated = service.review_proposal(
        proposal_id=proposal_id,
        new_status=req.new_status,
        reviewer_id=current_user.id if current_user else None
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return updated


# =====================================================
# 7. ROOT CAUSE & BLAST RADIUS ANALYSIS
# =====================================================

@router.get("/root-cause/clusters")
def get_root_cause_clusters(db: Session = Depends(get_db)):
    service = RootCauseAnalysisService(db)
    return service.analyze_and_cluster()

@router.post("/root-cause/clusters/{cluster_id}/confirm")
def confirm_root_cause_cluster(
    cluster_id: str,
    req: ClusterConfirmRequest,
    db: Session = Depends(get_db)
):
    service = RootCauseAnalysisService(db)
    res = service.confirm_cluster(
        cluster_id=cluster_id,
        status=req.status,
        confirmed_cause=req.confirmed_cause,
        investigation_notes=req.investigation_notes
    )
    if not res:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return res


# =====================================================
# 8. AUDIT EVIDENCE PACK
# =====================================================

@router.post("/evidence-pack/generate")
def generate_audit_evidence_pack(
    req: EvidencePackGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = AuditEvidencePackService(db)
    return service.generate_pack(
        pack_type=req.pack_type,
        target_id=req.target_id,
        period=req.period,
        generated_by_id=current_user.id if current_user else None
    )

@router.get("/evidence-pack/packs")
def list_audit_evidence_packs(db: Session = Depends(get_db)):
    service = AuditEvidencePackService(db)
    return service.list_packs()

@router.get("/evidence-pack/{pack_id}")
def get_audit_evidence_pack(pack_id: str, db: Session = Depends(get_db)):
    service = AuditEvidencePackService(db)
    pack = service.get_pack(pack_id)
    if not pack:
        raise HTTPException(status_code=404, detail="Evidence pack not found")
    return pack

@router.get("/evidence-pack/{pack_id}/pdf")
def download_evidence_pack_pdf(pack_id: str, db: Session = Depends(get_db)):
    service = AuditEvidencePackService(db)
    try:
        pdf_bytes = service.generate_pdf(pack_id)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=evidence-pack-{pack_id[:8]}.pdf"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/evidence-pack/{pack_id}/xlsx")
def download_evidence_pack_xlsx(pack_id: str, db: Session = Depends(get_db)):
    service = AuditEvidencePackService(db)
    try:
        xlsx_bytes = service.generate_xlsx(pack_id)
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=evidence-pack-{pack_id[:8]}.xlsx"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
