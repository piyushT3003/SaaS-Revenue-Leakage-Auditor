"""Revenue Evidence Graph — the source lineage of financial obligations, built only from stored
foreign keys and stored reconciliation matches. Nothing is inferred.

Chain: Customer → Contract → Contract Version → Subscription → Product → Usage Events →
Billing Obligation → Invoice Line → Invoice → Payment Allocation → Payment → Exception
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.api.common import J
from backend.app.models import (
    AuditRun,
    BillingObligation,
    BillingObligationComponent,
    Contract,
    ContractVersion,
    Customer,
    ExceptionCase,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    PricingRule,
    Product,
    ReconciliationResult,
    Subscription,
    Tenant,
    UsageEvent,
)


@dataclass
class Graph:
    nodes: dict[str, dict] = field(default_factory=dict)
    edges: dict[tuple, dict] = field(default_factory=dict)

    def node(self, kind: str, rid, label: str, subtitle: str = "", record: dict | None = None, highlight: bool = False) -> str:
        nid = f"{kind}:{rid}"
        if nid not in self.nodes:
            self.nodes[nid] = {"id": nid, "type": kind, "label": label, "subtitle": subtitle, "record": J(record or {}),
                               "highlight": highlight}
        elif highlight:
            self.nodes[nid]["highlight"] = True
        return nid

    def edge(self, src: str, dst: str, relation: str, detail: str = "") -> None:
        self.edges[(src, dst, relation)] = {"source": src, "target": dst, "relation": relation, "detail": detail}

    def out(self, root: str) -> dict:
        kinds = defaultdict(int)
        for n in self.nodes.values():
            kinds[n["type"]] += 1
        return {"root": root, "nodes": list(self.nodes.values()), "edges": list(self.edges.values()), "counts": dict(kinds),
                "note": "Every node is a stored record and every edge a stored foreign key or a stored reconciliation match."}


def _rec(obj, *fields) -> dict:
    return {f: getattr(obj, f) for f in fields}


def _latest_result(db: Session, obligation_id: int, run_id: str | None) -> tuple[ReconciliationResult | None, AuditRun | None]:
    q = select(ReconciliationResult, AuditRun).join(AuditRun).where(ReconciliationResult.obligation_id == obligation_id)
    if run_id:
        q = q.where(AuditRun.id == run_id)
    row = db.execute(q.order_by(AuditRun.completed_at.desc().nulls_last()).limit(1)).first()
    return (row[0], row[1]) if row else (None, None)


def build_for_obligation(db: Session, g: Graph, ob: BillingObligation, run_id: str | None = None, highlight: bool = True) -> str:
    sub = db.get(Subscription, ob.subscription_id)
    cust, ctr, prod = db.get(Customer, ob.customer_id), db.get(Contract, ob.contract_id), db.get(Product, ob.product_id)
    c = g.node("customer", cust.id, cust.name, f"{cust.customer_code} · {cust.segment}", _rec(cust, "customer_code", "name", "segment", "region", "status"), highlight)
    k = g.node("contract", ctr.id, ctr.contract_number, f"{ctr.start_date} – {ctr.end_date or 'open'}",
               _rec(ctr, "contract_number", "start_date", "end_date", "currency", "billing_frequency", "payment_terms_days", "status"), highlight)
    g.edge(c, k, "has contract")
    s = g.node("subscription", sub.id, sub.subscription_code, f"qty {sub.quantity} · {sub.billing_frequency.lower()}",
               _rec(sub, "subscription_code", "plan_name", "quantity", "status", "start_date", "end_date", "billing_frequency"), highlight)
    p = g.node("product", prod.id, prod.name, prod.charge_model.lower(), _rec(prod, "product_code", "name", "charge_model", "unit_name"))
    g.edge(k, s, "covers subscription")
    g.edge(s, p, "subscribes to")
    o = g.node("obligation", ob.id, f"{ob.charge_type.title()} {ob.period_start:%b %Y}", ob.obligation_key,
               _rec(ob, "obligation_key", "charge_type", "period_start", "period_end"), highlight)
    g.edge(s, o, "creates billing obligation", f"{ob.period_start}..{ob.period_end}")
    result, run = _latest_result(db, ob.id, run_id)
    if run is not None:
        comps = db.scalars(select(BillingObligationComponent).where(BillingObligationComponent.audit_run_id == run.id,
                                                                    BillingObligationComponent.obligation_id == ob.id)).all()
        for vid in {x.contract_version_id for x in comps if x.contract_version_id}:
            v = db.get(ContractVersion, vid)
            vn = g.node("contract_version", v.id, f"Version {v.version_number}", f"{v.effective_from} – {v.effective_to or 'open'}",
                        _rec(v, "version_number", "effective_from", "effective_to", "change_reason"), highlight)
            g.edge(k, vn, "has version")
            g.edge(vn, o, "priced obligation", f"audit {run.run_code}")
        for rid in {x.pricing_rule_id for x in comps if x.pricing_rule_id}:
            r = db.get(PricingRule, rid)
            rn = g.node("pricing_rule", r.id, f"{r.rule_key} v{r.rule_version}", f"{r.pricing_model} {r.unit_price}",
                        _rec(r, "rule_key", "rule_version", "charge_type", "pricing_model", "unit_price", "included_units", "discount_pct", "tiers", "status"))
            if r.contract_version_id:
                g.edge(f"contract_version:{r.contract_version_id}", rn, "defines rule")
            g.edge(rn, o, "rate applied", f"audit {run.run_code}")
        g.nodes[o]["record"].update(J({"audit": run.run_code, "status": result.status, "expected": result.expected_amount,
                                       "invoiced": result.invoiced_amount, "variance": result.variance,
                                       "components": [{"type": x.component_type, "formula": x.formula, "amount": x.amount} for x in comps]}))
    if ob.charge_type == "USAGE":
        tz = ZoneInfo(db.get(Tenant, ob.tenant_id).timezone)
        lo, hi = datetime.combine(ob.period_start, time.min, tz), datetime.combine(ob.period_end + timedelta(days=1), time.min, tz)
        n, q, first, last = db.execute(select(func.count(UsageEvent.id), func.coalesce(func.sum(UsageEvent.quantity), 0),
                                              func.min(UsageEvent.event_id), func.max(UsageEvent.event_id))
                                       .where(UsageEvent.subscription_id == sub.id, UsageEvent.occurred_at >= lo, UsageEvent.occurred_at < hi)).one()
        u = g.node("usage", f"{sub.id}-{ob.period_start}", f"{n} usage events", f"{q} {prod.unit_name}",
                   {"events": n, "quantity": q, "first_event_id": first, "last_event_id": last, "period": f"{ob.period_start}..{ob.period_end}"})
        g.edge(p, u, "metered by")
        g.edge(u, o, "aggregated into")
    if result is not None:
        for ln in db.scalars(select(InvoiceLine).where(InvoiceLine.id.in_(result.matched_line_ids or [0]))):
            inv = db.get(Invoice, ln.invoice_id)
            ln_id = g.node("invoice_line", ln.id, f"{inv.invoice_number} · line {ln.line_number}", f"{ln.quantity} × {ln.unit_price} = {ln.line_amount}",
                           _rec(ln, "line_number", "description", "quantity", "unit_price", "discount_pct", "line_amount", "billing_obligation_ref",
                                "source_batch_id", "source_row_number"), highlight)
            g.edge(o, ln_id, "billed on", f"matched by {result.match_method.lower().replace('_', ' ')}")
            add_invoice(db, g, inv, ln_id)
    for e in db.scalars(select(ExceptionCase).where(ExceptionCase.obligation_id == ob.id)):
        en = g.node("exception", e.id, e.exception_code, f"{e.category.replace('_', ' ').title()} · {e.financial_impact}",
                    _rec(e, "exception_code", "category", "title", "financial_impact", "severity", "status"), True)
        g.edge(o, en, "flagged by")
    return o


def add_invoice(db: Session, g: Graph, inv: Invoice, from_line: str | None = None) -> str:
    i = g.node("invoice", inv.id, inv.invoice_number, f"{inv.status} · total {inv.total_amount}",
               _rec(inv, "invoice_number", "issue_date", "due_date", "status", "subtotal", "tax_amount", "total_amount", "void_reason"))
    if from_line:
        g.edge(from_line, i, "line of")
    for a in db.scalars(select(PaymentAllocation).where(PaymentAllocation.invoice_id == inv.id)):
        pay = db.get(Payment, a.payment_id)
        an = g.node("allocation", a.id, f"Allocation {a.amount}", f"{a.allocated_on}{' · reversed' if a.reversed_at else ''}",
                    _rec(a, "amount", "allocated_on", "method", "reversed_at", "reversal_reason"))
        pn = g.node("payment", pay.id, pay.payment_number, f"{pay.amount} · {pay.verification_status.lower()}",
                    _rec(pay, "payment_number", "received_on", "amount", "method", "transaction_reference", "verification_status", "source"))
        g.edge(i, an, "settled by")
        g.edge(pn, an, "allocated as")
        for e in db.scalars(select(ExceptionCase).where(ExceptionCase.payment_id == pay.id)):
            en = g.node("exception", e.id, e.exception_code, e.category.replace("_", " ").title(), _rec(e, "exception_code", "category", "title", "financial_impact", "status"), True)
            g.edge(pn, en, "flagged by")
    return i


def build(db: Session, tenant_id: int, exception_id: int | None = None, obligation_id: int | None = None,
          customer_id: int | None = None, period_start: date | None = None, period_end: date | None = None, limit: int = 40) -> dict:
    g = Graph()
    if exception_id:
        e = db.get(ExceptionCase, exception_id)
        if e is None or e.tenant_id != tenant_id:
            raise LookupError("exception")
        if e.obligation_id:
            build_for_obligation(db, g, db.get(BillingObligation, e.obligation_id), e.last_seen_audit_run_id)
        else:
            if e.category == "DUPLICATE_INVOICE":
                for key in e.calculation.get("obligations", []):
                    ob = db.scalar(select(BillingObligation).where(BillingObligation.tenant_id == tenant_id, BillingObligation.obligation_key == key))
                    if ob:
                        build_for_obligation(db, g, ob, e.last_seen_audit_run_id)
            if e.payment_id:
                pay = db.get(Payment, e.payment_id)
                for a in db.scalars(select(PaymentAllocation).where(PaymentAllocation.payment_id == pay.id)):
                    add_invoice(db, g, db.get(Invoice, a.invoice_id))
                pn = g.node("payment", pay.id, pay.payment_number, str(pay.amount), _rec(pay, "payment_number", "received_on", "amount", "transaction_reference", "verification_status"))
                if pay.customer_id:
                    cust = db.get(Customer, pay.customer_id)
                    g.edge(g.node("customer", cust.id, cust.name, cust.customer_code, _rec(cust, "customer_code", "name")), pn, "paid by")
            if e.invoice_id and e.category != "DUPLICATE_INVOICE":
                add_invoice(db, g, db.get(Invoice, e.invoice_id))
            en = g.node("exception", e.id, e.exception_code, e.category.replace("_", " ").title(),
                        _rec(e, "exception_code", "category", "title", "financial_impact", "severity", "status"), True)
            for nid in list(g.nodes):
                if nid.startswith(("payment:", "invoice:")) and nid != en and (nid == f"payment:{e.payment_id}" or nid == f"invoice:{e.invoice_id}"):
                    g.edge(nid, en, "flagged by")
        return g.out(f"exception:{exception_id}")
    if obligation_id:
        ob = db.get(BillingObligation, obligation_id)
        if ob is None or ob.tenant_id != tenant_id:
            raise LookupError("obligation")
        return g.out(build_for_obligation(db, g, ob))
    if customer_id:
        q = select(BillingObligation).where(BillingObligation.tenant_id == tenant_id, BillingObligation.customer_id == customer_id)
        if period_start:
            q = q.where(BillingObligation.period_start >= period_start)
        if period_end:
            q = q.where(BillingObligation.period_start <= period_end)
        obs = db.scalars(q.order_by(BillingObligation.period_start.desc()).limit(limit)).all()
        if not obs:
            raise LookupError("no obligations for customer in period")
        for ob in obs:
            build_for_obligation(db, g, ob, highlight=False)
        return g.out(f"customer:{customer_id}")
    raise ValueError("Provide exception_id, obligation_id or customer_id")


def _unused(_: Decimal) -> None:  # keeps Decimal import for type clarity in records
    return None
