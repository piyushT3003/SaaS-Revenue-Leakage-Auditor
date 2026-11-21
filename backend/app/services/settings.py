"""Tenant configuration with documented defaults. Changes are audit-logged."""
from __future__ import annotations

import copy

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import TenantSetting
from backend.app.services.tenancy import record_audit

DEFAULTS: dict[str, dict] = {
    "general": {"workspace_name": "SaaS Revenue Assurance", "currency": "INR", "timezone": "Asia/Kolkata",
                "date_format": "DD MMM YYYY"},
    "revenue_rules": {
        # severity by absolute financial impact (base currency)
        "severity_thresholds": {"CRITICAL": "100000", "HIGH": "50000", "MEDIUM": "10000"},
        "match_tolerance": "1.00",
        "leakage_alert_threshold": "50000",
        # leakage prioritisation weights (must sum to 100)
        "priority_weights": {"exposure": 35, "recurrence": 15, "customers_affected": 10, "evidence": 10,
                             "match_reliability": 10, "age": 10, "business_impact": 10},
    },
    "profitability": {"profitable_margin_pct": "15", "at_risk_margin_pct": "0"},
    "data_preferences": {"max_upload_mb": 25, "allowed_extensions": [".csv", ".xlsx"], "require_import_confirmation": True},
    "notifications": {"revenue_leakage_alerts": True, "payment_due_alerts": True, "daily_data_sync": True,
                      "email_notifications": False, "import_completed": True, "audit_completed": True},
    "accessibility": {"reduced_motion": False, "high_contrast": False, "disable_3d_effects": False},
    "ai": {"provider": "", "model": "", "temperature": 0.1, "max_tool_calls": 6},
}


def get_setting(db: Session, tenant_id: int, key: str) -> dict:
    base = copy.deepcopy(DEFAULTS.get(key, {}))
    row = db.scalar(select(TenantSetting).where(TenantSetting.tenant_id == tenant_id, TenantSetting.key == key))
    if row:
        _merge(base, row.value)
    return base


def all_settings(db: Session, tenant_id: int) -> dict:
    return {k: get_setting(db, tenant_id, k) for k in DEFAULTS}


def update_setting(db: Session, tenant_id: int, user_id: int | None, key: str, value: dict) -> dict:
    if key not in DEFAULTS:
        raise KeyError(key)
    unknown = set(value) - set(DEFAULTS[key])
    if unknown:
        raise ValueError(f"Unknown setting(s) for '{key}': {sorted(unknown)}")
    row = db.scalar(select(TenantSetting).where(TenantSetting.tenant_id == tenant_id, TenantSetting.key == key))
    before = get_setting(db, tenant_id, key)
    if row is None:
        row = TenantSetting(tenant_id=tenant_id, key=key, value={}, updated_by=user_id)
        db.add(row)
    merged = copy.deepcopy(row.value or {})
    _merge(merged, value)
    row.value, row.updated_by = merged, user_id
    db.flush()
    after = get_setting(db, tenant_id, key)
    record_audit(db, tenant_id, user_id, "SETTINGS_UPDATED", "tenant_settings", key, before=before, after=after)
    return after


def _merge(base: dict, patch: dict) -> None:
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _merge(base[k], v)
        else:
            base[k] = v
