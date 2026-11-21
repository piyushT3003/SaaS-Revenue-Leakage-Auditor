# Business workflows

Each workflow names the page used, the API behind it, and the rules the system enforces. Roles:
- **Admin:** everything.
- **Analyst:** imports, audits, investigation and corrections.
- **Viewer:** read-only.

## 1. Onboard data

**Where:** Data Management → *Upload Data*.

1. Choose a CSV or XLSX file, up to 25 MB. You can download a template for each of the 14 datasets.
2. The dataset is detected from the column headers, or you choose it.
3. **Validate.** Each row is checked for types, required fields, allowed values, references to existing records, and duplicates. This happens both inside the file and against stored data, using the dataset's natural key.
4. Review the batch:
   - accepted, rejected and duplicate counts;
   - per-row errors;
   - a column-mapping editor, which lets you re-validate.
5. **Confirm import.** Only accepted rows are stored, and each keeps its source batch and row number.

Rules:
- Re-uploading an identical file stores nothing new.
- An admin can roll back an imported batch, with a reason, when nothing depends on it.

Load reference data first, then transactions: customers → products → contracts → contract versions → pricing rules → subscriptions → costs → usage batches → usage events → invoices → invoice lines → payments → allocations → credits.

## 2. Run an audit

**Where:** Reconciliation → *Run Audit* (`POST /api/v1/audits`).

1. **Readiness.** The page first shows what's missing for the period: coverage of subscriptions, contract versions, pricing rules and usage.
2. **Expected charges.** Effective-dated contract terms rebuild every charge that should have been billed in the period.
3. **Matching.** Expected charges are matched to invoice lines, in this order: explicit references, then subscription and period, then product. Ambiguous matches go to *pending review* instead of being guessed.
4. **Payment reconciliation** runs separately: allocations, outstanding balances, ageing and discrepancies.
5. **Exceptions.** Discrepancies are classified into the eight categories and stored as exceptions with their evidence.

Rules:
- Requesting the same audit on unchanged data reuses the existing run.
- Completed runs and their results are immutable.
- A run that stops making progress is marked FAILED with the reason, and can simply be run again.

## 3. Investigate

**Where:** Exceptions.

1. Filter by category, severity or status. *Prioritize* ranks exceptions by a 0–100 score that shows each factor.
2. *Investigate* opens the drawer: evidence, expected versus invoiced, the contract terms used, notes, assignment and the status workflow.
3. *Trace evidence graph* shows the chain of linked records.
4. *Root Cause* groups exceptions that share a likely source, such as a pricing rule, counting exposure once.
5. *Evidence Pack* produces a PDF or XLSX with a SHA-256 hash for review or audit.

## 4. Correct and verify

**Where:** Billing & Payments.

- **Invoice errors:** open the invoice, edit quantity, price or discount, give a reason of at least 10 characters, then *Void & reissue*. The original is voided, never edited, and payments move to the replacement.
- **Missing invoices:** draft an invoice for unbilled obligations. Already-billed obligations are refused. Issuing it needs `finance:approve`.
- **Payments:** record and allocate them.
- **Credits:** they need approval by a second person.
- **Verify:** re-run the audit, then use **Compare Runs** to see what was resolved, what remains, what is new and which amounts changed.

## 5. Look back in time

**Where:** Reconciliation → *Replay*.

- **AS_KNOWN** reproduces an earlier audit as the data stood then. It reports itself incomplete if records were edited in place afterwards.
- **CURRENT** re-runs the same period on today's corrected data.
- Replays never change the original run or the exceptions.

## 6. Change pricing safely

**Where:** Settings → Billing Rules.

1. Propose a new rule version.
2. Run a regression suite. It re-prices historical cases and flags every case that changes.
3. Submit the proposal. A **different** admin approves it.
4. Activate it from an explicit effective date. The old version is end-dated, so past periods keep their original pricing.

Nothing activates automatically.

## 7. Analyse economics and scenarios

- **Customers and Unit Economics:** contribution and margin by customer, product and segment; customer profiles; the 3D customer galaxy.
- **What-If Simulator:** apply price, discount, included-units, quantity or cost changes to copies of the rules. Results are labelled hypothetical, and stored records never change.
- **Executive report:** Overview → *Export Report* (PDF or XLSX) for the selected period.
- **Power BI:** connect as `powerbi_reader` to the `reporting` schema. See `analytics/powerbi/README.md`.

## 8. Ask the assistant

**Where:** AI Investigation.

- Ask in plain language, for example "Why did leakage rise in October?" or "Top underbilled customers".
- Answers come only from registered read-only queries and show how they were calculated.
- Requests to change data are refused, and every question is logged.
