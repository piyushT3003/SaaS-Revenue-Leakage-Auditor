# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-22

The first release. It covers the complete specification (14 phases) and the production-hardening work.

### Core
- **Imports:** 14 datasets, each with validation, column mapping, duplicate detection, confirm-before-store, rollback and row-level lineage.
- **Calculation engine:** `Decimal` arithmetic throughout, covering effective-dated contract versions, proration, tiers, allowances, minimum commitments and MRR.
- **Reconciliation:** separate billing and payment reconciliation; results are append-only.
- **Exceptions:** eight anomaly categories, with an exception lifecycle, evidence, deduplication and an investigation workflow.
- **Pages:** nine pages, all deep-linked; role-based access (admin / analyst / viewer).

### Advanced modules
- Historical replay (AS_KNOWN / CURRENT)
- Revenue Evidence Graph
- Usage Meter Integrity
- Billing Rules Regression Lab, with separation of duties
- Root-cause analysis
- Leakage prioritization
- What-If simulator, with results stored as hypothetical
- Tamper-evident evidence packs
- An AI Investigation Assistant that uses read-only registered tools

### Analytics
- PostgreSQL reporting schema and a read-only `powerbi_reader` role.
- DAX measures, Power Query files, analytical SQL and executed notebooks.

### Experience
- Premium 3D layer: galaxy background, revenue globe, AI core, 3D evidence graph, health gauge, extruded donut, flip KPI cards, customer galaxy, money-flow tunnel and audit scan.
- Every 3D view has a 2D fallback, and the reduced-motion setting is honoured.
- Responsive shell: full sidebar, collapsible rail, mobile drawer.
- WCAG 2.1 A/AA checked automatically on every page.

### Accounts and operations
- **Accounts:** change password; password reset by email or by an admin-issued one-time link; idle sign-out; a login throttle shared through the database.
- **Demo:** a read-only demo mode that needs no sign-in.
- **First run:** a "Get started" guide for empty workspaces.
- **Recovery:** audits interrupted mid-run are marked failed and can simply be run again.
- **Scheduling:** a daily job audits last month automatically and prunes expired records.
- **Monitoring and alerts (optional):** email alerts for failed audits and new high-severity exceptions; Sentry error monitoring through a same-origin tunnel.
- **Privacy:** privacy notice and terms pages; admin export of all company data, and a guarded erase.

### Deployment and quality
- **Deployment:** one-click Windows launcher, Docker Compose, and Vercel + Neon configuration.
- **Backups:** encrypted weekly backups with a tested restore procedure.
- **CI:** backend tests, frontend checks, dependency audits and the browser E2E suite run on every push; Dependabot handles updates.
