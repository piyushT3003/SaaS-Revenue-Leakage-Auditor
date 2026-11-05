import uuid
import json
from decimal import Decimal
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.models.entities import (
    UsageEvent, Subscription, Customer, UploadBatch, UsageIntegrityReport
)
from backend.app.analytics.financial_engine import quantize_money

class UsageIntegrityService:
    """
    Validates high-volume usage meter telemetry prior to invoice generation.
    Audits duplicate event IDs, late-arriving events, out-of-subscription timestamps,
    and manifest control-total reconciliations.
    """
    def __init__(self, db: Session):
        self.db = db

    def scan_integrity(self, period: str = "2026-10", source_name: str = "Primary Telemetry Pipeline") -> Dict[str, Any]:
        # Fetch usage events for this period or generally
        query = self.db.query(UsageEvent)
        if period and period != "All":
            query = query.filter(func.strftime("%Y-%m", UsageEvent.usage_date) == period)
        events = query.all()

        total_checked = len(events)
        duplicates: List[Dict[str, Any]] = []
        late_arriving: List[Dict[str, Any]] = []
        out_of_sub: List[Dict[str, Any]] = []
        anomalies: List[Dict[str, Any]] = []

        # 1. Duplicate event check (by id or signature)
        seen_event_ids: Dict[str, UsageEvent] = {}
        seen_signatures: Dict[str, UsageEvent] = {}

        for ev in events:
            # Check duplicate id
            if ev.id in seen_event_ids:
                dup = {
                    "anomaly_type": "Duplicate Event ID",
                    "event_id": ev.id,
                    "customer_name": ev.customer.name if ev.customer else "Unknown",
                    "meter_name": ev.metric_name,
                    "timestamp": ev.usage_date.isoformat() if ev.usage_date else None,
                    "severity": "High",
                    "description": f"Collision on idempotency key '{ev.id}'. Risk of double-counting usage.",
                    "remediation": "Deduplicate event stream and invalidate redundant ingestion payload."
                }
                duplicates.append(dup)
                anomalies.append(dup)
            else:
                seen_event_ids[ev.id] = ev

            # Check duplicate signature: customer_id + metric_name + exact date + quantity
            sig = f"{ev.customer_id}_{ev.metric_name}_{ev.usage_date.isoformat() if ev.usage_date else ''}_{ev.quantity}"
            if sig in seen_signatures and ev.id not in seen_event_ids:
                dup_sig = {
                    "anomaly_type": "Identical Usage Signature",
                    "event_id": ev.id,
                    "customer_name": ev.customer.name if ev.customer else "Unknown",
                    "meter_name": ev.metric_name,
                    "timestamp": ev.usage_date.isoformat() if ev.usage_date else None,
                    "severity": "Medium",
                    "description": f"Identical quantity ({ev.quantity}) recorded at exact same date for {ev.metric_name}.",
                    "remediation": "Verify if network retry produced duplicate payload without unique idempotency key."
                }
                duplicates.append(dup_sig)
                anomalies.append(dup_sig)
            else:
                seen_signatures[sig] = ev

            # 2. Check out-of-subscription timestamps
            cust = ev.customer
            sub = next((s for s in (cust.subscriptions if cust else []) if s.product_id == ev.product_id), None)
            if sub:
                sub_start = sub.start_date
                sub_end = sub.end_date
                ev_date = ev.usage_date
                if ev_date:
                    if sub_start and ev_date < sub_start:
                        out = {
                            "anomaly_type": "Out-of-Subscription Window",
                            "event_id": ev.id,
                            "customer_name": cust.name if cust else "Unknown",
                            "meter_name": ev.metric_name,
                            "timestamp": ev.usage_date.isoformat(),
                            "severity": "High",
                            "description": f"Event date {ev_date} occurred before subscription activation ({sub_start}).",
                            "remediation": "Reassign event to predecessor contract or exclude from billing run."
                        }
                        out_of_sub.append(out)
                        anomalies.append(out)
                    elif sub_end and ev_date > sub_end:
                        out = {
                            "anomaly_type": "Out-of-Subscription Window",
                            "event_id": ev.id,
                            "customer_name": cust.name if cust else "Unknown",
                            "meter_name": ev.metric_name,
                            "timestamp": ev.usage_date.isoformat(),
                            "severity": "High",
                            "description": f"Event date {ev_date} occurred after subscription termination ({sub_end}).",
                            "remediation": "Verify if service was extended or flag for unauthorized post-cancellation usage."
                        }
                        out_of_sub.append(out)
                        anomalies.append(out)

            # 3. Late arriving event check (e.g. usage_date differs significantly from created_at)
            if ev.usage_date and ev.created_at:
                created_date = ev.created_at.date()
                delta_days = (created_date - ev.usage_date).days
                if delta_days > 7:  # > 7 days late
                    late = {
                        "anomaly_type": "Late Arriving Telemetry",
                        "event_id": ev.id,
                        "customer_name": cust.name if cust else "Unknown",
                        "meter_name": ev.metric_name,
                        "timestamp": ev.usage_date.isoformat(),
                        "severity": "Medium",
                        "description": f"Telemetry ingested {delta_days} days after event occurrence.",
                        "remediation": "Apply prior-period adjustment accrual and audit Kafka buffer latency."
                    }
                    late_arriving.append(late)
                    anomalies.append(late)

        # 4. Batch Control-Total Check
        upload_batches = self.db.query(UploadBatch).all()
        missing_batches = 0
        for b in upload_batches:
            if b.status == "Failed":
                missing_batches += 1
                anomalies.append({
                    "anomaly_type": "Failed Ingestion Batch",
                    "event_id": b.batch_id,
                    "customer_name": "System Pipeline",
                    "meter_name": b.source or "Batch Ingestion",
                    "timestamp": b.created_at.isoformat() if b.created_at else None,
                    "severity": "Critical",
                    "description": f"Upload batch '{b.filename}' failed during processing: {b.error_message or 'Unresolved errors'}",
                    "remediation": "Trigger reprocessing of failed batch to prevent unbilled usage drop."
                })

        # Calculate integrity score (100 base)
        # Deductions: duplicate (-5), out of sub (-8), late arriving (-2), missing batch (-15)
        score_deduction = (
            (len(duplicates) * 5) +
            (len(out_of_sub) * 8) +
            (len(late_arriving) * 2) +
            (missing_batches * 15)
        )
        final_score = max(Decimal("0.00"), Decimal("100.00") - Decimal(str(score_deduction)))
        integrity_score = quantize_money(final_score)

        if integrity_score >= Decimal("95.00"):
            status = "Clean"
        elif integrity_score >= Decimal("75.00"):
            status = "Warning"
        else:
            status = "ActionRequired"

        valid_count = max(0, total_checked - len(duplicates) - len(out_of_sub))

        # Persist report to database
        report = UsageIntegrityReport(
            id=str(uuid.uuid4()),
            period=period,
            source_name=source_name,
            total_events_checked=total_checked,
            valid_events_count=valid_count,
            duplicate_events_count=len(duplicates),
            late_arriving_count=len(late_arriving),
            unmatched_period_count=len(out_of_sub),
            missing_manifest_batches=missing_batches,
            integrity_score=integrity_score,
            status=status,
            anomalies_json=json.dumps(anomalies[:50]),  # store top 50
            scanned_at=datetime.utcnow()
        )
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)

        return {
            "report_id": report.id,
            "period": period,
            "source_name": source_name,
            "total_events_checked": total_checked,
            "valid_events_count": valid_count,
            "duplicate_events_count": len(duplicates),
            "late_arriving_count": len(late_arriving),
            "unmatched_period_count": len(out_of_sub),
            "missing_manifest_batches": missing_batches,
            "integrity_score": float(integrity_score),
            "status": status,
            "anomalies": anomalies,
            "scanned_at": report.scanned_at.isoformat()
        }

    def list_reports(self) -> List[Dict[str, Any]]:
        reports = self.db.query(UsageIntegrityReport).order_by(UsageIntegrityReport.scanned_at.desc()).all()
        return [
            {
                "id": r.id,
                "period": r.period,
                "source_name": r.source_name,
                "total_events_checked": r.total_events_checked,
                "valid_events_count": r.valid_events_count,
                "duplicate_events_count": r.duplicate_events_count,
                "late_arriving_count": r.late_arriving_count,
                "unmatched_period_count": r.unmatched_period_count,
                "missing_manifest_batches": r.missing_manifest_batches,
                "integrity_score": float(r.integrity_score),
                "status": r.status,
                "anomalies_count": len(json.loads(r.anomalies_json or "[]")),
                "scanned_at": r.scanned_at.isoformat() if r.scanned_at else None
            }
            for r in reports
        ]

    def get_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        r = self.db.query(UsageIntegrityReport).filter(UsageIntegrityReport.id == report_id).first()
        if not r:
            return None
        return {
            "id": r.id,
            "period": r.period,
            "source_name": r.source_name,
            "total_events_checked": r.total_events_checked,
            "valid_events_count": r.valid_events_count,
            "duplicate_events_count": r.duplicate_events_count,
            "late_arriving_count": r.late_arriving_count,
            "unmatched_period_count": r.unmatched_period_count,
            "missing_manifest_batches": r.missing_manifest_batches,
            "integrity_score": float(r.integrity_score),
            "status": r.status,
            "anomalies": json.loads(r.anomalies_json or "[]"),
            "scanned_at": r.scanned_at.isoformat() if r.scanned_at else None
        }
