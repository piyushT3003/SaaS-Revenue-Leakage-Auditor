# Architecture

**Shape.** A modular monolith with a FastAPI backend, PostgreSQL 16 and a React/Vite frontend (to be rebuilt in Phase 6 and Phase 13). There are no microservices.

```
backend/app/
  core/            config (env-only secrets), database/session, money (Decimal), JSON logging + request IDs
  security/        bcrypt passwords, JWT + server-side session registry (revocable), role→permission matrix
  models/          SQLAlchemy 2 models — 40 tables in 4 layers (below)
  ingestion/       dataset specs + upload → identify → map → validate → confirm → rollback pipeline
  analytics/       calculation.py (pure expected-charge engine) · metrics.py (the only KPI implementation)
  reconciliation/  terms loader · obligations builder · readiness · billing matcher · payment reconciler · runner
  services/        tenancy/bootstrap/audit-trail/notifications · data fingerprint
  seed/            deterministic synthetic demo dataset with ground truth
  api/             auth · imports · audits · metrics  (more routers arrive with later phases)
backend/migrations/  Alembic (0001 = full schema + immutability triggers)
backend/tests/       pytest against a real PostgreSQL test database
```

## Data layers
| Layer | Tables | Rule |
|---|---|---|
| Raw | `import_batches`, `import_rows` | The original row values are kept for every upload. |
| Operational | customers, products, contracts, contract_versions, pricing_rules, subscriptions, product_costs, usage_batches, usage_events, invoices, invoice_lines, invoice_line_allocations, payments, payment_allocations, credit_adjustments | Each record carries `source_batch_id` + `source_row_number` (lineage) and `tenant_id`. |
| Calculated | audit_runs, billing_obligations, billing_obligation_components, reconciliation_results, payment_reconciliation_results | Append-only. DB triggers reject UPDATE/DELETE on results, and a finalised audit run cannot change. |
| Investigation / advanced | exceptions, exception_evidence, investigation_notes, exception_status_history, root_cause_investigations, simulation_*, regression_test_*, evidence_packs | The schema is in place. Services arrive in Phases 5–10. |
| Governance | tenants, roles, users, user_sessions, audit_logs (append-only), notifications, jobs, synthetic_ground_truth | |

## Audit pipeline (`reconciliation/runner.py`)
1. `POST /audits` creates a QUEUED run with a unique `run_code` and the source **data fingerprint**. An identical request on unchanged data returns the existing run, so requests are idempotent.
2. A background job sets the run to RUNNING, committed on its own so the UI can see it. All results are then written in **one transaction**, so a run is either complete or absent. Transient DB errors are retried up to 3 times. Any other failure marks the run FAILED with the reason.
3. **Readiness.** Excluded obligations, invoice presence, usage-batch coverage, control totals and pending imports are checked and stored on the run.
4. **Obligations.** Stable keys `OBL-…` are upserted. Per-run components hold the formula, the contract version and the pricing rule used.
5. **Billing match** priority: allocation rule → explicit obligation reference → subscription + period → product + period, used only when unambiguous. Ambiguous matches become PENDING_REVIEW.
6. **Payment reconciliation** runs independently, covering invoice cohort balances, ageing and payment-level discrepancies.
7. **Totals and summary** are written, and the run is marked COMPLETED or COMPLETED_WITH_EXCLUSIONS. A notification and audit-log entry are created.

**Staleness.** Dashboards compare the stored fingerprint with the current one and say so when results no longer reflect the data.
