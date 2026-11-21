"""Deterministic expected-charge calculation (pure functions, no database access).

Everything that decides *how much a customer should have been billed* lives here so it can be
unit-tested with hand-computed fixtures and reused by audits, historical replay, the
regression lab and the what-if simulator.

Conventions (documented in docs/metrics/METRIC_DEFINITIONS.md):

* Billing periods are calendar-aligned: MONTHLY = calendar month, QUARTERLY = calendar quarter,
  ANNUAL = calendar year. Usage is always billed monthly in arrears.
* Dates are inclusive. A period of N days that is only partly active is prorated by
  ``active_days / period_days``.
* RECURRING rule prices are *per unit per month*; one billing period covers 1, 3 or 12 months.
* When the applicable contract version changes inside a billing period, the period is split
  into segments and each segment is priced with the version in force on those days.
* For split usage periods, the monthly included allowance is prorated by segment days.
* Each component is rounded to 2 dp (ROUND_HALF_UP); totals are sums of rounded components.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from backend.app.core.money import D, money, rate

ENGINE_VERSION = "1.0.0"
MONTHS_PER_PERIOD = {"MONTHLY": 1, "QUARTERLY": 3, "ANNUAL": 12}


# ----------------------------------------------------------------------------- data shapes
@dataclass(frozen=True)
class RuleTerms:
    id: int | None
    rule_key: str
    rule_version: int
    product_id: int
    charge_type: str  # RECURRING / USAGE / ONE_TIME
    pricing_model: str  # FLAT / PER_UNIT / TIERED_GRADUATED / TIERED_VOLUME
    unit_price: Decimal
    included_units: Decimal = Decimal("0")
    tiers: tuple[tuple[Decimal | None, Decimal], ...] = ()
    discount_pct: Decimal = Decimal("0")
    minimum_commitment: Decimal = Decimal("0")
    effective_from: date | None = None
    effective_to: date | None = None

    def applies_on(self, day: date) -> bool:
        return (self.effective_from is None or day >= self.effective_from) and (
            self.effective_to is None or day <= self.effective_to
        )


@dataclass(frozen=True)
class VersionTerms:
    id: int | None
    version_number: int
    effective_from: date
    effective_to: date | None
    rules: tuple[RuleTerms, ...]

    def covers(self, day: date) -> bool:
        return day >= self.effective_from and (self.effective_to is None or day <= self.effective_to)


@dataclass(frozen=True)
class SubscriptionTerms:
    id: int
    product_id: int
    quantity: Decimal
    start_date: date
    end_date: date | None
    billing_frequency: str = "MONTHLY"
    contract_start: date | None = None
    contract_end: date | None = None

    def active_window(self) -> tuple[date, date | None]:
        start = max(self.start_date, self.contract_start or self.start_date)
        ends = [d for d in (self.end_date, self.contract_end) if d is not None]
        return start, (min(ends) if ends else None)


@dataclass
class Component:
    component_type: str  # BASE / USAGE / DISCOUNT / ONE_TIME / MINIMUM_TRUE_UP
    segment_start: date
    segment_end: date
    quantity: Decimal
    unit_price: Decimal
    amount: Decimal
    formula: str
    contract_version_id: int | None = None
    contract_version_number: int | None = None
    pricing_rule_id: int | None = None
    pricing_rule_ref: str = ""
    inputs: dict = field(default_factory=dict)


@dataclass
class ObligationCalculation:
    charge_type: str
    period_start: date
    period_end: date
    components: list[Component]
    expected_quantity: Decimal | None = None
    expected_unit_price: Decimal | None = None
    expected_discount_pct: Decimal | None = None

    @property
    def total(self) -> Decimal:
        return money(sum((c.amount for c in self.components), Decimal("0")))


class CalculationError(Exception):
    """Raised when terms needed for a calculation are missing (surfaced as a readiness gap)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


# ----------------------------------------------------------------------------- date helpers
def days_inclusive(start: date, end: date) -> int:
    return (end - start).days + 1


def month_start(d: date) -> date:
    return d.replace(day=1)


def month_end(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def billing_period_containing(day: date, frequency: str) -> tuple[date, date]:
    if frequency == "MONTHLY":
        return month_start(day), month_end(day)
    if frequency == "QUARTERLY":
        q_start = date(day.year, 3 * ((day.month - 1) // 3) + 1, 1)
        return q_start, month_end(add_months(q_start, 2))
    if frequency == "ANNUAL":
        return date(day.year, 1, 1), date(day.year, 12, 31)
    raise CalculationError("BAD_FREQUENCY", f"Unsupported billing frequency {frequency}")


def periods_starting_in(window_start: date, window_end: date, frequency: str) -> list[tuple[date, date]]:
    """Billing periods (calendar aligned) whose *start date* falls inside the audit window.
    Assigning each period to the window containing its start means no period is audited twice."""
    out: list[tuple[date, date]] = []
    cursor = month_start(window_start)
    while cursor <= window_end:
        p_start, p_end = billing_period_containing(cursor, frequency)
        if window_start <= p_start <= window_end and (p_start, p_end) not in out:
            out.append((p_start, p_end))
        cursor = add_months(cursor, 1)
    return out


def intersect(a_start: date, a_end: date, b_start: date, b_end: date | None) -> tuple[date, date] | None:
    s = max(a_start, b_start)
    e = a_end if b_end is None else min(a_end, b_end)
    return (s, e) if s <= e else None


def version_segments(
    period_start: date, period_end: date, versions: list[VersionTerms]
) -> list[tuple[date, date, VersionTerms]]:
    """Split [period_start, period_end] by the contract version in force on each day."""
    segments: list[tuple[date, date, VersionTerms]] = []
    for v in sorted(versions, key=lambda v: v.effective_from):
        hit = intersect(period_start, period_end, v.effective_from, v.effective_to)
        if hit:
            segments.append((hit[0], hit[1], v))
    # Detect days not covered by any version (a data gap, not something to guess around).
    covered = sum(days_inclusive(s, e) for s, e, _ in segments)
    if covered != days_inclusive(period_start, period_end):
        raise CalculationError(
            "VERSION_GAP",
            f"No contract version covers every day of {period_start}..{period_end} "
            f"({covered} of {days_inclusive(period_start, period_end)} days covered)",
        )
    return segments


def find_rule(version: VersionTerms, product_id: int, charge_type: str, on: date) -> RuleTerms:
    candidates = [r for r in version.rules if r.product_id == product_id and r.charge_type == charge_type and r.applies_on(on)]
    if not candidates:
        raise CalculationError(
            "MISSING_PRICING_RULE",
            f"Contract version v{version.version_number} has no {charge_type} pricing rule for product {product_id} on {on}",
        )
    if len(candidates) > 1:
        # Highest rule_version wins only if keys match; otherwise the terms are ambiguous.
        keys = {r.rule_key for r in candidates}
        if len(keys) > 1:
            raise CalculationError("AMBIGUOUS_PRICING_RULE", f"Multiple {charge_type} rules apply for product {product_id} on {on}: {sorted(keys)}")
    return max(candidates, key=lambda r: r.rule_version)


def rule_segments(start: date, end: date, version: VersionTerms, product_id: int, charge_type: str
                  ) -> list[tuple[date, date, RuleTerms]]:
    """Split a version segment further where a pricing-rule version takes effect mid-segment."""
    cuts = {start}
    for r in version.rules:
        if r.product_id != product_id or r.charge_type != charge_type:
            continue
        if r.effective_from and start < r.effective_from <= end:
            cuts.add(r.effective_from)
        if r.effective_to and start <= r.effective_to < end:
            cuts.add(r.effective_to + timedelta(days=1))
    points = sorted(cuts)
    out = []
    for i, s_ in enumerate(points):
        e_ = points[i + 1] - timedelta(days=1) if i + 1 < len(points) else end
        out.append((s_, e_, find_rule(version, product_id, charge_type, s_)))
    return out


# ----------------------------------------------------------------------------- pricing
def price_quantity(quantity: Decimal, rule: RuleTerms) -> tuple[Decimal, list[dict]]:
    """Price a billable quantity (already net of allowances). Returns (gross, breakdown)."""
    q = D(quantity)
    if q <= 0:
        return Decimal("0"), []
    model = rule.pricing_model
    if model in ("PER_UNIT", "FLAT"):
        return q * rule.unit_price, [{"from": "0", "to": str(q), "units": str(q), "unit_price": str(rule.unit_price)}]
    if not rule.tiers:
        raise CalculationError("MISSING_TIERS", f"Rule {rule.rule_key} v{rule.rule_version} is tiered but has no tiers")
    if model == "TIERED_GRADUATED":
        total, lower, breakdown = Decimal("0"), Decimal("0"), []
        for up_to, price in rule.tiers:
            if q <= lower:
                break
            upper = q if up_to is None else min(q, up_to)
            units = upper - lower
            if units > 0:
                total += units * price
                breakdown.append({"from": str(lower), "to": str(upper), "units": str(units), "unit_price": str(price)})
            lower = upper if up_to is None else up_to
        return total, breakdown
    if model == "TIERED_VOLUME":
        for up_to, price in rule.tiers:
            if up_to is None or q <= up_to:
                return q * price, [{"from": "0", "to": str(q), "units": str(q), "unit_price": str(price), "volume_tier_up_to": None if up_to is None else str(up_to)}]
    raise CalculationError("BAD_PRICING_MODEL", f"Unsupported pricing model {model}")


def _discount(gross: Decimal, rule: RuleTerms, seg: tuple[date, date], version: VersionTerms, label: str) -> Component | None:
    if rule.discount_pct <= 0 or gross <= 0:
        return None
    amount = -money(gross * rule.discount_pct / Decimal(100))
    return Component(
        component_type="DISCOUNT",
        segment_start=seg[0],
        segment_end=seg[1],
        quantity=Decimal("1"),
        unit_price=rate(rule.discount_pct),
        amount=amount,
        formula=f"−{rule.discount_pct}% × {money(gross)} ({label})",
        contract_version_id=version.id,
        contract_version_number=version.version_number,
        pricing_rule_id=rule.id,
        pricing_rule_ref=f"{rule.rule_key}@v{rule.rule_version}",
        inputs={"discount_pct": str(rule.discount_pct), "gross": str(money(gross))},
    )


# ----------------------------------------------------------------------------- obligations
def calculate_recurring(
    sub: SubscriptionTerms, period_start: date, period_end: date, versions: list[VersionTerms]
) -> ObligationCalculation | None:
    """Expected recurring charge for one billing period, or ``None`` if the subscription is not
    active on any day of the period."""
    act_start, act_end = sub.active_window()
    active = intersect(period_start, period_end, act_start, act_end)
    if active is None:
        return None
    months = MONTHS_PER_PERIOD[sub.billing_frequency]
    period_days = days_inclusive(period_start, period_end)
    comps: list[Component] = []
    unit_prices, discounts = set(), set()
    for s, e, version, rule in ((a, b, v, r) for vs, ve, v in version_segments(active[0], active[1], versions)
                                 for a, b, r in rule_segments(vs, ve, v, sub.product_id, "RECURRING")):
        seg_days = days_inclusive(s, e)
        factor = Decimal(seg_days) / Decimal(period_days)
        gross = money(rule.unit_price * sub.quantity * months * factor)
        prorated = seg_days != period_days
        formula = f"{rule.unit_price} × {sub.quantity} units × {months} month(s)"
        if prorated:
            formula += f" × {seg_days}/{period_days} days"
        comps.append(
            Component(
                component_type="BASE", segment_start=s, segment_end=e, quantity=sub.quantity, unit_price=rule.unit_price,
                amount=gross, formula=formula, contract_version_id=version.id, contract_version_number=version.version_number,
                pricing_rule_id=rule.id, pricing_rule_ref=f"{rule.rule_key}@v{rule.rule_version}",
                inputs={"months": months, "segment_days": seg_days, "period_days": period_days, "prorated": prorated},
            )
        )
        disc = _discount(gross, rule, (s, e), version, "contractual discount")
        if disc:
            comps.append(disc)
        unit_prices.add(rule.unit_price * months)  # invoice lines quote the per-period unit price
        discounts.add(rule.discount_pct)
    return ObligationCalculation(
        charge_type="RECURRING", period_start=period_start, period_end=period_end, components=comps,
        expected_quantity=sub.quantity,
        expected_unit_price=unit_prices.pop() if len(unit_prices) == 1 else None,
        expected_discount_pct=discounts.pop() if len(discounts) == 1 else None,
    )


def calculate_usage(
    sub: SubscriptionTerms,
    period_start: date,
    period_end: date,
    versions: list[VersionTerms],
    usage_by_day: dict[date, Decimal],
) -> ObligationCalculation | None:
    """Expected usage charge for a calendar month. ``usage_by_day`` holds valid billable usage."""
    act_start, act_end = sub.active_window()
    active = intersect(period_start, period_end, act_start, act_end)
    if active is None:
        return None
    month_days = days_inclusive(period_start, period_end)
    comps: list[Component] = []
    total_qty = Decimal("0")
    unit_prices, discounts = set(), set()
    for s, e, version, rule in ((a, b, v, r) for vs, ve, v in version_segments(active[0], active[1], versions)
                                 for a, b, r in rule_segments(vs, ve, v, sub.product_id, "USAGE")):
        seg_days = days_inclusive(s, e)
        used = sum((q for d, q in usage_by_day.items() if s <= d <= e), Decimal("0"))
        total_qty += used
        included = rule.included_units
        if seg_days != month_days:
            included = (rule.included_units * Decimal(seg_days) / Decimal(month_days)).quantize(Decimal("0.0001"))
        billable = max(Decimal("0"), used - included)
        gross_raw, tiers = price_quantity(billable, rule)
        gross = money(gross_raw)
        formula = f"max(0, {used} used − {included} included) = {billable} billable"
        if rule.pricing_model in ("PER_UNIT", "FLAT"):
            formula += f" × {rule.unit_price}"
        else:
            formula += f" priced {rule.pricing_model.lower()} across {len(tiers)} tier(s)"
        comps.append(
            Component(
                component_type="USAGE", segment_start=s, segment_end=e, quantity=billable,
                unit_price=rule.unit_price if rule.pricing_model in ("PER_UNIT", "FLAT") else Decimal("0"),
                amount=gross, formula=formula, contract_version_id=version.id, contract_version_number=version.version_number,
                pricing_rule_id=rule.id, pricing_rule_ref=f"{rule.rule_key}@v{rule.rule_version}",
                inputs={"used": str(used), "included": str(included), "billable": str(billable), "tiers": tiers, "segment_days": seg_days},
            )
        )
        disc = _discount(gross, rule, (s, e), version, "contractual usage discount")
        if disc:
            comps.append(disc)
        net = gross + (disc.amount if disc else Decimal("0"))
        if rule.minimum_commitment > 0:
            minimum = money(rule.minimum_commitment * Decimal(seg_days) / Decimal(month_days))
            if net < minimum:
                comps.append(
                    Component(
                        component_type="MINIMUM_TRUE_UP", segment_start=s, segment_end=e, quantity=Decimal("1"),
                        unit_price=minimum - net, amount=minimum - net,
                        formula=f"minimum commitment {minimum} − net usage charge {net}",
                        contract_version_id=version.id, contract_version_number=version.version_number,
                        pricing_rule_id=rule.id, pricing_rule_ref=f"{rule.rule_key}@v{rule.rule_version}",
                    )
                )
        # tiered prices have no single unit rate; mark so no unit-price comparison is made
        unit_prices.add(rule.unit_price if rule.pricing_model in ("PER_UNIT", "FLAT") else None)
        discounts.add(rule.discount_pct)
    return ObligationCalculation(
        charge_type="USAGE", period_start=period_start, period_end=period_end, components=comps,
        expected_quantity=sum((c.quantity for c in comps if c.component_type == "USAGE"), Decimal("0")),
        expected_unit_price=unit_prices.pop() if len(unit_prices) == 1 else None,
        expected_discount_pct=discounts.pop() if len(discounts) == 1 else None,
    )


def calculate_one_time(
    sub: SubscriptionTerms, period_start: date, period_end: date, versions: list[VersionTerms]
) -> ObligationCalculation | None:
    """One-time contractual charges whose charge date (rule ``effective_from``) is in the period."""
    comps: list[Component] = []
    for v in versions:
        for r in v.rules:
            if r.charge_type != "ONE_TIME" or r.product_id != sub.product_id or r.effective_from is None:
                continue
            if period_start <= r.effective_from <= period_end and v.covers(r.effective_from):
                gross = money(r.unit_price)
                comps.append(
                    Component("ONE_TIME", r.effective_from, r.effective_from, Decimal("1"), r.unit_price, gross,
                              f"one-time charge {r.unit_price}", v.id, v.version_number, r.id, f"{r.rule_key}@v{r.rule_version}")
                )
                disc = _discount(gross, r, (r.effective_from, r.effective_from), v, "one-time discount")
                if disc:
                    comps.append(disc)
    if not comps:
        return None
    return ObligationCalculation("ONE_TIME", period_start, period_end, comps)


def monthly_recurring_value(sub: SubscriptionTerms, versions: list[VersionTerms], as_of: date) -> Decimal:
    """Normalised monthly recurring value of one subscription on ``as_of`` (MRR contribution)."""
    start, end = sub.active_window()
    if as_of < start or (end is not None and as_of > end):
        return Decimal("0")
    version = next((v for v in versions if v.covers(as_of)), None)
    if version is None:
        raise CalculationError("VERSION_GAP", f"No contract version in force on {as_of}")
    rule = find_rule(version, sub.product_id, "RECURRING", as_of)
    return money(rule.unit_price * sub.quantity * (Decimal(100) - rule.discount_pct) / Decimal(100))


def tomorrow(d: date) -> date:
    return d + timedelta(days=1)
