"""Advanced capabilities: evidence graph, historical replay, usage integrity, billing-rules regression lab,
root-cause analysis, leakage prioritization, what-if simulator and evidence packs."""
from __future__ import annotations

import io
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.app.analytics.prioritization import rank
from backend.app.api.common import J, Page, not_found, pagination
from backend.app.core.database import get_db
from backend.app.models import (
    AuditRun,
    ContractVersion,
    Contract,
    Customer,
    EvidencePack,
    ExceptionCase,
    PricingRule,
    Product,
    RegressionTestResult,
    RegressionTestSuite,
    RootCauseInvestigation,
    SimulationResult,
    SimulationScenario,
    UsageBatch,
)
from backend.app.reconciliation.runner import AuditRequestError, create_replay, execute_audit_run
from backend.app.security.auth import CurrentUser, require
from backend.app.services.tenancy import notify, record_audit
from backend.app.exports.safe import safe_row

router = APIRouter()


# ----------------------------------------------------------------------------- evidence graph
@router.get("/evidence-graph")
def evidence_graph(exception_id: int | None = None, obligation_id: int | None = None, customer_id: int | None = None,
                   period_start: date | None = None, period_end: date | None = None,
                   user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    from backend.app.evidence_graph.graph import build

    try:
        return build(db, user.tenant_id, exception_id, obligation_id, customer_id, period_start, period_end)
    except LookupError as exc:
        raise not_found(str(exc).capitalize()) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


# ----------------------------------------------------------------------------- historical replay
class ReplayBody(BaseModel):
    mode: str = Field(pattern="^(AS_KNOWN|CURRENT)$")


@router.post("/audits/{run_id}/replay", status_code=202)
def replay(run_id: str, body: ReplayBody, user: CurrentUser = Depends(require("audit:run")), db: Session = Depends(get_db)):
    """Replays run synchronously so the comparison is available immediately and deterministically."""
    original = db.get(AuditRun, run_id)
    if original is None or original.tenant_id != user.tenant_id:
        raise not_found("Audit run")
    try:
        run = create_replay(db, original, user.id, body.mode)
    except AuditRequestError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.commit()
    execute_audit_run(run.id)
    db.expire_all()
    run = db.get(AuditRun, run.id)
    return J({"id": run.id, "run_code": run.run_code, "status": run.status, "replay": run.summary.get("replay"),
              "compare_url": f"/api/v1/audits/{original.id}/compare/{run.id}"})


# ----------------------------------------------------------------------------- usage integrity
@router.get("/usage-integrity")
def usage_integrity(period_start: date, period_end: date, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    from backend.app.usage_integrity.monitor import check

    return J(check(db, user.tenant_id, period_start, period_end))


@router.post("/usage-integrity/batches/{batch_id}/reprocess")
def reprocess_batch(batch_id: int, user: CurrentUser = Depends(require("import:write")), db: Session = Depends(get_db)):
    from backend.app.usage_integrity.monitor import reprocess

    b = db.get(UsageBatch, batch_id)
    if b is None or b.tenant_id != user.tenant_id:
        raise not_found("Usage batch")
    try:
        msg = reprocess(db, b)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    record_audit(db, user.tenant_id, user.id, "USAGE_BATCH_REPROCESSED", "usage_batch", b.id, batch=b.batch_code)
    notify(db, user.tenant_id, "SYSTEM", f"Usage batch {b.batch_code} reprocessed", f"{msg}. Audits for {b.period_start:%b %Y} are now stale.",
           link="/reconciliation")
    db.commit()
    return {"ok": True, "message": msg}


# ----------------------------------------------------------------------------- pricing rules & regression lab
@router.get("/rules")
def rules(search: str | None = None, status: str | None = None, page: Page = Depends(pagination),
          user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    q = (select(PricingRule, Product.name, Contract.contract_number, ContractVersion.version_number, Customer.name)
         .join(Product, Product.id == PricingRule.product_id)
         .outerjoin(ContractVersion, ContractVersion.id == PricingRule.contract_version_id)
         .outerjoin(Contract, Contract.id == ContractVersion.contract_id).outerjoin(Customer, Customer.id == Contract.customer_id)
         .where(PricingRule.tenant_id == user.tenant_id))
    if search:
        like = f"%{search}%"
        q = q.where(or_(PricingRule.rule_key.ilike(like), Customer.name.ilike(like), Product.name.ilike(like)))
    if status:
        q = q.where(PricingRule.status == status.upper())
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(PricingRule.rule_key, PricingRule.rule_version.desc()).offset(page.offset).limit(page.page_size)).all()
    return page.wrap(J([{"id": r.id, "rule_key": r.rule_key, "rule_version": r.rule_version, "status": r.status, "product": pn,
                         "contract": cn, "contract_version": cv, "customer": cust, "charge_type": r.charge_type,
                         "pricing_model": r.pricing_model, "unit_price": r.unit_price, "included_units": r.included_units,
                         "tiers": r.tiers, "discount_pct": r.discount_pct, "effective_from": r.effective_from,
                         "effective_to": r.effective_to, "notes": r.notes} for r, pn, cn, cv, cust in rows]), total)


class ProposeBody(BaseModel):
    changes: dict = Field(description="unit_price / discount_pct / included_units / tiers / pricing_model / minimum_commitment / notes")


@router.post("/rules/{rule_id}/propose", status_code=201)
def propose(rule_id: int, body: ProposeBody, user: CurrentUser = Depends(require("audit:run")), db: Session = Depends(get_db)):
    from backend.app.regression.lab import propose_rule

    base = db.get(PricingRule, rule_id)
    if base is None or base.tenant_id != user.tenant_id:
        raise not_found("Pricing rule")
    if base.status == "PROPOSED":
        raise HTTPException(409, "Propose changes against an active rule version")
    try:
        r = propose_rule(db, base, body.changes, user.id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    record_audit(db, user.tenant_id, user.id, "RULE_PROPOSED", "pricing_rule", r.id, rule=f"{r.rule_key} v{r.rule_version}", changes=body.changes)
    db.commit()
    return {"id": r.id, "rule_key": r.rule_key, "rule_version": r.rule_version, "status": r.status}


class SuiteBody(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    proposed_rule_ids: list[int] = Field(min_length=1)
    period_start: date
    period_end: date
    tolerance: Decimal = Field(default=Decimal("0"), ge=0)


def _suite(db: Session, user: CurrentUser, suite_id: int) -> RegressionTestSuite:
    s = db.get(RegressionTestSuite, suite_id)
    if s is None or s.tenant_id != user.tenant_id:
        raise not_found("Regression suite")
    return s


def _suite_dict(db: Session, s: RegressionTestSuite) -> dict:
    counts = dict(db.execute(select(RegressionTestResult.outcome, func.count()).where(RegressionTestResult.suite_id == s.id)
                             .group_by(RegressionTestResult.outcome)).all())
    diff = db.scalar(select(func.coalesce(func.sum(RegressionTestResult.difference), 0)).where(RegressionTestResult.suite_id == s.id))
    names = {i: f"{k} v{v}" for i, k, v in db.execute(select(PricingRule.id, PricingRule.rule_key, PricingRule.rule_version).where(
        PricingRule.id.in_(s.proposed_rule_ids or [0])))}
    return J({"id": s.id, "name": s.name, "proposed_rules": [{"id": i, "label": names.get(i)} for i in s.proposed_rule_ids],
              "period_start": s.replay_period_start, "period_end": s.replay_period_end, "tolerance": s.tolerance,
              "approval_status": s.approval_status, "passed": counts.get("PASSED", 0), "failed": counts.get("FAILED", 0),
              "total_difference": diff, "updated_at": s.updated_at})


@router.get("/regression/suites")
def suites(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    return [_suite_dict(db, s) for s in db.scalars(select(RegressionTestSuite).where(RegressionTestSuite.tenant_id == user.tenant_id)
                                                  .order_by(RegressionTestSuite.id.desc()))]


@router.post("/regression/suites", status_code=201)
def create_suite(body: SuiteBody, user: CurrentUser = Depends(require("audit:run")), db: Session = Depends(get_db)):
    from backend.app.regression.lab import run_suite

    ok = set(db.scalars(select(PricingRule.id).where(PricingRule.id.in_(body.proposed_rule_ids), PricingRule.tenant_id == user.tenant_id,
                                                     PricingRule.status == "PROPOSED")))
    if ok != set(body.proposed_rule_ids):
        raise HTTPException(422, "All rules in a suite must be PROPOSED rule versions of this workspace")
    s = RegressionTestSuite(tenant_id=user.tenant_id, name=body.name, proposed_rule_ids=body.proposed_rule_ids,
                            replay_period_start=body.period_start, replay_period_end=body.period_end, tolerance=body.tolerance,
                            submitted_by=None)
    db.add(s)
    db.flush()
    try:
        summary = run_suite(db, s)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    record_audit(db, user.tenant_id, user.id, "REGRESSION_RUN", "regression_suite", s.id, **{k: str(v) for k, v in summary.items() if k != "features"})
    db.commit()
    return {**_suite_dict(db, s), "summary": J(summary)}


@router.get("/regression/suites/{suite_id}")
def suite_detail(suite_id: int, outcome: str | None = None, page: Page = Depends(pagination),
                 user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    s = _suite(db, user, suite_id)
    q = select(RegressionTestResult).where(RegressionTestResult.suite_id == s.id)
    if outcome:
        q = q.where(RegressionTestResult.outcome == outcome.upper())
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(func.abs(RegressionTestResult.difference).desc()).offset(page.offset).limit(page.page_size)).all()
    feats: dict[str, dict] = {}
    for d, o in db.execute(select(RegressionTestResult.details, RegressionTestResult.outcome).where(RegressionTestResult.suite_id == s.id)):
        for f in d.get("features", []):
            x = feats.setdefault(f, {"cases": 0, "failed": 0})
            x["cases"] += 1
            x["failed"] += o == "FAILED"
    return {**_suite_dict(db, s), "features": feats,
            "results": page.wrap(J([{"case_key": r.case_key, "outcome": r.outcome, "current": r.current_amount, "proposed": r.proposed_amount,
                                     "difference": r.difference, **r.details} for r in rows]), total)}


class DecisionBody(BaseModel):
    decision: str = Field(pattern="^(SUBMIT|APPROVED|REJECTED)$")
    note: str = Field(default="", max_length=500)


@router.post("/regression/suites/{suite_id}/decision")
def suite_decision(suite_id: int, body: DecisionBody, user: CurrentUser = Depends(require("audit:run")), db: Session = Depends(get_db)):
    s = _suite(db, user, suite_id)
    if body.decision == "SUBMIT":
        if s.approval_status not in ("DRAFT", "REJECTED"):
            raise HTTPException(409, f"Suite is {s.approval_status}")
        s.approval_status, s.submitted_by = "SUBMITTED", user.id
    else:
        if not user.can("rules:approve"):
            raise HTTPException(403, "Approving billing rules requires the rules:approve permission")
        if s.approval_status != "SUBMITTED":
            raise HTTPException(409, "Only submitted suites can be approved or rejected")
        if s.submitted_by == user.id:
            raise HTTPException(403, "Segregation of duties: the submitter cannot approve their own proposal")
        s.approval_status, s.approved_by = body.decision, user.id
    record_audit(db, user.tenant_id, user.id, f"RULES_{body.decision}", "regression_suite", s.id, note=body.note)
    db.commit()
    return {"ok": True, "approval_status": s.approval_status}


class ActivateBody(BaseModel):
    effective_from: date


@router.post("/regression/suites/{suite_id}/activate")
def activate_suite(suite_id: int, body: ActivateBody, user: CurrentUser = Depends(require("rules:approve")), db: Session = Depends(get_db)):
    from backend.app.regression.lab import activate

    s = _suite(db, user, suite_id)
    try:
        done = activate(db, s, body.effective_from)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    record_audit(db, user.tenant_id, user.id, "RULES_ACTIVATED", "regression_suite", s.id, rules=done)
    notify(db, user.tenant_id, "SYSTEM", "Pricing rules activated", "; ".join(done), link="/settings?tab=billing")
    db.commit()
    return {"ok": True, "activated": done}


# ----------------------------------------------------------------------------- root cause & prioritization
@router.get("/root-cause")
def root_cause(period_start: date, period_end: date, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    from backend.app.root_cause.analysis import analyse

    clusters = analyse(db, user.tenant_id, period_start, period_end)
    confirmed = db.scalars(select(RootCauseInvestigation).where(RootCauseInvestigation.tenant_id == user.tenant_id,
                                                                RootCauseInvestigation.confidence == "CONFIRMED")).all()
    conf_keys = {(c.cause_type, c.cause_reference) for c in confirmed}
    for c in clusters:
        if (c["cause_type"], c["cause_reference"][:80]) in conf_keys:
            c["confidence"] = "CONFIRMED"
    return J({"clusters": clusters, "note": "Clusters show potential shared causes. Exposure counts each obligation once."})


class ConfirmBody(BaseModel):
    cause_type: str
    cause_reference: str
    exception_ids: list[int]
    note: str = Field(min_length=10, max_length=1000)


@router.post("/root-cause/confirm", status_code=201)
def confirm_cause(body: ConfirmBody, user: CurrentUser = Depends(require("exception:write")), db: Session = Depends(get_db)):
    first = db.scalar(select(ExceptionCase).where(ExceptionCase.tenant_id == user.tenant_id, ExceptionCase.id.in_(body.exception_ids)))
    if first is None:
        raise not_found("Exception")
    total = db.scalar(select(func.coalesce(func.sum(ExceptionCase.financial_impact), 0)).where(ExceptionCase.id.in_(body.exception_ids)))
    db.add(RootCauseInvestigation(tenant_id=user.tenant_id, audit_run_id=first.last_seen_audit_run_id or first.audit_run_id,
                                  cause_type=body.cause_type, cause_reference=body.cause_reference[:80], confidence="CONFIRMED",
                                  exception_ids=body.exception_ids, unique_exposure=total, blast_radius={}, rationale=body.note))
    record_audit(db, user.tenant_id, user.id, "ROOT_CAUSE_CONFIRMED", "root_cause", body.cause_reference[:60], exceptions=body.exception_ids, note=body.note)
    db.commit()
    return {"ok": True}


@router.get("/prioritization")
def prioritization(period_start: date, period_end: date, include_resolved: bool = False,
                   user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    from backend.app.root_cause.analysis import analyse

    statuses = ("OPEN", "IN_PROGRESS", "RESOLVED") if include_resolved else ("OPEN", "IN_PROGRESS")
    cases = list(db.scalars(select(ExceptionCase).where(ExceptionCase.tenant_id == user.tenant_id, ExceptionCase.status.in_(statuses),
                                                        ExceptionCase.period_start >= period_start, ExceptionCase.period_start <= period_end)))
    return J({"ranked": rank(db, user.tenant_id, cases, analyse(db, user.tenant_id, period_start, period_end)),
              "method": "Weighted transparent score (0–100); weights are configurable in Settings → Revenue Rules."})


# ----------------------------------------------------------------------------- what-if simulator
class ScenarioBody(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    assumptions: dict = Field(default_factory=dict)
    period_start: date
    period_end: date


def _scenario(db: Session, user: CurrentUser, sid: int) -> SimulationScenario:
    s = db.get(SimulationScenario, sid)
    if s is None or s.tenant_id != user.tenant_id:
        raise not_found("Scenario")
    return s


def _scenario_dict(db: Session, s: SimulationScenario) -> dict:
    last = db.scalar(select(SimulationResult).where(SimulationResult.scenario_id == s.id).order_by(SimulationResult.id.desc()))
    return J({"id": s.id, "name": s.name, "description": s.description, "assumptions": s.assumptions, "period_start": s.base_period_start,
              "period_end": s.base_period_end, "updated_at": s.updated_at, "duplicated_from_id": s.duplicated_from_id,
              "last_result": None if last is None else {"computed_at": last.computed_at, "baseline": last.baseline, "projected": last.projected,
                                                        "hypothetical": last.is_hypothetical}})


@router.post("/simulations/preview")
def preview(body: ScenarioBody, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    from backend.app.simulation.simulator import run

    try:
        out = run(db, user.tenant_id, body.period_start, body.period_end, body.assumptions)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        db.rollback()  # belt and braces: a simulation never changes stored data
    return J(out)


@router.get("/simulations")
def scenarios(user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    return [_scenario_dict(db, s) for s in db.scalars(select(SimulationScenario).where(SimulationScenario.tenant_id == user.tenant_id)
                                                     .order_by(SimulationScenario.updated_at.desc()))]


@router.post("/simulations", status_code=201)
def create_scenario(body: ScenarioBody, user: CurrentUser = Depends(require("simulation:write")), db: Session = Depends(get_db)):
    from backend.app.simulation.simulator import validate

    try:
        validate(body.assumptions)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    s = SimulationScenario(tenant_id=user.tenant_id, name=body.name, description=body.description, assumptions=body.assumptions,
                           base_period_start=body.period_start, base_period_end=body.period_end, created_by=user.id)
    db.add(s)
    db.commit()
    return _scenario_dict(db, s)


@router.put("/simulations/{sid}")
def update_scenario(sid: int, body: ScenarioBody, user: CurrentUser = Depends(require("simulation:write")), db: Session = Depends(get_db)):
    from backend.app.simulation.simulator import validate

    s = _scenario(db, user, sid)
    try:
        validate(body.assumptions)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    s.name, s.description, s.assumptions, s.base_period_start, s.base_period_end = body.name, body.description, body.assumptions, body.period_start, body.period_end
    db.commit()
    return _scenario_dict(db, s)


@router.post("/simulations/{sid}/duplicate", status_code=201)
def duplicate(sid: int, user: CurrentUser = Depends(require("simulation:write")), db: Session = Depends(get_db)):
    s = _scenario(db, user, sid)
    c = SimulationScenario(tenant_id=user.tenant_id, name=f"{s.name} (copy)", description=s.description, assumptions=s.assumptions,
                           base_period_start=s.base_period_start, base_period_end=s.base_period_end, created_by=user.id, duplicated_from_id=s.id)
    db.add(c)
    db.commit()
    return _scenario_dict(db, c)


@router.delete("/simulations/{sid}")
def delete_scenario(sid: int, user: CurrentUser = Depends(require("simulation:write")), db: Session = Depends(get_db)):
    s = _scenario(db, user, sid)
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.post("/simulations/{sid}/run")
def run_scenario(sid: int, user: CurrentUser = Depends(require("simulation:write")), db: Session = Depends(get_db)):
    from backend.app.simulation.simulator import run

    s = _scenario(db, user, sid)
    try:
        out = run(db, user.tenant_id, s.base_period_start, s.base_period_end, s.assumptions)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.rollback()
    s = _scenario(db, user, sid)
    db.add(SimulationResult(tenant_id=user.tenant_id, scenario_id=s.id, is_hypothetical=True, baseline=J(out["baseline"]),
                            projected=J(out["projected"]), per_customer=J(out["per_customer"][:500])))
    s.updated_at = datetime.now(UTC)
    db.commit()
    return J(out)


@router.get("/simulations/{sid}/export")
def export_scenario(sid: int, user: CurrentUser = Depends(require("export")), db: Session = Depends(get_db)):
    from openpyxl import Workbook

    s = _scenario(db, user, sid)
    last = db.scalar(select(SimulationResult).where(SimulationResult.scenario_id == s.id).order_by(SimulationResult.id.desc()))
    if last is None:
        raise HTTPException(409, "Run the scenario before exporting it")
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    ws.append(["HYPOTHETICAL SCENARIO — not actual financial results"])
    ws.append(safe_row(["Scenario", s.name]))
    ws.append(["Period", f"{s.base_period_start} – {s.base_period_end}"])
    ws.append(["Assumptions", str(s.assumptions)])
    ws.append([])
    ws.append(["Measure", "Baseline", "Projected"])
    for k in ("revenue", "direct_cost", "contribution", "margin_pct"):
        ws.append([k, last.baseline.get(k), last.projected.get(k)])
    ws2 = wb.create_sheet("Customers")
    if last.per_customer:
        ws2.append(list(last.per_customer[0].keys()))
        for r in last.per_customer:
            ws2.append(safe_row([str(v) if v is not None else None for v in r.values()]))
    buf = io.BytesIO()
    wb.save(buf)
    return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="scenario_{s.id}.xlsx"'})


# ----------------------------------------------------------------------------- evidence packs
class PackBody(BaseModel):
    exception_ids: list[int] = Field(min_length=1, max_length=50)
    format: str = Field(default="pdf", pattern="^(pdf|xlsx)$")


@router.post("/evidence-packs", status_code=201)
def create_pack(body: PackBody, user: CurrentUser = Depends(require("export")), db: Session = Depends(get_db)):
    from backend.app.exports.evidence_pack import generate

    try:
        pack = generate(db, user.tenant_id, user.id, user.full_name, body.exception_ids, body.format)
    except LookupError as exc:
        raise not_found(str(exc)) from exc
    record_audit(db, user.tenant_id, user.id, "EVIDENCE_PACK_GENERATED", "evidence_pack", pack.id, exceptions=body.exception_ids,
                 format=body.format, sha256=pack.sha256)
    db.commit()
    return {"id": pack.id, "file_name": pack.file_name, "sha256": pack.sha256, "download": f"/api/v1/evidence-packs/{pack.id}/download"}


@router.get("/evidence-packs")
def packs(page: Page = Depends(pagination), user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    q = select(EvidencePack.id, EvidencePack.file_name, EvidencePack.file_format, EvidencePack.sha256, EvidencePack.generated_at,
               EvidencePack.exception_id).where(EvidencePack.tenant_id == user.tenant_id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(EvidencePack.generated_at.desc()).offset(page.offset).limit(page.page_size)).all()
    return page.wrap(J([dict(r._mapping) for r in rows]), total)


@router.get("/evidence-packs/{pack_id}/download")
def download_pack(pack_id: str, user: CurrentUser = Depends(require("read")), db: Session = Depends(get_db)):
    p = db.get(EvidencePack, pack_id)
    if p is None or p.tenant_id != user.tenant_id:
        raise not_found("Evidence pack")
    media = "application/pdf" if p.file_format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return StreamingResponse(io.BytesIO(p.content or b""), media_type=media, headers={"Content-Disposition": f'attachment; filename="{p.file_name}"'})
