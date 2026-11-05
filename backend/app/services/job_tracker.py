import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional, List

class BackgroundJobTracker:
    """Thread-safe background job state tracker for reconciliation and bulk imports."""
    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}

    def create_job(self, job_type: str, total_records: int = 0, metadata: Optional[Dict[str, Any]] = None) -> str:
        job_id = f"JOB-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
        self._jobs[job_id] = {
            "job_id": job_id,
            "job_type": job_type,
            "status": "Queued",  # Queued, Running, Completed, Failed
            "progress_pct": 0.0,
            "records_processed": 0,
            "total_records": total_records,
            "metadata": metadata or {},
            "result": None,
            "error": None,
            "created_at": datetime.utcnow().isoformat(),
            "started_at": None,
            "completed_at": None
        }
        return job_id

    def set_running(self, job_id: str):
        if job_id in self._jobs:
            self._jobs[job_id]["status"] = "Running"
            self._jobs[job_id]["started_at"] = datetime.utcnow().isoformat()

    def update_progress(self, job_id: str, records_processed: int, total_records: Optional[int] = None):
        if job_id in self._jobs:
            job = self._jobs[job_id]
            job["records_processed"] = records_processed
            if total_records is not None:
                job["total_records"] = total_records
            if job["total_records"] > 0:
                job["progress_pct"] = round(min(100.0, (records_processed / job["total_records"]) * 100.0), 1)

    def set_completed(self, job_id: str, result: Dict[str, Any]):
        if job_id in self._jobs:
            job = self._jobs[job_id]
            job["status"] = "Completed"
            job["progress_pct"] = 100.0
            job["result"] = result
            job["completed_at"] = datetime.utcnow().isoformat()

    def set_failed(self, job_id: str, error_message: str):
        if job_id in self._jobs:
            job = self._jobs[job_id]
            job["status"] = "Failed"
            job["error"] = error_message
            job["completed_at"] = datetime.utcnow().isoformat()

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._jobs.get(job_id)

    def list_jobs(self, limit: int = 20) -> List[Dict[str, Any]]:
        jobs = list(self._jobs.values())
        return sorted(jobs, key=lambda x: x["created_at"], reverse=True)[:limit]

job_tracker = BackgroundJobTracker()
