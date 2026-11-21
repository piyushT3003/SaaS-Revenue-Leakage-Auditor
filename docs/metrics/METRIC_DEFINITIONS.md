# Metric definitions

Every KPI is calculated in one place — `backend/app/analytics/metrics.py` (point-in-time metrics) and `backend/app/analytics/calculation.py` (expected charges). Pages, exports, the AI assistant and the Power BI views must use these definitions and never recalculate a KPI on their own. Every API metric response carries `formula`, `period`, `currency`, `source`, `basis` and `as_of`.

All money uses PostgreSQL `NUMERIC` and Python `Decimal`. Components are rounded to 2 dp with ROUND_HALF_UP; totals are sums of rounded components. Money crosses the API as strings, so no precision is lost in transit.

| Metric | Formula | Basis / notes |
|---|---|---|
| **MRR** | Σ active recurring subscriptions: monthly unit price × quantity × (1 − contractual discount %) | Price comes from the contract version and pricing rule in force on the as-of date. Usage, one-time charges and tax are excluded. MRR is not billed revenue and not cash. Subscriptions whose terms can't be determined are excluded and listed. |
| **Expected billable charge** (per obligation) | base recurring + billable usage + contractual one-time − discounts + minimum-commitment true-up | See *Expected charge rules* below. |
| **Underbilling** | max(0, expected − comparable invoiced) per billing obligation | Comparable invoiced = net, pre-tax invoice-line amounts matched to the obligation. |
| **Overbilling** | max(0, comparable invoiced − expected) per billing obligation | Kept separate from underbilling; the two never net off across obligations. |
| **Revenue leakage** | Σ underbilling over in-scope obligations of the latest completed audit | Each obligation is counted once. A missing charge and the unbilled usage behind it are the same exposure. Excluded and pending-review obligations are not counted. |
| **Outstanding balance** | invoice total − approved credit notes/write-offs + approved debit adjustments − payment allocations dated ≤ as-of | Only ISSUED invoices count (draft and void are excluded). Unapplied cash does not reduce a balance until it is allocated. |
| **Collection rate** | cash allocated to the cohort ÷ (cohort invoice total − approved credits) × 100 | Cohort = ISSUED invoices dated inside the period. Cash counts if allocated on or before the as-of date. The response states both. |
| **Customer contribution** | net billed service revenue − allocated direct service costs | Revenue = pre-tax invoice lines whose service period starts in the window, less approved credit notes effective in the window. |
| **Contribution margin** | contribution ÷ net billed service revenue × 100 | `null` when revenue is 0. This is not accounting profit and not recognised revenue. |
| **Customer segment** | PROFITABLE ≥ 15 % > AT_RISK ≥ 0 % > UNPROFITABLE | Thresholds live in `metrics.py`. |
| **Reconciliation rate** | MATCHED obligations ÷ in-scope obligations × 100 | Excluded obligations are not in scope. Shows `null` (not 100 %) when nothing is in scope. |
| **Data quality** | accepted rows ÷ uploaded rows (validated + imported batches) | Reported separately from reconciliation. There is no blended "health %". |

## Expected charge rules (`calculation.py`)

* **Billing periods are calendar-aligned.** MONTHLY means a calendar month, QUARTERLY a calendar quarter and ANNUAL a calendar year. Each period is audited in exactly one window: the window that contains the period's start date.
* **RECURRING prices are per unit per month.** One billing period covers 1, 3 or 12 months.
* **Proration.** Days are inclusive. A partly active period is charged `active_days / period_days`.
* **Contract change inside a period.** The period is split into segments by the contract version in force, and each segment is priced with its own version's rule. Any day not covered by a version is a `VERSION_GAP`: the obligation is excluded with a reason, never guessed.
* **Usage** is billed monthly in arrears. Usage from FAILED batches is ignored. For split months, the included allowance is prorated by segment days. Supported models are PER_UNIT, FLAT, TIERED_GRADUATED and TIERED_VOLUME, plus a minimum-commitment true-up.
* **No usage signal.** If a month has no usage events for the subscription *and* no usage batch covers it, the usage obligation is excluded as `NO_USAGE_SIGNAL`, because missing data is not zero usage.
* **Currency.** Different currencies are never compared. Contracts not in the tenant base currency are excluded until FX rates are configured.

## Direct-cost allocation

1. Rows in `product_costs` that name a customer are attributed to that customer (`DIRECT`).
2. Product-level cost pools are allocated to the customers using that product in that month:
   * `USAGE`: share of metered units;
   * `SEATS`: share of subscribed quantity;
   * `REVENUE`: share of billed revenue for the product.
3. A pool with no allocation basis in a month is reported as **unallocated**. It is never spread evenly.
