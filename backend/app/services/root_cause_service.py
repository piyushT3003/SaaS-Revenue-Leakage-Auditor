import uuid
import json
from decimal import Decimal
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from backend.app.models.entities import ExceptionRecord, RootCauseCluster, Customer, Invoice
from backend.app.analytics.financial_engine import quantize_money

class RootCauseAnalysisService:
    """
    Performs algorithmic clustering of revenue exceptions to determine systemic root causes
    and quantifies the cross-portfolio blast radius (affected customers, invoices, exposure).
    """
    def __init__(self, db: Session):
        self.db = db

    def analyze_and_cluster(self) -> Dict[str, Any]:
        exceptions = self.db.query(ExceptionRecord).filter(ExceptionRecord.status != "Resolved").all()

        # Clustering buckets
        buckets: Dict[str, Dict[str, Any]] = {
            "ContractVersion": {
                "title": "Systemic Contract Version Discrepancies",
                "grouping_factor": "Contract Versioning Mismatch & Legacy Addenda",
                "exceptions": []
            },
            "PricingRule": {
                "title": "Tier 2/3 Overage Pricing Rate Divergence",
                "grouping_factor": "Pricing Rule Misconfiguration",
                "exceptions": []
            },
            "MeterConfig": {
                "title": "Kafka Telemetry Stream Ingestion Gaps",
                "grouping_factor": "Telemetry Meter Multiplier / Missing Sync",
                "exceptions": []
            },
            "TimingProration": {
                "title": "Mid-Cycle Proration Convention Divergence",
                "grouping_factor": "Proration Timing Calculation",
                "exceptions": []
            }
        }

        # Classify each exception into one of the systemic buckets based on its issue_type/description
        for exc in exceptions:
            cat = (exc.issue_type or "").lower()
            desc = (exc.description or "").lower()

            if "meter" in cat or "unbilled" in cat or "telemetry" in desc:
                buckets["MeterConfig"]["exceptions"].append(exc)
            elif "pricing" in cat or "tier" in desc or "rate" in cat or "discount" in cat:
                buckets["PricingRule"]["exceptions"].append(exc)
            elif "proration" in cat or "timing" in desc or "cycle" in desc:
                buckets["TimingProration"]["exceptions"].append(exc)
            else:
                buckets["ContractVersion"]["exceptions"].append(exc)

        clusters: List[Dict[str, Any]] = []

        for cluster_type, bucket_data in buckets.items():
            exc_list: List[ExceptionRecord] = bucket_data["exceptions"]
            if not exc_list:
                continue

            customer_ids = set()
            invoice_ids = set()
            total_exposure = Decimal("0.00")
            exc_ids = []

            for e in exc_list:
                exc_ids.append(e.id)
                if e.customer_id:
                    customer_ids.add(e.customer_id)
                if e.customer and e.customer.invoices:
                    invoice_ids.add(e.customer.invoices[0].id)
                total_exposure += (e.financial_impact or Decimal("0.00"))

            # Check if cluster already exists in DB
            cluster_code = f"CLUSTER-{cluster_type.upper()}"
            existing_cluster = self.db.query(RootCauseCluster).filter(RootCauseCluster.cluster_code == cluster_code).first()

            if not existing_cluster:
                new_cluster = RootCauseCluster(
                    id=str(uuid.uuid4()),
                    cluster_code=cluster_code,
                    title=bucket_data["title"],
                    cluster_type=cluster_type,
                    grouping_factor=bucket_data["grouping_factor"],
                    affected_exception_ids_json=json.dumps(exc_ids),
                    affected_customer_count=len(customer_ids),
                    affected_invoices_count=len(invoice_ids),
                    aggregate_exposure=quantize_money(total_exposure),
                    status="Potential",
                    investigation_notes=f"Identified {len(exc_ids)} correlated exceptions across {len(customer_ids)} distinct customer accounts.",
                    created_at=datetime.utcnow()
                )
                self.db.add(new_cluster)
                self.db.flush()
                cluster_obj = new_cluster
            else:
                existing_cluster.affected_exception_ids_json = json.dumps(exc_ids)
                existing_cluster.affected_customer_count = len(customer_ids)
                existing_cluster.affected_invoices_count = len(invoice_ids)
                existing_cluster.aggregate_exposure = quantize_money(total_exposure)
                cluster_obj = existing_cluster

            clusters.append({
                "id": cluster_obj.id,
                "cluster_code": cluster_obj.cluster_code,
                "title": cluster_obj.title,
                "cluster_type": cluster_obj.cluster_type,
                "grouping_factor": cluster_obj.grouping_factor,
                "affected_customer_count": cluster_obj.affected_customer_count,
                "affected_invoices_count": cluster_obj.affected_invoices_count,
                "aggregate_exposure": float(cluster_obj.aggregate_exposure),
                "status": cluster_obj.status,
                "investigation_notes": cluster_obj.investigation_notes,
                "confirmed_cause": cluster_obj.confirmed_cause,
                "affected_exceptions": [
                    {
                        "id": e.id,
                        "code": e.exception_code,
                        "customer": e.customer.name if e.customer else "Unknown",
                        "impact": float(e.financial_impact or 0.0),
                        "severity": e.severity
                    }
                    for e in exc_list[:10]
                ]
            })

        self.db.commit()

        # Sort clusters by exposure descending
        clusters.sort(key=lambda x: x["aggregate_exposure"], reverse=True)

        return {
            "total_clusters": len(clusters),
            "clusters": clusters
        }

    def confirm_cluster(self, cluster_id: str, status: str, confirmed_cause: str, investigation_notes: Optional[str] = None) -> Optional[Dict[str, Any]]:
        cluster = self.db.query(RootCauseCluster).filter(RootCauseCluster.id == cluster_id).first()
        if not cluster:
            return None
        cluster.status = status
        cluster.confirmed_cause = confirmed_cause
        if investigation_notes:
            cluster.investigation_notes = investigation_notes
        self.db.commit()
        return {
            "id": cluster.id,
            "cluster_code": cluster.cluster_code,
            "status": cluster.status,
            "confirmed_cause": cluster.confirmed_cause,
            "investigation_notes": cluster.investigation_notes
        }
