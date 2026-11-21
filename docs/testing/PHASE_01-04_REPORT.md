# Phases 1–4: completion report

Date: 2026-11-15 · Engine version 1.0.0 · Schema revision 0001

## What was built
| Phase | Delivered |
|---|---|
| 1. Architecture, database, auth | Modular-monolith layout; env-only configuration (the app refuses to start in production without a strong `JWT_SECRET` or with wildcard CORS); PostgreSQL-only engine with statement timeouts; Alembic migration for all 40 tables with keys, check constraints, indexes and append-only triggers; tenants/roles/users; bcrypt + JWT with revocable server-side sessions; server-side permission matrix; JSON logging with request IDs; consistent error handling. The shared UI shell is deferred to the frontend rebuild. |
| 2. Import, validation, synthetic data | 14 dataset specs; CSV/XLSX parsing with size/type limits; dataset auto-identification; column mapping with synonyms and re-mapping; type, enum, reference and date-order validation; duplicate detection within the file and against the database; rejection of an identical re-upload; explicit confirmation; per-record lineage; rollback with dependency checks. Deterministic synthetic dataset loaded through the same pipeline: 200 customers, 622 subscriptions, ~18.8k usage events, ~1.06k invoices, ~830 payments and 34 ground-truth anomalies. |
| 3. Financial engine | Pure, unit-tested expected-charge engine (`calculation.py`) and a central metric service (`metrics.py`) returning formula, period, currency, source, basis and as-of with every value. Covers MRR, outstanding, collection rate, contribution, margin and leakage. |
| 4. Reconciliation | Stable billing obligations, per-run calculation components, obligation-grain matching, 7 statuses plus unmatched-line review, independent payment reconciliation with ageing and 7 discrepancy codes, data readiness, background execution with retry, immutable results, idempotent reuse, data-fingerprint staleness, run comparison. |

## Verified by automated tests (44 passed, PostgreSQL 16)
| Spec test | Result |
|---|---|
| 1 Expected 10,000 / invoiced 10,000 → Matched | ✅ |
| 2 Invoiced 8,000 → Underbilling 2,000 | ✅ |
| 3 Invoiced 12,000 → Overbilling 2,000 | ✅ |
| 6 Invoice 12,000, payment 8,000, credit 1,000 → Outstanding 3,000 | ✅ (metric service and payment reconciliation) |
| 7 Revenue 10,000, costs 7,000 → Contribution 3,000, margin 30 % | ✅ |
| 8 Repeated identical upload → no duplicates | ✅ (file-hash refusal + row-level natural-key dedupe) |
| 9 Repeated identical audit → no duplicates | ✅ at audit level (same run reused, no duplicate results/obligations). The exception-level part arrives with Phase 5. |
| 10 Contract change inside a billing period | ✅ (engine unit test + end-to-end audit: 2,419.35 + 3,096.77) |
| 11 Correct a historical invoice and re-audit | ✅ (old run unchanged, new run MATCHED, same obligation identity) |
| 12 Usage control-total mismatch | ⚠️ Partial: the readiness warning names batch UB-STOR-202609. The full Usage Meter Integrity Monitor is Phase 8. |
| 4, 5, 13, 14, 15 | Belong to Phases 5, 8, 9 and 10 |

Additional checks that pass:
* the DB rejects UPDATE/DELETE on results and on finalised runs;
* viewers cannot import or run audits, and analysts cannot roll back;
* logout revokes the token;
* money serialises as exact strings;
* ambiguous matches go to PENDING_REVIEW;
* consolidated lines need an explicit allocation rule;
* a version gap or missing usage signal produces an exclusion with a reason, not a guess;
* reconciliation against ground truth over May–Oct 2026 gives precision 1.0 and recall 1.0 for billing discrepancies, and an exact match for payment discrepancies.

**Also verified manually.** I started the API with uvicorn and exercised it with curl: login → `POST /audits` (202) → background completion in about 1 s → `GET /metrics/summary` with deltas and separate revenue-health indicators.

## Known limitations at this point
* The **frontend is not rebuilt yet**. The existing `frontend/` targets the old API.
* The eight-category anomaly classification, exception cases, evidence and severity are Phase 5. Reconciliation statuses and evidence data are already in place for it.
* Tests ran on Linux / Python 3.13 / PostgreSQL 16, not yet on your Windows machine / Python 3.14.
* There are no FX rates. Contracts not in the base currency are excluded with a reason.
* Background jobs use FastAPI background tasks inside the API process, not a separate worker. A job is lost if the process restarts mid-run, and the run stays RUNNING. A recovery sweep is planned for Phase 14.
* The login throttle is in-memory (per process).
* Playwright and Vitest arrive with the frontend phases.
