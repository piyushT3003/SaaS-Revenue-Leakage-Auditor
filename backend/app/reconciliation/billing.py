"""STAGE 6 — billing reconciliation at billing-obligation grain.

Matching priority (first rule that applies wins for a given invoice line):

1. Explicit allocation rules (``invoice_line_allocations``) — supports consolidated lines.
2. Explicit billing-obligation reference on the invoice line.
3. Customer + subscription + charge type + billing period (split lines inside one period are summed).
4. Customer + product + charge type + billing period, only when exactly one obligation qualifies.
   If several obligations qualify the match is *ambiguous* and everything involved goes to
   PENDING_REVIEW — the engine never invents a relationship.

Invoice lines that match no obligation are reported as unmatched lines (PENDING_REVIEW).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from backend.app.core.money import D, money
from backend.app.models import Invoice, InvoiceLine, InvoiceLineAllocation
from backend.app.reconciliation.obligations import ExpectedObligation
from backend.app.replay.asof import issued_invoice_clause


@dataclass
class LineInfo:
    id: int
    invoice_id: int
    invoice_number: str
    invoice_currency: str
    customer_id: int
    subscription_id: int | None
    product_id: int | None
    charge_type: str
    period_start: date | None
    period_end: date | None
    quantity: Decimal
    unit_price: Decimal
    discount_pct: Decimal
    line_amount: Decimal
    ref: str | None


@dataclass
class Allocation:
    line: LineInfo
    amount: Decimal
    quantity: Decimal | None
    method: str


@dataclass
class ObligationMatch:
    obligation: ExpectedObligation
    allocations: list[Allocation] = field(default_factory=list)
    ambiguous_with_lines: list[int] = field(default_factory=list)


@dataclass
class OrphanLine:
    line: LineInfo
    reason: str


@dataclass
class BillingMatchResult:
    matches: list[ObligationMatch]
    orphans: list[OrphanLine]


def _load_lines(db: Session, tenant_id: int, window_start: date, window_end: date, keys: set[str],
                customer_ids: set[int] | None) -> tuple[list[LineInfo], dict[int, list[InvoiceLineAllocation]]]:
    alloc_line_ids = select(InvoiceLineAllocation.invoice_line_id).where(
        InvoiceLineAllocation.tenant_id == tenant_id, InvoiceLineAllocation.obligation_key.in_(keys or {""}))
    q = (
        select(InvoiceLine, Invoice)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(Invoice.tenant_id == tenant_id, issued_invoice_clause(Invoice))
        .where(or_(
            and_(InvoiceLine.period_start >= window_start, InvoiceLine.period_start <= window_end),
            and_(InvoiceLine.period_start.is_(None), Invoice.issue_date >= window_start, Invoice.issue_date <= window_end),
            InvoiceLine.billing_obligation_ref.in_(keys or {""}),
            InvoiceLine.id.in_(alloc_line_ids),
        ))
        .order_by(Invoice.issue_date, Invoice.id, InvoiceLine.line_number)
    )
    if customer_ids:
        q = q.where(Invoice.customer_id.in_(customer_ids))
    lines: list[LineInfo] = []
    for ln, inv in db.execute(q):
        lines.append(LineInfo(
            id=ln.id, invoice_id=inv.id, invoice_number=inv.invoice_number, invoice_currency=inv.currency,
            customer_id=inv.customer_id, subscription_id=ln.subscription_id, product_id=ln.product_id,
            charge_type=ln.charge_type, period_start=ln.period_start, period_end=ln.period_end,
            quantity=D(ln.quantity), unit_price=D(ln.unit_price), discount_pct=D(ln.discount_pct),
            line_amount=D(ln.line_amount), ref=ln.billing_obligation_ref,
        ))
    allocs: dict[int, list[InvoiceLineAllocation]] = defaultdict(list)
    if lines:
        for a in db.scalars(select(InvoiceLineAllocation).where(
                InvoiceLineAllocation.invoice_line_id.in_([ln.id for ln in lines]))):
            allocs[a.invoice_line_id].append(a)
    return lines, allocs


def _within(line: LineInfo, ob: ExpectedObligation) -> bool:
    return (line.period_start is not None and ob.period_start <= line.period_start <= ob.period_end
            and (line.period_end is None or line.period_end <= ob.period_end))


def match_invoice_lines(db: Session, tenant_id: int, window_start: date, window_end: date,
                        obligations: list[ExpectedObligation], customer_ids: set[int] | None) -> BillingMatchResult:
    by_key = {o.key: ObligationMatch(o) for o in obligations}
    lines, allocs = _load_lines(db, tenant_id, window_start, window_end, set(by_key), customer_ids)
    orphans: list[OrphanLine] = []

    by_sub: dict[tuple, list[ObligationMatch]] = defaultdict(list)
    by_prod: dict[tuple, list[ObligationMatch]] = defaultdict(list)
    for m in by_key.values():
        o = m.obligation
        by_sub[(o.customer_id, o.subscription_id, o.charge_type)].append(m)
        by_prod[(o.customer_id, o.product_id, o.charge_type)].append(m)

    for line in lines:
        # 1. explicit allocation rules (consolidated / split lines)
        if line.id in allocs:
            unknown = []
            for a in allocs[line.id]:
                m = by_key.get(a.obligation_key)
                if m is None:
                    unknown.append(a.obligation_key)
                    continue
                m.allocations.append(Allocation(line, D(a.amount), None if a.quantity is None else D(a.quantity), "ALLOCATION_RULE"))
            if unknown and len(unknown) == len(allocs[line.id]):
                orphans.append(OrphanLine(line, f"Allocation rule references obligations outside this audit scope: {', '.join(unknown)}"))
            continue
        # currency guard: never compare amounts in different currencies
        # 2. explicit obligation reference
        if line.ref:
            m = by_key.get(line.ref)
            if m is not None and m.obligation.currency == line.invoice_currency:
                m.allocations.append(Allocation(line, line.line_amount, line.quantity, "OBLIGATION_REFERENCE"))
            elif m is not None:
                orphans.append(OrphanLine(line, f"Invoice currency {line.invoice_currency} differs from contract currency {m.obligation.currency}"))
            elif line.period_start and window_start <= line.period_start <= window_end:
                orphans.append(OrphanLine(line, f"Line references obligation {line.ref}, which does not exist for this period"))
            continue
        # 3. subscription + charge type + period
        if line.subscription_id is not None:
            cands = [m for m in by_sub.get((line.customer_id, line.subscription_id, line.charge_type), []) if _within(line, m.obligation)]
            if len(cands) == 1 and cands[0].obligation.currency == line.invoice_currency:
                cands[0].allocations.append(Allocation(line, line.line_amount, line.quantity, "SUBSCRIPTION_PERIOD"))
                continue
            if not cands:
                orphans.append(OrphanLine(line, "No billing obligation exists for this subscription, charge type and period"))
                continue
        # 4. product + charge type + period (only when unambiguous)
        cands = [m for m in by_prod.get((line.customer_id, line.product_id, line.charge_type), []) if _within(line, m.obligation)]
        if len(cands) == 1 and cands[0].obligation.currency == line.invoice_currency:
            cands[0].allocations.append(Allocation(line, line.line_amount, line.quantity, "PRODUCT_PERIOD"))
        elif len(cands) > 1:
            for m in cands:
                m.ambiguous_with_lines.append(line.id)
            orphans.append(OrphanLine(line, f"Ambiguous: line could belong to {len(cands)} obligations "
                                            f"({', '.join(m.obligation.subscription_code for m in cands)}); needs review"))
        else:
            orphans.append(OrphanLine(line, "Invoice line has no corresponding billing obligation"))
    return BillingMatchResult(matches=list(by_key.values()), orphans=orphans)


@dataclass
class ObligationOutcome:
    status: str
    expected: Decimal
    invoiced: Decimal
    variance: Decimal
    invoiced_quantity: Decimal | None
    invoiced_unit_price: Decimal | None
    invoiced_discount_pct: Decimal | None
    match_method: str
    confidence: str
    explanation: str
    details: dict


def evaluate(match: ObligationMatch, tolerance: Decimal) -> ObligationOutcome:
    ob = match.obligation
    expected = ob.calc.total if ob.calc else Decimal("0")
    allocs = match.allocations
    invoiced = money(sum((a.amount for a in allocs), Decimal("0")))
    variance = money(invoiced - expected)
    qtys = [a.quantity for a in allocs if a.quantity is not None]
    inv_qty = sum(qtys, Decimal("0")) if qtys else None
    prices = {a.line.unit_price for a in allocs}
    discounts = {a.line.discount_pct for a in allocs}
    inv_price = prices.pop() if len(prices) == 1 else None
    inv_disc = discounts.pop() if len(discounts) == 1 else None
    invoices = sorted({a.line.invoice_number for a in allocs})
    methods = sorted({a.method for a in allocs})
    details = {
        "invoice_numbers": invoices,
        "line_ids": [a.line.id for a in allocs],
        "distinct_invoices": len(invoices),
        "components_total": str(expected),
    }
    # Same obligation charged on more than one invoice is a duplicate-billing signal.
    if len(invoices) > 1 and expected > 0:
        per_invoice = defaultdict(Decimal)
        for a in allocs:
            per_invoice[a.line.invoice_number] += a.amount
        full = [n for n, amt in per_invoice.items() if abs(amt - expected) <= tolerance]
        details["duplicate_candidate"] = len(full) > 1
        details["per_invoice_amounts"] = {n: str(money(v)) for n, v in per_invoice.items()}

    def outcome(status: str, explanation: str, method: str = ", ".join(methods), conf: str = "HIGH") -> ObligationOutcome:
        return ObligationOutcome(status, expected, invoiced, variance, inv_qty, inv_price, inv_disc, method, conf, explanation, details)

    if ob.excluded:
        return outcome("EXCLUDED", f"Excluded: {ob.exclusion_reason}", "", "NONE")
    if match.ambiguous_with_lines and not allocs:
        return outcome("PENDING_REVIEW", f"Candidate invoice line(s) {match.ambiguous_with_lines} match several obligations; "
                                         "manual review required before this obligation can be reconciled", "AMBIGUOUS", "NONE")
    if not allocs:
        if expected == 0:
            return outcome("MATCHED", "Nothing was billable for this period and nothing was invoiced", "NONE_REQUIRED", "HIGH")
        return outcome("MISSING_CHARGE", f"Expected {expected} but no corresponding invoice charge was found", "", "NONE")
    conf = "HIGH" if all(a.method in ("ALLOCATION_RULE", "OBLIGATION_REFERENCE", "SUBSCRIPTION_PERIOD") for a in allocs) else "MEDIUM"
    if variance < -tolerance:
        return outcome("UNDERBILLED", f"Invoiced {invoiced} against expected {expected}: underbilled by {-variance}", conf=conf)
    if variance > tolerance:
        msg = f"Invoiced {invoiced} against expected {expected}: overbilled by {variance}"
        if details.get("duplicate_candidate"):
            msg += f" — charged in full on {len(invoices)} invoices ({', '.join(invoices)})"
        return outcome("OVERBILLED", msg, conf=conf)
    # Amounts agree; check whether the composition agrees too.
    calc = ob.calc
    diffs = []
    if calc and calc.expected_quantity is not None and inv_qty is not None and money(inv_qty) != money(calc.expected_quantity):
        diffs.append(f"quantity {inv_qty} vs expected {calc.expected_quantity}")
    if calc and calc.expected_unit_price is not None and inv_price is not None and inv_price != calc.expected_unit_price:
        diffs.append(f"unit price {inv_price} vs contract {calc.expected_unit_price}")
    if calc and calc.expected_discount_pct is not None and inv_disc is not None and inv_disc != calc.expected_discount_pct:
        diffs.append(f"discount {inv_disc}% vs contract {calc.expected_discount_pct}%")
    if diffs:
        return outcome("PARTIALLY_MATCHED", "Amount agrees within tolerance but composition differs: " + "; ".join(diffs), conf=conf)
    return outcome("MATCHED", f"Invoiced {invoiced} agrees with expected {expected}", conf=conf)
