# SaaS Revenue Assurance: End-to-End Defect and Verification Audit Report
**Contract-to-Cash & Customer Unit Economics Auditor**

---

## 1. Defects Found

### 1.1 Financial Calculation Engine & Anomaly Detection Pipeline
1. **Double Counting of Missing Charges & Unbilled Usage (Scenario 4)**: 
   - *Issue*: When unbilled usage events existed alongside missing invoice line items, both `_detect_contract_invoice_discrepancies` and `_detect_unbilled_usage` flagged the financial impact, inflating leakage by 2x.
   - *Root Cause*: Lack of mutual cross-detection suppression between invoice line checking and usage aggregation.
2. **Non-Idempotent Exception Generation (Scenario 11)**:
   - *Issue*: Re-running anomaly detection repeatedly inserted duplicate `ExceptionRecord` rows into the database, skewing KPIs and metrics.
   - *Root Cause*: No unique fingerprinting mechanism on `(customer_id, issue_type, fingerprint_key)`.
3. **Reconciliation Auto-Pollution of Audit History**:
   - *Issue*: Calling `GET /reconciliation` created a permanent `ReconciliationRun` record in the database, meaning simple read-only queries distorted historical run metrics.
   - *Root Cause*: Reconciler always persisted run records without checking execution mode (`record_run=False` vs `POST /run`).
4. **Hardcoded Overview Dashboard Aggregations (Scenario 12)**:
   - *Issue*: The Executive Overview API returned hardcoded arrays for `exceptions_by_type`, `customer_profitability`, and `revenue_trends`, ignoring live database records and `customer_id` filter queries.
   - *Root Cause*: Static mock lists inside `backend/app/api/overview.py`.

### 1.2 Data Management, Ingestion & Batch Lifecycle
5. **No Intra-File or Database Duplicate Checking on Ingestion (Scenario 10)**:
   - *Issue*: Uploading files containing duplicate records or re-uploading an existing file inserted duplicated usage events, customers, and invoices.
   - *Root Cause*: Validation was pure schema type-checking without deduplication checks against existing DB identifiers or intra-batch duplicate sets.
6. **Non-Functional Batch Import & Rollback**:
   - *Issue*: `POST /data-management/confirm-import` and `POST /data-management/rollback` did not persist actual entities or delete them atomically.
   - *Root Cause*: Absence of `accepted_records_json` and `inserted_ids_json` on `UploadBatch`.

### 1.3 Billing & Cash Allocation Engine
7. **Missing FIFO Unallocated Payment Allocation**:
   - *Issue*: Unallocated payments without an explicit `invoice_id` failed or remained orphan without waterfalling across open invoices by due date.
   - *Root Cause*: Missing FIFO logic in `record_payment`.

### 1.4 Frontend Controls & Visual Integration
8. **Reconciliation Perspective Tabs Not Filtering Columns**:
   - *Issue*: All 4 tabs on the Reconciliation page showed identical headers, lacking tailored perspectives for "Contract vs Usage", "Usage vs Invoice", and "Invoice vs Payments".
9. **Dead "Generate Draft Invoice" Control**:
   - *Issue*: Clicking "Generate Draft Invoice" in Billing & Invoicing had no modal, line item builder, or tax engine.
10. **Disconnected Cross-Page Drill-downs**:
    - *Issue*: Customer Unit Economics table rows were not clickable, and AI Assistant recommendations lacked direct links to Customer and Exception detail views.
    - *Issue*: Header profile menu items ("Account Profile", "Role Permissions") were non-functional.

---

## 2. Defects Fixed

1. **Deterministic Fingerprinting & Deduplication**:
   - Added `fingerprint` column with SHA-256 hash `(customer_id:issue_type:fingerprint_key)` to `ExceptionRecord`.
   - Before inserting any exception, `_persist_exception` checks for an existing open or resolved exception with the identical fingerprint. Returns `(exc, False)` on duplicates.
2. **Mutual Exclusion for Unbilled Usage**:
   - In `_detect_contract_invoice_discrepancies`, if invoice lines are missing and unprocessed `UsageEvent` records exist, Underbilling yields to `_detect_unbilled_usage` to prevent double-counting.
3. **Execution-Separated Reconciliation Runs**:
   - Added `record_run: bool = False` flag to `ReconciliationEngine.execute_reconciliation`. Only manual trigger `POST /reconciliation/run` creates a `ReconciliationRun` entity.
4. **Dynamic Executive Overview Queries**:
   - Replaced static lists with dynamic SQLAlchemy queries aggregating `exceptions_by_type`, `customer_profitability` (MRR, Costs, Margins), and `revenue_trends`, with full support for `customer_id` cross-filtering.
5. **Universal Ingestion Deduplication & Rollback**:
   - `validate_file_upload` now parses multi-model datasets (`Usage`, `Customers`, `Invoices`, `Payments`, `DirectCosts`), flags duplicates, and stores validated JSON payloads in `UploadBatch.accepted_records_json`.
   - `confirm_batch_import` writes actual records and stores generated IDs in `batch.inserted_ids_json`.
   - `rollback_batch` atomically deletes the records by recorded IDs and sets batch status to `Rolled Back`.
6. **FIFO Waterfall Payment Engine**:
   - In `record_payment`, if `invoice_id` is empty, payment cascades across unpaid invoices ordered by `due_date ASC`, updating `paid_amount`, status (`Paid` / `Partially Paid`), and generating `PaymentAllocation` records.
7. **Tailored Reconciliation Perspectives**:
   - Built custom table view states for all 4 tabs with column perspectives:
     - *Contract vs Usage*: Contract Volume, Usage Units, Overage Rate, Exposure.
     - *Usage vs Invoice*: Usage Quantity, Invoiced Quantity, Discrepancy Amount.
     - *Invoice vs Payments*: Total Invoiced, Amount Collected, Outstanding Balance, Aging.
     - *Full Reconciliation*: End-to-end multi-way reconciliation overview.
8. **Draft Invoice Creation Modal**:
   - Added a full modal in `BillingPage.tsx` with dynamic line items (Fixed, Usage, One-Off), quantity and unit price inputs, 18% GST automatic calculation, and API integration.
9. **Interactive Drill-Downs & Navigation**:
   - Customer Economics rows navigate to `/customers?id=...`.
   - AI Assistant provides direct navigation buttons to `/customers?id=...` and `/exceptions?id=...`.
   - Header profile menu items route to `/settings`.

---

## 3. Database Schema Modifications

| Table Name | Column Name | Type | Description |
| :--- | :--- | :--- | :--- |
| `exceptions` | `fingerprint` | `VARCHAR(64)` | SHA-256 unique fingerprint for anomaly idempotency. |
| `upload_batches` | `accepted_records_json` | `TEXT` | Stores validated records staging payload for confirmation. |
| `upload_batches` | `inserted_ids_json` | `TEXT` | Stores primary keys of inserted entities for atomic rollback. |

---

## 4. Verification & Automated Test Results

- **Backend Pytest Suite**: **36 / 36 tests passed** (11.40s)
  - `backend/tests/test_financial_engine.py`: 9 passed
  - `backend/tests/test_anomaly_detector.py`: 4 passed
  - `backend/tests/test_api_endpoints.py`: 9 passed
  - `backend/tests/test_scenarios_1_to_12.py`: 14 passed
- **Frontend Vitest Suite**: **7 / 7 tests passed** (2.24s)
- **Frontend Vite Production Build**: **Successfully compiled and bundled in 1.25s** with zero errors.
