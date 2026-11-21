"""Load contractual terms and usage from the database into the pure engine's data shapes."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.analytics.calculation import RuleTerms, SubscriptionTerms, VersionTerms
from backend.app.core.money import D
from backend.app.models import Contract, ContractVersion, PricingRule, Subscription, Tenant, UsageBatch, UsageEvent


def rule_terms(r: PricingRule) -> RuleTerms:
    tiers = tuple((None if t.get("up_to") in (None, "") else D(t["up_to"]), D(t["unit_price"])) for t in (r.tiers or []))
    return RuleTerms(
        id=r.id, rule_key=r.rule_key, rule_version=r.rule_version, product_id=r.product_id, charge_type=r.charge_type,
        pricing_model=r.pricing_model, unit_price=D(r.unit_price), included_units=D(r.included_units), tiers=tiers,
        discount_pct=D(r.discount_pct), minimum_commitment=D(r.minimum_commitment),
        effective_from=r.effective_from, effective_to=r.effective_to,
    )


def version_terms(v: ContractVersion, rule_overrides: dict[str, PricingRule] | None = None) -> VersionTerms:
    """Build version terms from ACTIVE rules. ``rule_overrides`` (rule_key → rule) lets the
    regression lab / simulator substitute proposed rules without touching stored data."""
    rules = []
    for r in v.pricing_rules:
        if r.status == "PROPOSED":
            continue
        if rule_overrides and r.rule_key in rule_overrides:
            r = rule_overrides[r.rule_key]
        rules.append(rule_terms(r))
    return VersionTerms(id=v.id, version_number=v.version_number, effective_from=v.effective_from,
                        effective_to=v.effective_to, rules=tuple(rules))


def subscription_terms(s: Subscription) -> SubscriptionTerms:
    return SubscriptionTerms(
        id=s.id, product_id=s.product_id, quantity=D(s.quantity), start_date=s.start_date, end_date=s.end_date,
        billing_frequency=s.billing_frequency, contract_start=s.contract.start_date, contract_end=s.contract.end_date,
    )


def load_subscriptions(db: Session, tenant_id: int, window_start: date, window_end: date,
                       customer_ids: list[int] | None = None, product_ids: list[int] | None = None) -> list[Subscription]:
    """Subscriptions that could produce an obligation for a period starting in the window.
    Quarterly/annual periods may start before the subscription does, so we look one year back."""
    lookback = window_start - timedelta(days=366)
    q = (
        select(Subscription)
        .where(Subscription.tenant_id == tenant_id, Subscription.status.notin_(("TRIAL", "PAUSED")))
        .where(Subscription.start_date <= window_end + timedelta(days=366))
        .where(or_(Subscription.end_date.is_(None), Subscription.end_date >= lookback))
        .options(selectinload(Subscription.contract).selectinload(Contract.versions).selectinload(ContractVersion.pricing_rules),
                 selectinload(Subscription.customer), selectinload(Subscription.product))
        .order_by(Subscription.id)
    )
    if customer_ids:
        q = q.where(Subscription.customer_id.in_(customer_ids))
    if product_ids:
        q = q.where(Subscription.product_id.in_(product_ids))
    return list(db.scalars(q))


def tenant_zone(db: Session, tenant_id: int) -> ZoneInfo:
    return ZoneInfo(db.get(Tenant, tenant_id).timezone)


def load_usage_by_day(db: Session, tenant_id: int, subscription_ids: list[int], start: date, end: date
                      ) -> dict[int, dict[date, Decimal]]:
    """Valid usage per subscription per local day. Events from FAILED batches are excluded."""
    if not subscription_ids:
        return {}
    tz = tenant_zone(db, tenant_id)
    lo = datetime.combine(start, time.min, tz)
    hi = datetime.combine(end + timedelta(days=1), time.min, tz)
    local_day = func.date(func.timezone(tz.key, UsageEvent.occurred_at))
    q = (
        select(UsageEvent.subscription_id, local_day.label("d"), func.sum(UsageEvent.quantity))
        .outerjoin(UsageBatch, UsageBatch.id == UsageEvent.usage_batch_id)
        .where(UsageEvent.tenant_id == tenant_id, UsageEvent.subscription_id.in_(subscription_ids))
        .where(UsageEvent.occurred_at >= lo, UsageEvent.occurred_at < hi)
        .where(or_(UsageBatch.id.is_(None), UsageBatch.status != "FAILED"))
        .group_by(UsageEvent.subscription_id, local_day)
    )
    out: dict[int, dict[date, Decimal]] = defaultdict(dict)
    for sub_id, d, qty in db.execute(q):
        out[sub_id][d] = D(qty)
    return out


def usage_signal_for_month(db: Session, tenant_id: int, month_start: date, month_end: date) -> dict[str, object]:
    """Independent completeness signal: which usage batches cover the month, and their states."""
    batches = list(db.scalars(select(UsageBatch).where(
        UsageBatch.tenant_id == tenant_id,
        and_(UsageBatch.period_start <= month_end, UsageBatch.period_end >= month_start),
    )))
    return {
        "batches": len(batches),
        "failed": [b.batch_code for b in batches if b.status == "FAILED"],
        "covered": any(b.status != "FAILED" for b in batches),
    }
