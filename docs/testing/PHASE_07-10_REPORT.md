# Phases 7–10 — Advanced Revenue Assurance Modules

Status: **implemented and tested in the development workspace** (PostgreSQL 16, FastAPI, React 19 / Vite 8).
Not a production-readiness claim.

## What was built

| Module | Backend | API | UI |
|---|---|---|---|
| Historical Audit Replay | `replay/asof.py` (knowledge cut-off session hook), `runner.create_replay` | `POST /audits/{id}/replay {mode}` | Reconciliation → **Replay** (holographic timeline, completeness banner, before/after) |
| Revenue Evidence Graph | `evidence_graph/graph.py` | `GET /evidence-graph?exception_id|obligation_id|customer_id` | Exceptions → **Evidence Graph**, exception drawer → **Trace evidence graph** (lane layout, zoom/fit, record inspector) |
| Usage Meter Integrity | `usage_integrity/monitor.py` | `GET /usage-integrity`, `POST /usage-integrity/batches/{id}/reprocess` | Data Management → **Usage Meter Integrity** |
| Billing Rules Regression Lab | `regression/lab.py` | `/rules`, `/rules/{id}/propose`, `/regression/suites` (+ detail, decision, activate) | Settings → **Billing Rules** |
| Root Cause Analysis | `root_cause/analysis.py` | `GET /root-cause`, `POST /root-cause/confirm` | Exceptions → **Root Cause** |
| Leakage Prioritization | `analytics/prioritization.py` | `GET /prioritization` | Exceptions → **Prioritize** (score breakdown per factor) |
| What-If Simulator | `simulation/simulator.py` | `/simulations` (preview, CRUD, duplicate, run, export XLSX) | Unit Economics → **What-If Simulator** |
| Evidence Packs | `exports/evidence_pack.py` | `POST/GET /evidence-packs`, `/evidence-packs/{id}/download` | Exceptions → **Evidence Pack** (PDF/XLSX + SHA-256) |

Migration `0003_replay_support` adds `invoices.voided_at` and allocation reversal columns so corrections are append-only and replayable.

## Guarantees enforced in code (and tested)

- **Replay never rewrites history.** An AS_KNOWN replay hides rows created after the original audit completed and undoes later voids / allocation reversals. It reports itself **incomplete** if any record was edited in place afterwards. Replays never create or reopen exception cases.
- **Rules never activate automatically.** A proposed version is ignored by audits until it passes a regression suite, is submitted, is approved by a *different* user holding `rules:approve`, and is activated from an explicit effective date. The previous version is end-dated (RETIRED) rather than overwritten, so earlier periods are still priced with the rule in force at the time.
- **Simulations are hypothetical.** Pricing changes are applied to transient rule clones. The request is rolled back. Results are stored with `is_hypothetical = true`, and the XLSX export is headed "HYPOTHETICAL SCENARIO".
- **No double counting.** Root-cause blast radius counts each `exposure_key` once.
- **No unfounded completeness claims.** Missing usage is reported only when the source sent control totals or sequence numbers. Lateness is judged from the batch's reported `received_at`, never from our own load time.
- **Evidence packs are tamper-evident.** A SHA-256 hash is recorded at generation, and the downloaded bytes are checked against it in the tests.

## Test evidence

`pytest`: **64 passed** (57 earlier + 7 new in `backend/tests/test_advanced.py`):

1. AS_KNOWN replay after an invoice correction reproduces the original ₹2,000 underbilling. CURRENT replay shows ₹0. The original run is unchanged, and no exceptions are created.
2. Replay validation: bad mode → 422, viewer → 403, unknown run → 404.
3. Evidence graph links exception → obligation → contract version → pricing rule → subscription → customer, with no dangling edges.
4. Usage integrity detects the injected September control-total gap (+37 events) and blocks reprocessing until it is reconciled.
5. Regression lab: a +10% price proposal flags the ₹1,000 change. Self-approval and analyst approval are refused. A second admin approves and activates from 1 Nov. October is still priced at the old rule.
6. Simulator: preview equals the stored run, duplicate and XLSX export work, `pricing_rules` is byte-identical before and after, and unknown assumptions → 422.
7. Root cause unique exposure ≤ gross, priority scores are 0–100 and sorted, evidence pack PDF hash matches, viewer cannot generate.

Frontend: `tsc --noEmit` clean, Vitest 5/5, production build OK. Each new screen was exercised end-to-end in headless Chrome against the seeded demo (replay run, priority list, root cause, evidence graph, simulation +10%, usage integrity, rules lab).

## Fixes made during verification

- The login throttle tripped in the faster test suite → conftest now resets the per-process window per test (the throttle itself is unchanged).
- After a replay, the reconciliation page selected the replay as the default run → the default now prefers the original (non-replay) audit.
- Drawers did not close on Escape → added, for keyboard accessibility.
- The usage monitor flagged historical bulk loads as "late arrival" → it now uses the source-reported delivery time.
