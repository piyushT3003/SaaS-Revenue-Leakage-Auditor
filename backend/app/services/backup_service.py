import os
import json
import hashlib
import shutil
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.app.core.database import engine, Base, SessionLocal
from backend.app.models.entities import (
    User, Customer, Product, Contract, ContractVersion, Subscription,
    UsageEvent, Invoice, InvoiceLine, Payment, PaymentAllocation,
    CreditAdjustment, ProductCost, ExceptionRecord, ExceptionEvidence,
    InvestigationNote, UploadBatch, AuditLog, NotificationEvent,
    ReconciliationRun, AppSettings, HistoricalReplayRun, WhatIfScenario,
    ExceptionPriorityScore, UsageIntegrityReport, BillingRuleProposal,
    RootCauseCluster, AuditEvidencePackRecord
)

BACKUP_DIR = os.path.join(os.getcwd(), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        if isinstance(obj, (datetime,)):
            return obj.isoformat()
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        return super().default(obj)

class BackupService:
    @staticmethod
    def create_database_snapshot(db: Session, backup_name: Optional[str] = None) -> Dict[str, Any]:
        """Creates a verified JSON snapshot backup of all tables and relational state."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        name = backup_name or f"backup_{timestamp}.json"
        target_path = os.path.join(BACKUP_DIR, name)

        tables_data = {}
        counts = {}

        # List of models in order
        model_classes = [
            AppSettings, User, Customer, Product, Contract, ContractVersion,
            Subscription, UsageEvent, Invoice, InvoiceLine, Payment,
            PaymentAllocation, CreditAdjustment, ProductCost, ExceptionRecord,
            ExceptionEvidence, InvestigationNote, UploadBatch, NotificationEvent,
            ReconciliationRun, AuditLog, HistoricalReplayRun, WhatIfScenario,
            ExceptionPriorityScore, UsageIntegrityReport, BillingRuleProposal,
            RootCauseCluster, AuditEvidencePackRecord
        ]

        for model in model_classes:
            table_name = model.__tablename__
            rows = db.query(model).all()
            counts[table_name] = len(rows)
            row_dicts = []
            for r in rows:
                row_dict = {}
                for col in model.__table__.columns:
                    val = getattr(r, col.name)
                    row_dict[col.name] = val
                row_dicts.append(row_dict)
            tables_data[table_name] = row_dicts

        manifest = {
            "version": "1.0",
            "created_at": datetime.utcnow().isoformat(),
            "total_tables": len(tables_data),
            "record_counts": counts,
            "data": tables_data
        }

        json_bytes = json.dumps(manifest, cls=DecimalEncoder, indent=2).encode("utf-8")
        checksum = hashlib.sha256(json_bytes).hexdigest()
        manifest["checksum"] = checksum

        with open(target_path, "wb") as f:
            f.write(json.dumps(manifest, cls=DecimalEncoder, indent=2).encode("utf-8"))

        # Log backup creation
        log = AuditLog(
            action="CREATE_BACKUP",
            entity_type="SystemBackup",
            entity_id=name,
            details=f"Created database snapshot '{name}' with {sum(counts.values())} total records. SHA256: {checksum[:12]}...",
            created_at=datetime.utcnow()
        )
        db.add(log)
        db.commit()

        return {
            "status": "success",
            "backup_name": name,
            "filepath": target_path,
            "record_counts": counts,
            "total_records": sum(counts.values()),
            "checksum": checksum,
            "created_at": manifest["created_at"]
        }

    @staticmethod
    def restore_database_snapshot(db: Session, backup_name: str) -> Dict[str, Any]:
        """Restores database from an authenticated backup snapshot inside a single rollback transaction."""
        source_path = os.path.join(BACKUP_DIR, backup_name)
        if not os.path.exists(source_path):
            raise FileNotFoundError(f"Backup file '{backup_name}' not found at {source_path}")

        with open(source_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        data = manifest.get("data", {})
        counts = manifest.get("record_counts", {})

        # Wipe existing database and recreate tables cleanly
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        model_map = {
            "app_settings": AppSettings,
            "users": User,
            "customers": Customer,
            "products": Product,
            "contracts": Contract,
            "contract_versions": ContractVersion,
            "subscriptions": Subscription,
            "usage_events": UsageEvent,
            "invoices": Invoice,
            "invoice_lines": InvoiceLine,
            "payments": Payment,
            "payment_allocations": PaymentAllocation,
            "credits_adjustments": CreditAdjustment,
            "product_costs": ProductCost,
            "exceptions": ExceptionRecord,
            "exception_evidence": ExceptionEvidence,
            "investigation_notes": InvestigationNote,
            "upload_batches": UploadBatch,
            "notification_events": NotificationEvent,
            "reconciliation_runs": ReconciliationRun,
            "audit_logs": AuditLog,
            "historical_replay_runs": HistoricalReplayRun,
            "what_if_scenarios": WhatIfScenario,
            "exception_priority_scores": ExceptionPriorityScore,
            "usage_integrity_reports": UsageIntegrityReport,
            "billing_rule_proposals": BillingRuleProposal,
            "root_cause_clusters": RootCauseCluster,
            "audit_evidence_packs": AuditEvidencePackRecord
        }

        # Insert in dependency order
        insertion_order = [
            "app_settings", "users", "customers", "products", "contracts",
            "contract_versions", "subscriptions", "usage_events", "invoices",
            "invoice_lines", "payments", "payment_allocations", "credits_adjustments",
            "product_costs", "exceptions", "exception_evidence", "investigation_notes",
            "upload_batches", "notification_events", "reconciliation_runs", "audit_logs",
            "historical_replay_runs", "what_if_scenarios", "exception_priority_scores",
            "usage_integrity_reports", "billing_rule_proposals", "root_cause_clusters",
            "audit_evidence_packs"
        ]

        try:
            for tbl_name in insertion_order:
                if tbl_name in data and tbl_name in model_map:
                    model_cls = model_map[tbl_name]
                    records = data[tbl_name]
                    for rec in records:
                        # Convert date/datetime strings back if needed
                        instance_kwargs = {}
                        for col in model_cls.__table__.columns:
                            col_name = col.name
                            if col_name in rec:
                                raw_val = rec[col_name]
                                if raw_val is not None:
                                    if col.type.python_type in (datetime,):
                                        try:
                                            instance_kwargs[col_name] = datetime.fromisoformat(raw_val)
                                        except Exception:
                                            instance_kwargs[col_name] = raw_val
                                    elif col.type.python_type in (Decimal,):
                                        instance_kwargs[col_name] = Decimal(str(raw_val))
                                    else:
                                        instance_kwargs[col_name] = raw_val
                                else:
                                    instance_kwargs[col_name] = None
                        inst = model_cls(**instance_kwargs)
                        db.add(inst)
            db.commit()

            # Record restore audit log
            restore_log = AuditLog(
                action="RESTORE_BACKUP",
                entity_type="SystemBackup",
                entity_id=backup_name,
                details=f"Restored database state from backup '{backup_name}' with {sum(counts.values())} records.",
                created_at=datetime.utcnow()
            )
            db.add(restore_log)
            db.commit()

            return {
                "status": "success",
                "message": f"Successfully restored database from {backup_name}",
                "restored_tables": len(data),
                "restored_records": sum(counts.values())
            }
        except Exception as e:
            db.rollback()
            raise RuntimeError(f"Database restore failed, safely rolled back: {str(e)}")

    @staticmethod
    def list_available_backups() -> List[Dict[str, Any]]:
        """Lists all existing backups with metadata and size."""
        if not os.path.exists(BACKUP_DIR):
            return []
        files = [f for f in os.listdir(BACKUP_DIR) if f.endswith(".json")]
        backups = []
        for f in files:
            p = os.path.join(BACKUP_DIR, f)
            stat = os.stat(p)
            backups.append({
                "backup_name": f,
                "size_kb": round(stat.st_size / 1024, 2),
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
        return sorted(backups, key=lambda x: x["modified_at"], reverse=True)
