# Final Implementation Report — SaaS Revenue Assurance

**Product:** Contract-to-Cash & Customer Unit Economics Auditor
**Specification:** `docs/PRODUCT_MASTER_SPECIFICATION.md`, the single source of truth. This report follows its §21 structure.
**Date:** 22 November 2026

**Status**
- All 14 phases are implemented.
- They are verified in a development environment (Linux, Python 3.13, PostgreSQL 16, headless Chrome) and on the owner's Windows machine via `START_APP.bat`.
- This report claims nothing beyond the evidence listed. Production readiness is **not** claimed; see §11.

---

## 1. Completed modules

| Phase | Scope | Evidence |
|---|---|---|
| 1 | Architecture, PostgreSQL, authentication (httpOnly-cookie JWT, server-side session revocation), role-based access control (admin / analyst / viewer), shared UI shell | `test_ingestion_and_api.py`, E2E `auth.spec.ts` |
| 2 | Import of 14 datasets with column detection, mapping, row validation, duplicate detection, confirm-before-store, rollback and row lineage; synthetic dataset with planted ground truth | `test_ingestion_and_api.py` |
| 3 | Central calculation engine (`Decimal` only): proration, effective-dated contract versions, tiers, allowances, minimum commitments, MRR | `test_calculation_engine.py` |
| 4 | Billing reconciliation and payment reconciliation as separate engines | `test_reconciliation.py`, `test_ground_truth.py` |
| 5 | Eight anomaly categories; exception lifecycle, evidence and deduplication | `test_exceptions.py`, `test_ground_truth.py` |
| 6 | Executive Overview and the other eight pages, all wired to the API | `test_pages_api.py`, E2E navigation |
| 7 | Revenue Evidence Graph and historical replay (AS_KNOWN / CURRENT) | `test_advanced.py`, E2E investigation |
| 8 | Usage Meter Integrity and the Billing Rules Regression Lab | `test_advanced.py` |
| 9 | Root-cause analysis and leakage prioritization | `test_advanced.py`, E2E |
| 10 | What-If Simulator and evidence packs (PDF/XLSX + SHA-256) | `test_advanced.py`, E2E |
| 11 | AI Investigation Assistant: read-only registered tools; optional LLM planner | `test_ai_assistant.py`, E2E `ai-and-rbac.spec.ts` |
| 12 | Power BI layer: reporting views, snapshots, read-only role, DAX, Power Query, SQL, notebooks | `test_reporting.py`, `analytics/` |
| 13 | Premium 3D and motion layer with 2D fallbacks | §9 |
| 14 | Integration tests, full-workflow E2E, accessibility, performance and recovery tests, security review | §10, `docs/testing/`, `docs/security/SECURITY_REVIEW.md` |
| Post-14 | Account security and first-run readiness (details below) | `test_account_security.py`, E2E `account.spec.ts`, `docs/deployment/VERCEL.md` |
| v1.0 operations | CI, backups, scheduling, alerts, monitoring, data rights (details below) | `.github/workflows/`, `test_cron.py`, `test_monitoring.py`, `test_data_rights.py`, `docs/operations/` |

The post-14 work covers:
- **Passwords:** change password; reset by email or by an admin-issued one-time link.
- **Sessions and sign-in:** idle sign-out; a database-backed login throttle; an optional read-only demo, including a demo mode that opens it without signing in.
- **First run:** a **Get started** guide for an empty workspace.
- **Hosting:** serverless options (inline audits, per-request connections, a built SPA served by the API process) and Vercel configuration.

The v1.0 operations work covers:
- **CI:** GitHub Actions run the backend tests, frontend checks, dependency audits and the browser E2E suite on every push. Dependabot opens weekly update pull requests.
- **Backups:** encrypted (AES-256) weekly backups, with a restore procedure tested end to end.
- **Scheduling:** a secret-protected daily job audits last month once it has closed and prunes expired records.
- **Alerts:** email alerts for failed audits and new high-severity exceptions, sent only after commit and only when switched on.
- **Monitoring:** optional Sentry error reporting through a same-origin tunnel, with personal data scrubbed. A React error boundary keeps one broken view from blanking the app.
- **Data rights:** public privacy notice and terms pages; admin export of all company data (no secrets) and a guarded erase (password plus typed phrase, one transaction).

The nine pages, all deeply linked to each other:
1. Overview
2. Reconciliation
3. Exceptions
4. Customers (plus a customer profile)
5. Billing & Payments
6. Unit Economics
7. AI Investigation
8. Data Management
9. Settings

## 2. Technologies actually used

**Backend**
- Python 3.13 (also runs on 3.14), FastAPI, SQLAlchemy 2, Alembic, Pydantic 2.
- psycopg 3 and PostgreSQL 16.
- PyJWT and bcrypt for authentication.
- pandas and openpyxl for imports and XLSX; ReportLab for PDF.
- pytest for tests.

**Frontend**
- React 19, TypeScript, Vite 8, Tailwind CSS 3, Framer Motion, TanStack Query.
- React Hook Form and Zod for forms; Recharts and Lucide for charts and icons; sonner for toasts.
- Three.js, @react-three/fiber, drei and postprocessing for 3D.
- Vitest, Playwright and axe-core for tests.

**Analytics:** PostgreSQL views, DAX, Power Query M and Jupyter (pandas).

**Runtime**
- Docker Compose (`docker-compose.yml`, backend and frontend Dockerfiles, nginx with CSP).
- A Windows launcher (`START_APP.bat`) that falls back to a conda-installed PostgreSQL when Docker is absent.

## 3. Database schema and migrations

**Migrations** (`backend/migrations/versions/`)

| # | Migration | Adds |
|---|---|---|
| 0001 | initial schema | All core tables; immutability triggers on results and on finalised audit runs |
| 0002 | tenant settings | Per-tenant settings |
| 0003 | replay support | `invoices.voided_at`; allocation-reversal columns, so corrections are append-only and replayable |
| 0004 | AI assistant | Conversations and messages |
| 0005 | reporting layer | `reporting` schema with 10 views and 2 snapshot tables, plus the `powerbi_reader` role |
| 0006 | account security | `password_reset_tokens` (stores hashes only), `login_attempts` (shared throttle), `user_sessions.last_seen_at` (idle timeout) |
| 0007 | erasure bypass | Immutability triggers allow DELETE only inside a transaction that sets `sra.erasure = 'on'` (used solely by the admin erase action); UPDATEs remain impossible |

**Tables** (46 in `public`)

| Area | Tables |
|---|---|
| Identity and tenancy | tenants, tenant_settings, users, roles, user_sessions, password_reset_tokens, login_attempts, audit_logs, notifications, jobs |
| Reference data | customers, products, contracts, contract_versions, pricing_rules, subscriptions, product_costs |
| Transactions | usage_batches, usage_events, invoices, invoice_lines, payments, payment_allocations, credit_adjustments |
| Import | import_batches, import_rows (lineage: every stored record keeps `source_batch_id` and `source_row_number`) |
| Audit and reconciliation | audit_runs, billing_obligations, billing_obligation_components, reconciliation_results, invoice_line_allocations, payment_reconciliation_results |
| Exceptions | exceptions, exception_evidence, exception_status_history, investigation_notes |
| Advanced modules | root_cause_investigations, regression_test_suites, regression_test_results, simulation_scenarios, simulation_results, evidence_packs |
| AI | ai_conversations, ai_messages |
| Test data | synthetic_ground_truth |

**Reporting schema**
- Views: `dim_customer`, `dim_product`, `dim_date`, `latest_audit`, `fact_reconciliation`, `fact_receivable`, `fact_payment_issue`, `fact_exception`, `fact_invoice_line`, `fact_payment`.
- Snapshot tables: `customer_economics_monthly`, `product_economics_monthly`.

**Integrity rules**
- Money is stored as `NUMERIC` and serialised as exact strings.
- Database triggers reject any UPDATE or DELETE on results, and on audit runs once they are finalised.

## 4. APIs implemented

There are 114 endpoints under `/api/v1`, plus `/api/health/live` and `/api/health/ready`. They are documented interactively at `/docs` (Swagger UI, served locally under the CSP).

| Router | Endpoints | Highlights |
|---|---|---|
| auth | 8 | options, login, read-only demo login, logout (revokes the session), me, change password, forgot password, reset password |
| imports | 10 | datasets, upload/validate, rows, remap, confirm, rollback, sources, CSV templates |
| audits | 8 | readiness, start (idempotent), history (with stuck-run recovery), run detail, results, result detail, payment results, compare runs |
| metrics | 4 | KPI summary with basis, formula and deltas; contribution; definitions; reference data |
| exceptions | 7 | summary, list/filter, detail with evidence, assign, status workflow, notes, assignee list |
| overview | 6 | trend, profitability, global search, audit index, executive report (PDF/XLSX), onboarding status |
| customers | 4 | list with economics, summary, compare, profile |
| billing | 14 | invoices, PDF, draft invoice, issue, authorised correction (void & reissue), payments, allocation, credits (second-person approval) |
| unit_economics | 6 | summary, trend, customer / product / segment economics, cost breakdown |
| admin | 15 | settings, users, roles, one-time reset link, audit log, notifications, reporting status and refresh, company data export and erase |
| cron | 1 | daily job (secret-protected; not in the public schema) |
| monitoring | 1 | browser error-report tunnel (only to the configured Sentry project) |
| advanced | 25 | replay, evidence graph, usage integrity, rules and regression suites, root cause, prioritization, simulations, evidence packs |
| ai | 5 | status, ask, list / read / delete conversations |

## 5. Business workflows verified

The specification's end-to-end test is automated in a single browser session (`frontend/e2e/workflow.spec.ts`). The step-by-step workflow descriptions are in `docs/workflows/WORKFLOWS.md`.

| Spec step | Covered by |
|---|---|
| Login | `workflow.spec.ts`, `auth.spec.ts` |
| Upload reference data, then usage and transaction data; validate; import | `workflow.spec.ts`: customers, invoices, invoice lines and payments are uploaded, validated, then confirmed |
| Configure scope and run an audit | `workflow.spec.ts`; scope filtering in `test_reconciliation.py::test_scope_filters_customers` |
| Inspect reconciliation | `workflow.spec.ts` |
| Investigate an exception | `workflow.spec.ts`, `investigation.spec.ts` |
| View the Revenue Evidence Graph | `investigation.spec.ts` |
| Review audit history; run a historical replay | `investigation.spec.ts`; `test_advanced.py` |
| Test a proposed pricing rule | `test_advanced.py` (regression lab, separation of duties, no auto-activation) |
| Run a What-If scenario | `investigation.spec.ts`, `test_advanced.py` |
| Review customer profitability | `workflow.spec.ts` (customer search), `test_pages_api.py` |
| Ask the AI assistant | `ai-and-rbac.spec.ts`, `test_ai_assistant.py` |
| Generate an evidence pack | `test_advanced.py` (hash verified) |
| Record a valid correction; run a new audit; compare both runs | `workflow.spec.ts` (void & reissue → re-audit → compare dialog), `test_pages_api.py` |
| Export the report | `workflow.spec.ts` (XLSX download) |
| Verify cross-page updates | `workflow.spec.ts` (an imported customer appears in Customers); `test_reporting.py` (Power BI views equal the stored audit; snapshot margin equals the dashboard) |

## 6. Financial calculations tested

| Spec test | Expected | Test |
|---|---|---|
| 1–3 | Matched; under-billing ₹2,000; over-billing ₹2,000 | `test_spec_tests_1_2_3_expected_vs_invoiced` |
| 4 | Discount drift (10% → 15%) | `test_spec_test_4_discount_drift` |
| 5 | Pricing mismatch (₹500 → ₹600) | `test_spec_test_5_pricing_mismatch` |
| 6 | Outstanding ₹3,000 | `test_spec_test_6_outstanding_balance` |
| 7 | Contribution ₹3,000, margin 30% | `test_spec_test_7_contribution_and_margin` |
| 8 | No duplicates on re-upload | `test_spec_test_8_repeated_identical_upload_creates_no_duplicates` |
| 9 | No duplicate exceptions on re-audit | `test_spec_test_9_*` (two tests) |
| 10 | Effective-dated contract change in a period | `test_spec_test_10_contract_change_inside_period` |
| 11 | Correction + re-audit; history unchanged | `test_spec_test_11_correction_rerun_keeps_history_immutable`, replay test |
| 12 | Usage control-total warning | `test_usage_integrity_reports_control_total_gap_*` |
| 13 | Rule regression flags affected cases | `test_regression_lab_flags_changed_cases_*` |
| 14 | Root cause without double counting | `test_root_cause_prioritization_and_evidence_pack` |
| 15 | What-If leaves actual records unchanged | `test_simulation_is_hypothetical_*` |

Further coverage:
- Proration, quarterly multipliers, version gaps (excluded with a reason, never guessed), graduated and volume tiers, allowances, minimum-commitment true-up and MRR normalisation.
- Detection accuracy on the synthetic dataset, against 34 planted anomalies: **precision = recall = 1.0 in all eight categories**. That figure is for synthetic data only.

## 7. Advanced features implemented

**Replay.** AS_KNOWN reproduces an audit using the data as it was known at the time. It hides later rows, undoes later voids and reports itself incomplete if anything was edited in place. Originals are never modified.

**Evidence graph.** It is built from actual foreign-key relationships: exception → obligation → contract version → pricing rule → subscription → customer, plus invoice and payment.

**Usage integrity.** It uses source-supplied control totals and sequence numbers, and judges lateness by the source's `received_at` time.

**Regression lab.** A proposed rule must pass a regression suite and be approved by a different admin. It activates only from an explicit effective date, and previous versions are end-dated, never overwritten.

**Root cause and prioritization.** Exposure is counted once per `exposure_key`. Each score is 0–100 with a per-factor breakdown.

**What-If simulator.** It runs on transient rule clones inside a rolled-back transaction. Results are stored flagged as hypothetical, and the XLSX export is headed "HYPOTHETICAL SCENARIO".

**Evidence packs.** PDF or XLSX, with a SHA-256 hash that the download is verified against.

**AI assistant**
- It answers only through registered, argument-validated read-only tools, with no SQL access, and shows its provenance.
- It refuses requests to change data. Every question is logged.
- An optional LLM may only plan calls to those tools, and the deterministic engine is the fallback.

**Recovery.** Stuck audits are swept and marked failed with a reason. Transient database errors are retried.

## 8. Power BI deliverables

All under `analytics/`:
- **Reporting schema:** the views and snapshot tables (§3), refreshed after every audit and on demand by an admin.
- **Read-only access:** the `powerbi_reader` role; tests prove it cannot write.
- **Power BI files** in `powerbi/`: a step-by-step README, `measures.dax`, 12 Power Query (`.pq`) files and `theme.json`.
- **SQL:** 5 analytical SQL files.
- **Notebooks and findings:** 2 executed notebooks and `reports/ANALYTICS_FINDINGS.md`.
- **Not delivered:** a `.pbix` file. It has to be assembled in Power BI Desktop and **has not been tested** here.

## 9. 3D enhancements implemented

All 3D components are lazy-loaded and use canvas-texture labels.

Each falls back to a 2D equivalent when WebGL is unavailable or `prefers-reduced-motion` is set. The fallback is either the original 2D chart or a 2D version of the same content. Every amount shown comes from stored data.

| Component | Page | What it shows | 2D fallback |
|---|---|---|---|
| `GalaxyScene` | background | Shader spiral galaxy, starfield, planet with Fresnel atmosphere; pauses when the tab is hidden | static gradient |
| `RevenueGlobe` | sign-in | Network globe with contract-to-cash arcs | SVG |
| `HoloCore` | AI | Reactive core whose colour shows the assistant's state | CSS |
| `EvidenceGraph3D` | Exceptions | Orbitable 3D evidence graph | 2D graph (toggle) |
| `HealthGauge3D` | sidebar | Reconciliation-rate gauge | SVG ring |
| `Donut3D` | Overview | Extruded exception-type donut; hovered slice lifts; click filters | Recharts pie |
| Flip KPI cards | Overview | CSS 3D flip; the back shows formula, source and period | instant swap |
| `CustomerGalaxy3D` | Customers | One star per customer: size = MRR, colour = profitability, distance = margin; hover details, click opens the profile | margin × MRR scatter |
| `MoneyFlow3D` | Reconciliation | Particle tunnel Contract → Expected → Invoiced → Paid. Leaks drip red, over-billing violet, unpaid amber, collected green. Rates are proportional, with a disclosed visibility floor | bar comparison |
| `AuditScan3D` | Reconciliation | Indeterminate scanning beam while an audit is queued or running; no invented percentage | CSS scan stripe |

**Motion and shell**
- Depth page transitions and a once-per-session intro.
- Pointer spotlight borders, a magnetic primary button and shimmer titles.
- Skeleton loading and toast errors.
- A responsive shell: full sidebar, a collapsible icon rail below 1280 px, and a drawer below 900 px.

**Verification**
- Each scene was checked with software WebGL screenshots, and each fallback under reduced motion.
- Frame rate on real GPUs was **not** measured.

## 10. Automated test results (18 Nov 2026)

| Suite | Result |
|---|---|
| Backend pytest (dedicated `sra_test` database) | **108 passed**, 0 failed. Includes the full-dataset performance budget, recovery, account, scheduling, monitoring and data-rights tests |
| Frontend Vitest | 5 passed |
| Playwright E2E (Chrome against the running stack) | **29 passed**: 18 functional (including 5 account and privacy tests and 1 demo-mode test), 1 full spec workflow, 10 accessibility scans. Run in demo mode, in three batches. A subset also passed against the production build served by the API under the production CSP, the way CI runs it |
| Accessibility (axe-core, WCAG 2.0/2.1 A and AA) | Sign-in + nine pages: 0 serious or critical violations after fixes |
| Performance | Monthly audit on the full synthetic set: 0.95 s. Slowest page endpoint: 1.3 s (six-month trend). See `docs/testing/PERFORMANCE_ACCESSIBILITY_RECOVERY.md` |
| Detection accuracy (synthetic ground truth) | Precision = recall = 1.0 in all 8 categories |
| Reporting reconciliation | Views equal the stored audit totals for all 6 demo months |
| TypeScript / production build | Clean |
| Dependency audits | `npm audit` and `pip-audit`: 0 known vulnerabilities at the last run |

Fixes made during final verification:
- **Phase 14:** stuck-audit recovery; five accessibility defects (contrast, accessible names, hidden-focusable content).
- **Earlier:** logout cache order, modals trapped in drawers, missing security headers, spreadsheet formula injection, nginx header inheritance, bloom opacity, the reporting-role downgrade, and notebook wording.

## 11. Remaining limitations

**Not yet built**
1. **Power BI report file.** The `.pbix` has not been built or tested.
2. **Data integrations.** Data enters by file import only; there are no live billing, bank or payment connectors, and none are claimed.
3. **Currency.** Contracts in other currencies are excluded with a reason, because there are no FX rates.
4. **Single-company deployment.** There is no self-service sign-up for other companies.

**Account features**
5. **Email.** "Forgot password" by email needs an email provider (SMTP or Brevo) to be configured. Without one, admins issue one-time reset links.
6. **Two-factor authentication** is not implemented.

**Assumptions to check before going live**
7. **LLM mode** is verified only against a scripted provider. Review the data-processing terms before enabling it.
8. **Performance** figures come from a local database. Remote and serverless databases add latency, and no load test has been run.
9. **3D frame rate** is unmeasured on real GPUs.
10. **nginx config** syntax has not been validated by running nginx.

**Production hardening still to do**
11. **Hardening not done:** a secrets manager, log shipping to a SIEM, and an external penetration test. Point-in-time recovery is limited to Neon's own window; the encrypted weekly backups cover longer horizons.
12. **Hosted verification pending:** the Vercel deployment, cron, Sentry and uptime monitoring are configured but have not yet run on a live deployment.

## 12. Installation and deployment instructions

**Windows, no Docker**
- Run `START_APP.bat` from the project folder.
- It creates a private PostgreSQL in `.localdb` (port 5433), installs dependencies, migrates, seeds the demo and runs demo audits.
- It starts the API on 8085 and the web app on http://localhost:5185.
- VS Code: run `SETUP_VSCODE.bat` once to install the tasks, launch configurations and test settings.

**Docker**
- Copy `.env.example` to `.env` and set `JWT_SECRET` (32 or more characters) and `BOOTSTRAP_ADMIN_PASSWORD`.
- Run `docker compose up --build`.

**Manual**
1. **Backend:** `pip install -r backend/requirements.txt`.
2. **Database:** set `DATABASE_URL=postgresql+psycopg://…`, then run `alembic -c backend/alembic.ini upgrade head`.
3. **Demo data:** `python -m backend.app.seed.cli --demo-password <choose one> --run-audits`.
4. **Start the API:** `uvicorn backend.app.main:app --port 8085`.
5. **Frontend:** `cd frontend && npm ci && npm run dev`.

**Tests**
| Suite | Command |
|---|---|
| Backend | `PYTHONPATH=. python -m pytest` (uses `sra_test`, which it wipes) |
| Frontend unit | `npx vitest run` |
| E2E | `npx playwright test` against a running development stack. The workflow test adds uniquely-named records, so never run it against production |

**Production settings**
| Setting | Value |
|---|---|
| `ENVIRONMENT` | `production` (enforces a strong `JWT_SECRET` and no wildcard CORS) |
| `AUTO_MIGRATE` | `false` — run migrations in the deploy step instead |
| `SEED_DEMO_DATA_ON_START` | `false` |
| `CORS_ORIGINS` | the site's origin |

**Vercel + Neon:** see `docs/deployment/VERCEL.md`. The configuration is in the repository but has not yet been deployed; that guide lists what to verify on the first deploy.
