# SAAS REVENUE ASSURANCE
# INTELLIGENT REVENUE INTEGRITY & FINANCIAL ANALYTICS PLATFORM

## 1. YOUR ROLE

Act as a principal software architect, senior full-stack engineer, financial analytics specialist, data engineer, PostgreSQL architect, GenAI engineer, product designer and QA engineer.

You are responsible for designing, developing, implementing, testing and integrating a complete enterprise-grade application.

Do not approach this as a simple dashboard development task.

Build a complete financial intelligence product with actual business workflows, a deterministic financial calculation engine, an advanced reconciliation system, explainable anomaly detection, customer profitability analytics, historical audit reconstruction, financial simulations and GenAI-powered investigation.

The final application must be suitable for a serious portfolio demonstration and must have the architecture, reliability and functionality expected of professional financial SaaS software.

Do not stop after generating a design, architecture document or frontend prototype. Actually implement the application in the available workspace.

==========================================================
2. PRODUCT IDENTITY AND CORE IDEA
==========================================================

PRODUCT NAME:

SaaS Revenue Assurance

PRODUCT SUBTITLE:

Contract-to-Cash & Customer Unit Economics Auditor

PRODUCT POSITIONING:

An intelligent revenue integrity and financial analytics platform for SaaS businesses.

CORE IDEA:

SaaS companies have customers with different contracts, subscription plans, pricing rules, discounts, usage allowances and billing cycles.

Their actual financial operations may not always match their contractual agreements.

Customers may consume services without being correctly billed. Incorrect pricing or discounts may be applied. Invoices may be duplicated. Payments may remain unallocated. A customer may generate substantial revenue while being expensive to serve.

Our platform independently analyses the financial lifecycle of each customer.

It reconstructs how much each customer should have been billed, compares this against actual invoice records, reconciles payment allocations, detects discrepancies, investigates financial exposure and calculates customer profitability.

It then uses GenAI to help business users understand these findings and make informed decisions.

THE PRODUCT SHOULD ANSWER SIX MANAGEMENT QUESTIONS:

1. How much revenue should the company have billed?
2. How much did it actually invoice?
3. Where are billing discrepancies and potential revenue leakage occurring?
4. How much cash has actually been collected and how much remains outstanding?
5. Which customers and products are financially profitable?
6. What should the finance or revenue operations team investigate or correct next?

IMPORTANT POSITIONING:

This is not another SaaS revenue dashboard or subscription management clone.

Build it as an independent financial auditing, revenue integrity, analytical control and investigation platform that can analyse exported data from different SaaS billing systems.

It does not need to replace payment processors, invoicing providers or subscription management platforms.

==========================================================
3. DESIGN REFERENCES AND VISUAL EXPERIENCE
==========================================================

Use all uploaded dashboard screenshots and page templates as the primary visual references.

The approved design should determine:
- Page layout.
- Component positions.
- Typography.
- Existing visual styling.
- Card dimensions.
- Navigation structure.
- Chart presentation.
- Borders and spacing.
- Visual hierarchy.

Do not invent a different visual system or arbitrarily recolour the supplied templates.

Do not use screenshots as flat background images. Recreate actual functional interface components.

The entire product must look like a highly polished enterprise financial intelligence platform.

The visual experience must feel sophisticated, cinematic, premium, futuristic and spatial without becoming distracting.

The interface must combine the supplied templates with advanced 3D depth, lighting, materials, movement and interaction.

==========================================================
4. COMPLETE TECHNOLOGY STACK
==========================================================

FRONTEND:

- React.
- TypeScript.
- Vite.
- React Router.
- Tailwind CSS and custom CSS.
- Framer Motion.
- React Query or TanStack Query.
- React Hook Form.
- Zod.
- Recharts.
- Lucide React.

3D AND VISUALIZATION:

- Three.js.
- React Three Fiber.
- Drei where appropriate.
- CSS 3D transforms.
- Framer Motion.
- React Flow or an appropriate graph visualization library for financial lineage.

Use Three.js selectively for high-value experiences such as the cosmic environment, signature AI visualization and interactive 3D financial graph.

Do not render every ordinary interface component in WebGL.

BACKEND:

- Python.
- FastAPI.
- Pydantic.
- SQLAlchemy 2.
- Alembic.
- Pandas.
- Python Decimal.

DATABASE:

- PostgreSQL.
- Proper relational modelling.
- Foreign keys.
- Indexes.
- Constraints.
- Transaction management.
- Versioned audit records.

AI:

- Configurable LLM API.
- Controlled analytical tool calling.
- Evidence-grounded responses.
- Read-only database access through approved services.

DATA ANALYTICS:

- PostgreSQL SQL.
- Python.
- Pandas.
- Excel.
- Power Query.
- Microsoft Power BI.
- DAX.

TESTING:

- Pytest.
- Vitest.
- Playwright.

INFRASTRUCTURE:

- Git and GitHub.
- Docker Compose for local services where appropriate.
- Environment-based configuration.
- Development and production configuration separation.
- Automated test and build checks.

Do not add unnecessary infrastructure or microservices. Use a modular monolith with well-defined internal services.

==========================================================
5. THE ENTIRE BUSINESS WORKFLOW
==========================================================

The application must follow one connected business lifecycle.

STAGE 1 — BUSINESS DATA ONBOARDING

Upload reference data:

- Customers.
- Products.
- Contracts.
- Historical contract versions.
- Pricing rules.
- Subscription plans.
- Subscriptions.
- Product cost information.

Upload transaction data:

- Usage events.
- Invoices.
- Invoice lines.
- Payments.
- Payment allocations.
- Credits.
- Adjustments.

STAGE 2 — VALIDATION AND NORMALIZATION

Inspect uploaded files.

Map columns.

Validate values and relationships.

Detect invalid and duplicate records.

Show accepted and rejected rows.

Require explicit confirmation before importing accepted records.

Maintain source file and import batch lineage.

STAGE 3 — DATABASE STORAGE

Store validated records in PostgreSQL.

Preserve original source records.

Maintain historical contract versions and effective dates.

Separate raw data, operational data and calculated analytical data.

STAGE 4 — DATA READINESS

Before an audit, check that the selected billing period has adequate data.

Validate customer references, contracts, subscriptions, pricing rules, usage and invoice records.

Display incomplete scopes and explain what is missing.

Do not silently produce a complete-looking audit from incomplete data.

STAGE 5 — EXPECTED CHARGE CALCULATION

For every eligible customer, subscription and billing period, reconstruct the amount the customer should have been billed.

Use the applicable contract version, pricing, allowances, usage, discount rules and proration.

Store the individual calculation components.

STAGE 6 — BILLING RECONCILIATION

Match expected billing obligations against actual invoice lines.

Identify matched, unmatched, partially matched and discrepant billing obligations.

STAGE 7 — PAYMENT RECONCILIATION

Separately reconcile issued invoices, applied credits, payment transactions and payment allocations.

Calculate correct outstanding balances.

STAGE 8 — ANOMALY DETECTION

Run eight explainable detection rules.

Calculate financial exposure.

Attach original supporting records.

Prevent double counting.

STAGE 9 — EXCEPTION MANAGEMENT

Create investigation cases from detected discrepancies.

Allow assignment, investigation notes, evidence review and documented resolution.

STAGE 10 — BUSINESS ANALYTICS

Refresh financial dashboards, customer insights, billing analytics and contribution margin calculations.

STAGE 11 — GENAI INVESTIGATION

Allow users to ask analytical questions and receive actual database-grounded answers.

STAGE 12 — BUSINESS CORRECTION

Allow authorized financial corrections through controlled workflows.

STAGE 13 — RE-AUDIT

Run a new audit using corrected records.

Compare the new results with previous immutable audit runs.

Show resolved, remaining and newly detected discrepancies.

This must be a genuinely functioning workflow.

==========================================================
6. DATABASE AND DATA MODEL
==========================================================

Create a normalized relational PostgreSQL database.

Required entities:

- users.
- roles.
- customers.
- products.
- contracts.
- contract_versions.
- pricing_rules.
- subscriptions.
- usage_events.
- usage_batches.
- invoices.
- invoice_lines.
- payments.
- payment_allocations.
- credit_adjustments.
- product_costs.
- import_batches.
- billing_obligations.
- billing_obligation_components.
- audit_runs.
- reconciliation_results.
- exceptions.
- exception_evidence.
- investigation_notes.
- root_cause_investigations.
- simulation_scenarios.
- simulation_results.
- regression_test_suites.
- regression_test_results.
- evidence_packs.
- notifications.
- audit_logs.

Use appropriate keys, constraints, relationships and indexes.

Preserve contract versions and pricing rule versions.

A historical calculation must be reproducible using the historical versions applicable at that time.

A billing obligation should have stable identifiers so it cannot accidentally be invoiced twice.

Each audit run must have a unique ID.

Each imported source record must maintain source lineage.

Use PostgreSQL NUMERIC and Python Decimal for financial values.

Do not use binary floating-point arithmetic for monetary calculations.

Generate a deterministic synthetic demonstration dataset with approximately 200 customers, multiple SaaS products, historical contracts, subscription records, usage events, invoices, payments, credits and product costs.

Use controlled anomalies with known ground-truth results for testing.

Clearly label all synthetic data as demonstration data.

Never make claims that synthetic results represent real company savings.

==========================================================
7. CENTRAL FINANCIAL CALCULATION ENGINE
==========================================================

Create a centralized, reusable financial calculation service.

Do not calculate the same KPI independently on different pages.

A. MRR

Calculate active recurring subscription value normalized to a monthly amount.

Consider subscription state, recurring prices, discounts, billing frequency and effective dates.

Keep MRR separate from total billed revenue and collected cash.

B. EXPECTED BILLABLE CHARGES

Calculate:

Base recurring charge
+ Applicable billable usage charge
+ Additional contractual charges
- Applicable discounts
+ Eligible adjustments.

Consider:
- Historical contract versions.
- Subscription effective dates.
- Billing cycle.
- Included usage.
- Tiered pricing.
- Per-unit pricing.
- Proration.
- Discounts.
- Currency.
- Contract amendments.

For contract changes occurring during a billing period, split calculation periods appropriately.

C. UNDERBILLING

Positive difference between eligible expected billable charges and comparable invoiced charges.

D. OVERBILLING

Positive difference between comparable invoiced charges and expected charges.

Keep overbilling separate from underbilling exposure.

E. REVENUE LEAKAGE

Calculate unique qualifying underbilling exposure.

Missing charges and unbilled usage may be explanations of the same underlying exposure. Do not count them multiple times.

F. OUTSTANDING BALANCE

Valid invoice total minus applied credits and allocated payments as of the relevant date.

Support partial payments.

G. COLLECTION RATE

Calculate cash applied to the selected collectible invoice cohort divided by its collectible value.

Clearly state the reporting basis and as-of date.

H. CUSTOMER CONTRIBUTION

Net billed service revenue minus allocated direct service costs.

I. CONTRIBUTION MARGIN

Contribution divided by net billed service revenue, multiplied by 100.

Document the direct-cost allocation methodology.

Do not claim formal accounting profit or recognized revenue unless the required accounting information exists.

Every metric must include its formula, time period, currency, source and calculation basis.

==========================================================
8. BILLING RECONCILIATION ENGINE
==========================================================

This is the central financial auditing engine.

For every billing obligation:

1. Retrieve the customer.
2. Retrieve the subscription.
3. Retrieve the product.
4. Retrieve the contract version effective during the period.
5. Retrieve relevant pricing rules.
6. Retrieve valid usage events.
7. Calculate expected charges.
8. Identify corresponding invoice lines.
9. Compare quantities and monetary values.
10. Store matching results and explanations.

MATCHING PRIORITY:

- Explicit billing obligation references.
- Customer ID.
- Subscription ID.
- Product ID.
- Billing period.
- Charge type.
- Contract reference.

Support legitimate consolidated and split invoice lines through explicit allocation rules.

If a match is ambiguous, mark it for review rather than inventing a relationship.

Every obligation must receive an appropriate status:

- Matched.
- Partially Matched.
- Underbilled.
- Overbilled.
- Missing Charge.
- Pending Review.
- Excluded with a reason.

Do not compare only customer-level invoice totals. Match at the appropriate billing obligation grain.

==========================================================
9. PAYMENT RECONCILIATION ENGINE
==========================================================

Process payment records independently from billing reconciliation.

Support:

- Full payment.
- Partial payment.
- Multiple payments for one invoice.
- One payment distributed across multiple invoices.
- Unallocated payments.
- Credit application.
- Duplicate transaction references.
- Incorrect allocation.
- Over-allocation.
- Invalid payment references.

Do not automatically classify ordinary overdue balances as payment discrepancies.

Do not pretend that manually recorded demonstration payments are bank-confirmed transactions.

Every payment and allocation must be traceable.

==========================================================
10. EIGHT ANOMALY DETECTION CATEGORIES
==========================================================

Implement deterministic and explainable financial rules.

01. UNDERBILLING:
Expected billable amount exceeds comparable invoice amount.

02. OVERBILLING:
Actual invoice amount exceeds applicable expected billing amount.

03. MISSING CHARGES:
A valid billing obligation has no corresponding charge.

04. DUPLICATE INVOICES:
The same billing obligation or charge is invoiced more than once.

05. DISCOUNT DRIFT:
Invoice discount differs from the contractual discount.

06. PRICING MISMATCH:
Invoice unit rate differs from the applicable contractual rate.

07. UNBILLED USAGE:
Billable usage events have not been matched to an appropriate invoice charge.

08. PAYMENT DISCREPANCY:
Invalid, duplicated, unmatched or incorrectly allocated payment records.

Each anomaly must include:
- Unique exception ID.
- Audit run ID.
- Customer.
- Affected contract or subscription.
- Billing period.
- Issue category.
- Financial impact.
- Severity.
- Source evidence.
- Calculation explanation.
- Current status.

Avoid duplicate exception creation during repeated audit runs.

Avoid double-counting the same underlying financial exposure.

Test precision, recall, F1 score and false-positive cases using ground-truth data.

==========================================================
11. NINE APPLICATION PAGES — COMPLETE FUNCTIONALITY
==========================================================

PAGE 01 — EXECUTIVE OVERVIEW

PURPOSE:
Give management an immediate view of financial health and revenue integrity.

HEADER ELEMENTS:

Logo:
Navigates to the overview.

Global Search:
Searches customers, contracts, invoices and exceptions.

Date Selector:
Updates the selected analytical period.

Notifications:
Displays actual system events and investigation updates.

Profile:
Shows the authenticated user and logout action.

Export:
Generates an actual filtered executive report.

KPI CARDS:

Total Revenue / MRR:
Shows the defined recurring revenue or selected revenue metric.

Revenue Leakage:
Shows unique underbilling exposure.

Outstanding Payments:
Shows valid unpaid invoice balances.

Active Customers:
Shows eligible customer count.

Contribution Margin:
Shows calculated customer-level financial contribution.

Every card must open its corresponding detailed analysis.

CHARTS:

Revenue Trend:
Expected versus invoiced values over the selected periods.

Exception Distribution:
Count and exposure by anomaly type.

Customer Profitability:
Profitable, at-risk and unprofitable customer segments.

All charts require actual data, tooltips, filters and relevant drill-down actions.

TABLES:

Recent High-Impact Exceptions:
Search, sort, filter and investigate actual cases.

REVENUE HEALTH:

Display separate, explainable indicators for:
- Data quality.
- Billing reconciliation rate.
- Latest successful audit.
- Audit freshness.

Do not create an unexplained artificial health percentage.

Show whether the displayed results reflect the latest successful audit or have become stale after data changes.

PAGE 02 — REVENUE RECONCILIATION

PURPOSE:
Execute the financial audit.

HEADER:
Billing period, customer scope, product scope, audit status and Run Audit.

DATA READINESS:
Show missing reference data, incomplete transaction records and validation failures.

SUMMARY CARDS:
Expected Charges, Invoiced Amount, Variance, Reconciliation Rate, Matched Records and Unmatched Records.

TABS:

Contract vs Usage:
Compare contractual entitlements with actual consumption.

Usage vs Invoice:
Compare actual billable usage with invoiced usage charges.

Invoice vs Payments:
Show invoice balances and payment allocations.

Full Results:
Display all reconciliation findings for the selected audit run.

FUNCTIONALITY:

Run Audit:
Execute the actual processing pipeline.

Filters:
Update the selected audit scope.

Record Selection:
Open detailed calculations.

Audit History:
Display previous audit runs.

Historical Replay:
Reconstruct historical financial calculations using preserved source and rule versions.

Compare Runs:
Compare expected charges, invoices, variances and anomalies across selected audit runs.

Revenue Evidence Graph:
Open the complete source lineage of a financial obligation.

PAGE 03 — EXCEPTION MANAGEMENT

PURPOSE:
Investigate and manage detected anomalies.

SUMMARY CARDS:
Total Exceptions, Open, In Progress, Resolved and Financial Exposure.

FILTERS:
Exception type, severity, customer, owner, status and period.

EXCEPTION TABLE:
Exception ID, Customer, Category, Billing Period, Impact, Severity, Status, Owner and Actions.

FUNCTIONALITY:

Investigate:
Open actual source evidence and financial calculations.

Assign:
Assign an authorized investigator.

Add Note:
Save timestamped investigation notes.

Change Status:
Update exception lifecycle.

Resolve:
Require a reason and preserve resolution history.

Priority Analysis:
Rank exceptions using transparent business factors.

Systemic Root-Cause Analysis:
Group potentially related exceptions and show affected customers and aggregate exposure.

Revenue Evidence Graph:
Visualize connected source records.

Audit Evidence Pack:
Generate an evidence-backed PDF/XLSX investigation report.

PAGE 04 — CUSTOMER INTELLIGENCE

PURPOSE:
Provide a complete financial profile of each customer.

SUMMARY:
Total Customers, New Customers, At-Risk Customers and Expansion Opportunities.

FILTERS:
Customer segment, subscription plan and status.

CUSTOMER DIRECTORY:
Searchable and sortable.

CUSTOMER PROFILE TABS:

Overview:
Customer information, key financial metrics and subscription health.

Contracts:
Current and historical contractual terms.

Subscriptions:
Products, plans, billing periods and status.

Usage:
Actual consumption, included allowances and excess usage.

Billing:
Invoice history and discrepancy details.

Payments:
Payment transactions, allocations and outstanding balances.

Exceptions:
Historical and active financial investigations.

Profitability:
Revenue, costs and contribution margin.

CUSTOMER COMPARISON:
Select multiple customers and compare financial performance.

PAGE 05 — BILLING & PAYMENTS

PURPOSE:
Manage and analyse billing and collections.

SUMMARY:
Invoiced Amount, Payments Received, Outstanding Balance and Collection Rate.

INVOICE REGISTER:

Search and filter invoices.

Open invoice details.

Preview and download invoice PDF.

Generate valid draft invoices from eligible billing obligations.

Check invoice coverage and prevent duplicate billing.

PAYMENT REGISTER:

Search payment records.

Record authorized internal payment entries.

View payment details.

Allocate payments to eligible invoices.

Support partial allocations.

Display unallocated and unmatched payments.

CREDIT ADJUSTMENTS:

Create authorized credits and adjustments with reasons and audit history.

AGEING ANALYSIS:

Current, 1–30, 31–60, 61–90 and over 90 days where applicable.

Clicking categories filters the relevant invoice register.

Do not implement a real payment gateway unless separately configured and implemented.

PAGE 06 — CUSTOMER UNIT ECONOMICS

PURPOSE:
Understand which customers and products generate profitable revenue.

KPIS:

Average Revenue per Customer.

Average Direct Cost per Customer.

Contribution per Customer.

Contribution Margin.

Profitable Customers.

At-Risk Customers.

Unprofitable Customers.

CHARTS:

Revenue vs Cost Trends.

Customer Contribution Margins.

Product Profitability.

Segment Profitability.

Customer Rankings.

COST BREAKDOWN:

Show the origin and calculation of direct costs.

WHAT-IF REVENUE SIMULATOR:

Allow users to change hypothetical pricing, discounts, usage allowances and cost assumptions.

Recalculate financial outcomes.

Compare existing and proposed profitability.

Save scenarios and export results.

Keep hypothetical results completely separate from actual financial records.

PAGE 07 — AI INVESTIGATION ASSISTANT

PURPOSE:
Provide natural-language access to the financial analytics database.

SUGGESTED QUESTIONS:

Why did revenue leakage increase this month?

Show the five highest underbilled customers.

Which customers have the highest outstanding balance?

Which customers have negative contribution margins?

Explain a specific pricing mismatch.

Compare the latest two billing audits.

Which pricing rules caused repeated exceptions?

FUNCTIONALITY:

- Natural-language query input.
- Query submission.
- Conversation history.
- Evidence-backed answers.
- Supporting financial metrics.
- Database record references.
- Interactive charts.
- Suggested follow-up questions.
- Investigation report generation.

The AI must use approved, controlled, read-only analytical tools.

Never execute unrestricted LLM-generated SQL.

Never invent records or financial figures.

The AI may explain the financial engine's results but must not independently modify invoices, payments or contracts.

PAGE 08 — DATA MANAGEMENT

PURPOSE:
Manage every dataset used by the financial engine.

FUNCTIONALITY:

- CSV and Excel upload.
- Dataset identification.
- Column mapping.
- Data-type validation.
- Missing-value detection.
- Duplicate identification.
- Referential integrity checks.
- Preview.
- Accepted and rejected records.
- Confirmed import.
- Import history.
- Source lineage.
- Safe rollback where supported.

USAGE METER INTEGRITY MONITOR:

Check duplicate usage event IDs, late arrivals, invalid timestamps, missing batches, failed processing, sequence gaps where available and source-to-ingestion control-total differences.

Show affected billing periods.

Allow eligible failed batches to be reprocessed.

Do not claim detection of events that never arrived without an independent completeness signal.

PAGE 09 — SETTINGS

PURPOSE:
Manage application configuration and business governance.

SECTIONS:

General:
Workspace, currency and timezone.

Users and Roles:
Admin, Analyst and Viewer.

Data Preferences:
Database and import configuration.

Revenue Rules:
Alert thresholds and anomaly prioritization settings.

Billing Rules:
Pricing configuration and version management.

AI Configuration:
LLM provider credentials and model configuration.

Notifications:
Application notification preferences.

Accessibility:
Reduced-motion and supported display preferences.

Audit Logs:
Important actions, users, records and timestamps.

BILLING RULES REGRESSION LAB:

Allow creation of proposed pricing rule versions.

Replay historical billing scenarios.

Compare current and proposed billing results.

Test pricing tiers, allowances, discounts, proration, contract changes and rounding.

Display passed tests, failed tests and financial differences.

Submit proposed configurations for authorized approval.

Never activate new billing rules automatically after a test.

==========================================================
12. FOUR ADVANCED SYSTEM CAPABILITIES
==========================================================

A. REVENUE EVIDENCE GRAPH

Build an interactive graph connecting:

Customer → Contract → Contract Version → Subscription → Product → Usage Events → Billing Obligation → Invoice Line → Payment Allocation → Exception.

Every node must open its real source record.

Every edge must display the relationship.

Allow search, filtering, expansion, collapse, evidence highlighting and export.

Do not fabricate relationships.

B. HISTORICAL BILLING REPLAY ENGINE

Allow users to reproduce historical audits using saved historical records and business rule versions.

Compare old and new audit runs.

Show which discrepancies disappeared, remained or emerged.

Preserve historical results immutably.

Mark replay incomplete if necessary historical source information is unavailable.

C. WHAT-IF REVENUE SIMULATOR

Allow users to simulate:

- Pricing changes.
- Subscription changes.
- Discounts.
- Usage allowances.
- Tiered pricing.
- Direct cost assumptions.

Compare financial results and profitability across scenarios.

Save, duplicate, rename and export hypothetical scenarios.

Never modify actual source financial records through the simulator.

D. INTELLIGENT LEAKAGE PRIORITIZATION

Rank exceptions using:

- Unique financial exposure.
- Recurrence.
- Number of affected customers.
- Evidence completeness.
- Match reliability.
- Age.
- Business impact.

Explain why each exception received its priority.

Avoid arbitrary AI-generated risk rankings.

==========================================================
13. ADDITIONAL ADVANCED CAPABILITIES
==========================================================

USAGE METER INTEGRITY MONITOR:

Monitor ingestion completeness and event quality.

BILLING RULES REGRESSION LAB:

Test proposed pricing changes against historical transactions.

SYSTEMIC ROOT-CAUSE ANALYSIS:

Group exceptions that may share common underlying pricing, contract or usage problems.

Show the potential blast radius across customers, subscriptions, invoices and audit periods.

Distinguish potential shared causes from confirmed causation.

AUTOMATED AUDIT EVIDENCE PACK:

Generate structured financial reports containing:

- Audit ID.
- Customer details.
- Contract and pricing versions.
- Usage evidence.
- Expected charge calculations.
- Invoice comparisons.
- Payment allocations.
- Exception details.
- Investigation notes.
- Corrections.
- Historical audit comparisons.

Generate real downloadable PDF and XLSX files.

==========================================================
14. PREMIUM 3D VISUAL EXPERIENCE
==========================================================

Create an exceptional cinematic 3D interface using the uploaded templates as the source of truth.

The design must feel sophisticated, premium, immersive and futuristic.

Do not redesign the approved layouts.

Do not change the supplied colour system.

Apply premium 3D effects across the entire application.

GLOBAL EFFECTS:

- Cinematic Multi-Layer Parallax.
- Volumetric Ambient Lighting.
- Advanced 3D Glassmorphism.
- Realistic Specular Reflections.
- Dynamic Environment Mapping where feasible.
- Chromatic Light Refraction.
- Multi-Axis Perspective Motion.
- Dynamic Cursor Spotlight.
- Floating Surface Elevation.
- Depth Layering.
- Holographic Edge Highlights.
- Spatial Page Transitions.
- Spring Physics Micro-Interactions.
- Magnetic Hover on selected controls.
- Scroll-Triggered 3D Reveals.
- Staggered Card Entrances.
- Animated Surface Reflections.
- Spatial Modal Transitions.
- Kinetic Number Animations.
- Morphing Chart Transitions.
- Floating Tooltips.

3D NAVIGATION:

- Elevated active navigation.
- Interactive icons.
- Subtle perspective hover.
- Floating tooltips.
- Spatial transitions.

3D CARDS:

- Refined perspective tilt.
- Responsive lighting.
- Realistic shadows.
- Smooth elevation.
- Layered reflections.

BUTTONS:

- Magnetic hover where appropriate.
- Physical press-down.
- Smooth spring release.
- Actual loading state.
- Success animation only after real backend confirmation.

CHARTS:

- Animated chart drawing.
- Smooth data transitions.
- Interactive data point highlights.
- Elevated chart containers.
- Floating tooltips.

Never distort chart data or axes to achieve 3D effects.

SCROLLING:

- Subtle background parallax.
- Section reveal.
- Progressive card entrance.
- Fixed sidebar.
- Independent content scrolling.
- Scroll progress indicator where appropriate.

MODALS AND DRAWERS:

- Spatial entrance.
- Layered depth.
- Glass surface effects.
- Smooth expansion and dismissal.

SIGNATURE AI ASSISTANT:

Implement a distinctive 3D holographic AI visualization with:

- Orbital Rings.
- Volumetric Particle Systems.
- Reactive Surface Lighting.
- Subtle Energy Waves.
- Dynamic State Transitions.

AI VISUAL STATES:

Idle: Subtle ambient movement.

Listening: Visual response during actual input.

Processing: Active visualization only while a request is processing.

Responding: Smooth response animation when the real result arrives.

Do not simulate processing or success when no request exists.

SIGNATURE REVENUE EVIDENCE GRAPH:

- Animated 3D Node Network.
- Financial Connection Tracing.
- Perspective Node Selection.
- Interactive Depth Expansion.

SIGNATURE HISTORICAL REPLAY:

- Holographic Audit Timeline.
- Historical State Transitions.
- Spatial Audit Comparison.

SIGNATURE SIMULATOR:

- 3D Scenario Panels.
- Morphing Comparison.
- Animated Financial Outcome Changes.

SIGNATURE ROOT-CAUSE EXPLORATION:

- Expanding Relationship Networks.
- Animated Connection Tracing.
- Spatial Blast Radius Visualization.

PERFORMANCE:

Use Framer Motion and CSS 3D transforms for ordinary interface effects.

Use Three.js or React Three Fiber selectively for the starfield environment, AI hologram and high-value financial graph experiences.

Avoid unnecessary heavy rendering.

Target smooth 60 FPS interaction on capable desktop devices.

Use reduced-motion alternatives.

Ensure touch compatibility and keyboard accessibility.

No visual effect may block clicks, keyboard input, forms, filters or actual application operations.

==========================================================
15. PRODUCTION-LEVEL ENGINEERING
==========================================================

Build this as a modular monolith.

Implement:

- Authentication.
- Secure session handling.
- Server-side role-based permissions.
- Tenant-ready data isolation architecture.
- Input validation.
- Secure uploads.
- Parameterized queries.
- Database transaction management.
- Idempotent imports and reconciliation.
- Immutable historical audit results.
- Structured logging.
- Error monitoring.
- API timeouts.
- Pagination.
- Query optimization.
- Background processing for lengthy imports and audits.
- Retry and recovery for recoverable failures.
- Backup and restoration procedures.
- Audit trails.

Use proper development, testing and production configurations.

Never hardcode credentials.

Never display financial success messages without successful database operations.

Do not claim external payment, bank or billing-provider integrations unless actually configured and tested.

==========================================================
16. POWER BI AND DATA ANALYTICS DELIVERABLES
==========================================================

Data Analytics must be a major and demonstrable part of the project.

Create:

1. PostgreSQL analytical views.
2. Documented advanced SQL queries.
3. Python/Pandas data cleaning workflows.
4. Exploratory Data Analysis notebooks.
5. Data quality reports.
6. Revenue and billing analysis.
7. Customer profitability analysis.
8. Power BI-ready data model.
9. Documented DAX measures.
10. Power Query transformation guidance.

Power BI should provide separate analytical reports for:

- Executive Revenue Overview.
- Revenue Leakage Analysis.
- Billing and Payment Reconciliation.
- Customer Profitability.
- Product Profitability.
- Exception Analytics.

Keep metric definitions consistent with the main React application.

Do not simply reproduce the React interface inside Power BI.

Create a genuine analytical reporting deliverable.

If Power BI Desktop is unavailable to the coding environment, create and validate the PostgreSQL views, analytical queries, measure definitions and connection instructions. Do not claim to have generated a tested PBIX file without doing so.

==========================================================
17. GENAI SAFETY AND DATA GROUNDING
==========================================================

Treat the LLM as an analytical explanation layer, not the financial calculation engine.

Create controlled tools for:

- Retrieve financial KPIs.
- Retrieve customer profiles.
- Retrieve exception records.
- Explain billing discrepancies.
- Compare audit runs.
- Retrieve payment ageing.
- Retrieve customer profitability.
- Retrieve evidence relationships.
- Explain systemic root causes.
- Generate investigation reports.

Validate user permissions and query parameters.

Use approved read-only services.

Restrict table and column access.

Prevent prompt injection from uploaded documents and imported records.

Enforce query limits, pagination and timeouts.

Require supporting data references for factual financial answers.

Clearly distinguish:

- Actual database results.
- Statistical observations.
- Model-generated interpretations.
- Hypothetical simulations.
- Business recommendations.

Do not allow the LLM to independently modify financial records.

==========================================================
18. TESTING AND VALIDATION
==========================================================

Use Pytest, Vitest and Playwright.

Create deterministic financial test fixtures.

REQUIRED FINANCIAL TESTS:

TEST 1:
Expected ₹10,000.
Invoiced ₹10,000.
Expected outcome: Matched.

TEST 2:
Expected ₹10,000.
Invoiced ₹8,000.
Expected outcome: Underbilling ₹2,000.

TEST 3:
Expected ₹10,000.
Invoiced ₹12,000.
Expected outcome: Overbilling ₹2,000.

TEST 4:
Contractual discount 10%.
Invoice discount 15%.
Expected outcome: Discount Drift.

TEST 5:
Contractual rate ₹500.
Invoice rate ₹600.
Expected outcome: Pricing Mismatch.

TEST 6:
Invoice ₹12,000.
Applied payment ₹8,000.
Applicable credit ₹1,000.
Expected outcome: Outstanding ₹3,000.

TEST 7:
Net billed revenue ₹10,000.
Direct costs ₹7,000.
Expected outcome: Contribution ₹3,000 and margin 30%.

TEST 8:
Repeated identical file upload.
Expected outcome: No duplicate transactions.

TEST 9:
Repeated identical audit with unchanged data.
Expected outcome: No duplicate exceptions.

TEST 10:
Historical contract change within a billing period.
Expected outcome: Correct effective-date billing calculations.

TEST 11:
Correct a historical invoice and rerun audit.
Expected outcome: Previous audit remains unchanged and new audit identifies the correction.

TEST 12:
Usage batch control total differs from ingested events.
Expected outcome: Usage integrity warning with supporting batch evidence.

TEST 13:
Proposed pricing rule produces unexpected historical changes.
Expected outcome: Regression test identifies the affected cases.

TEST 14:
Multiple exceptions arise from one pricing rule.
Expected outcome: Root-cause analysis identifies a potential common source without double-counting exposure.

TEST 15:
Run a What-If scenario.
Expected outcome: Hypothetical values update without modifying actual financial records.

END-TO-END TEST:

- Login.
- Upload reference data.
- Upload usage and transaction records.
- Validate and import.
- Configure audit scope.
- Run an audit.
- Inspect reconciliation.
- Investigate an exception.
- View Revenue Evidence Graph.
- Review audit history.
- Run historical replay.
- Test a proposed pricing rule.
- Run a What-If scenario.
- Review customer profitability.
- Ask the AI assistant a financial question.
- Generate evidence pack.
- Record a valid correction.
- Run a new audit.
- Compare both audit runs.
- Export the resulting report.
- Verify all cross-page updates.

==========================================================
19. DEVELOPMENT EXECUTION STRATEGY
==========================================================

First inspect the existing workspace and all supplied visual references.

If an existing implementation is present, inspect and preserve reusable components and working logic before rebuilding individual modules.

Create a technical assessment and a clear implementation plan.

Then actually develop in this sequence:

PHASE 1:
Project architecture, database setup, authentication and shared UI shell.

PHASE 2:
Data import, validation, synthetic dataset and database relationships.

PHASE 3:
Central financial calculation engine.

PHASE 4:
Billing reconciliation and payment reconciliation.

PHASE 5:
Eight-category anomaly detection and exception management.

PHASE 6:
Executive Overview and the remaining analytical pages.

PHASE 7:
Revenue Evidence Graph and historical billing replay.

PHASE 8:
Usage Meter Integrity and Billing Rules Regression Lab.

PHASE 9:
Root-Cause Analysis and Leakage Prioritization.

PHASE 10:
What-If Simulator and Automated Evidence Pack.

PHASE 11:
GenAI Investigation Assistant.

PHASE 12:
Power BI analytical deliverables.

PHASE 13:
Premium 3D interactions and cinematic visual refinement.

PHASE 14:
Complete integration testing, security review and deployment readiness.

At the end of each phase:

- Implement actual code.
- Run relevant tests.
- Fix discovered defects.
- Verify database persistence.
- Verify frontend interactions.
- Report actual completion.
- Record remaining limitations.

Do not stop after the planning phase.

Do not generate the entire application in one uncontrolled code-generation operation.

Keep the specification available in a project document named:

docs/PRODUCT_MASTER_SPECIFICATION.md

Use the specification as the single source of truth during development.

==========================================================
20. PROJECT STRUCTURE
==========================================================

Create a maintainable architecture similar to:

saas-revenue-assurance/

frontend/
  src/
    components/
    layouts/
    pages/
      Overview/
      Reconciliation/
      Exceptions/
      Customers/
      Billing/
      UnitEconomics/
      AIAssistant/
      DataManagement/
      Settings/
    graphs/
    charts/
    animations/
    hooks/
    services/
    types/
    utils/

backend/
  app/
    api/
    core/
    database/
    models/
    schemas/
    services/
    analytics/
    reconciliation/
    anomaly_detection/
    evidence_graph/
    replay/
    simulation/
    regression/
    root_cause/
    usage_integrity/
    genai/
    exports/
    security/

  migrations/
  tests/

database/
  seed/
  views/
  documentation/

analytics/
  notebooks/
  sql/
  powerbi/
  reports/

docs/
  architecture/
  workflows/
  metrics/
  testing/
  PRODUCT_MASTER_SPECIFICATION.md

design-references/
  uploaded templates and screenshots

scripts/
tests/

README.md
.env.example
.gitignore
docker-compose.yml

Adjust folder organization where justified, but preserve modularity and separation of responsibilities.

==========================================================
21. FINAL DEFINITION OF DONE
==========================================================

The project is complete only when:

- All nine pages are implemented.
- Uploaded templates are faithfully reproduced.
- Every important visible interactive element works.
- PostgreSQL is connected and persistent.
- Data ingestion and validation work.
- Financial calculations are correct against test fixtures.
- Billing and payment reconciliation operate separately.
- All eight anomaly categories are implemented and tested.
- Exceptions contain supporting evidence.
- Historical billing replay works.
- Revenue Evidence Graph uses actual record relationships.
- Usage Meter Integrity performs real validation.
- Billing Rules Regression tests actual pricing configurations.
- Root-Cause Analysis groups related issues with defensible evidence.
- Leakage Prioritization provides explainable rankings.
- What-If Simulator calculates actual hypothetical outcomes.
- Evidence Packs generate real downloadable documents.
- Customer unit economics are calculated correctly.
- GenAI responses use authorized actual analytical data.
- Power BI-ready analytical views and documentation exist.
- Authentication and permissions work.
- Historical audit records are preserved.
- Cross-page data consistency is verified.
- Premium 3D effects work without breaking functionality.
- Performance, accessibility and recovery are tested.

Create a final implementation report containing:

1. Completed modules.
2. Technologies actually used.
3. Database schema and migrations.
4. APIs implemented.
5. Business workflows verified.
6. Financial calculations tested.
7. Advanced features implemented.
8. Power BI deliverables.
9. 3D enhancements implemented.
10. Automated test results.
11. Remaining limitations.
12. Installation and deployment instructions.

Never claim production readiness without evidence from actual tests and deployment validation.

Do not use mock responses to disguise missing integrations.

Do not claim financial accuracy when the supporting records are incomplete.

Do not display simulated outcomes as actual financial results.

==========================================================
FINAL PRODUCT OBJECTIVE
==========================================================

Build SaaS Revenue Assurance as a complete intelligent revenue integrity and financial analytics platform.

It must be capable of reconstructing expected customer charges, reconciling real billing records, identifying revenue leakage, validating usage data, explaining discrepancies, recreating historical audits, testing proposed billing rules, simulating financial scenarios, prioritizing investigations, analysing customer profitability and generating defensible financial evidence.

The final application should combine serious financial and data analytics capabilities with an exceptionally polished, cinematic and premium 3D enterprise user experience.

The interface must look impressive, but the financial engine must be trustworthy.

The AI must be useful, but the underlying calculations must remain deterministic.

The nine pages must be deeply integrated, not independent screens.

Start by inspecting the workspace and uploaded templates, then execute the development plan systematically.