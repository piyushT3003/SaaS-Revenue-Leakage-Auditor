# Power BI analytical deliverable

> **Status.** The PostgreSQL reporting layer, DAX measures, Power Query scripts and theme are implemented, and the views are validated against the application (see *Validation*).
> **No `.pbix` file is included.** Power BI Desktop is not available in the environment where this was built, so no report file could be produced or tested. This guide assembles the report in about 30 minutes.

## 1. Connect

1. Run the migrations (the backend does this on start). Migration `0005` creates schema `reporting` and a `NOLOGIN` role `powerbi_reader` with `SELECT` on that schema only.
2. Enable the role with a strong password. Keep the password out of source control:
   ```sql
   ALTER ROLE powerbi_reader LOGIN PASSWORD '<strong password>';
   ```
3. In Power BI Desktop, go to **Get data → PostgreSQL database**. Use server `host:5432`, database `sra` and **Import** mode.
4. Use credentials **Database → `powerbi_reader`**.
5. Alternatively, create the parameters `PgServer` and `PgDatabase` and paste each script from `power_query/` into a blank query. Those scripts keep money as *Fixed Decimal*.
6. Apply `theme.json` (**View → Themes → Browse for themes**). Create a `_Measures` table and paste the measures from `measures.dax`.

## 2. Model (star schema)

| From (many) | Column | To (one) | Column |
|---|---|---|---|
| fact_reconciliation | customer_id | dim_customer | customer_id |
| fact_reconciliation | product_id | dim_product | product_id |
| fact_reconciliation | audit_period_start | dim_date | date_key |
| fact_exception | customer_id | dim_customer | customer_id |
| fact_exception | period_start | dim_date | date_key |
| fact_receivable | customer_id | dim_customer | customer_id |
| fact_receivable | audit_period_start | dim_date (inactive) | date_key |
| fact_invoice_line | customer_id / product_id | dim_customer / dim_product | … |
| fact_invoice_line | service_period_start | dim_date (inactive) | date_key |
| fact_payment | customer_id | dim_customer | customer_id |
| customer_economics_monthly | customer_id | dim_customer | customer_id |
| customer_economics_monthly | month_start | dim_date (inactive) | date_key |
| product_economics_monthly | product_id | dim_product | product_id |

Further model settings:
- Mark `dim_date` as the date table.
- Set every relationship to single-direction (dimension → fact).
- Use `USERELATIONSHIP` in measures for the inactive date relationships, or add a role-playing date table.
- Hide the key columns and `tenant_id`.

**Multi-tenant deployments.** Add row-level security on `dim_customer[tenant_id]` and every fact's `tenant_id`, using `USERPRINCIPALNAME()` mapped through a security table.

## 3. Report pages (genuine analysis, not a copy of the app)

1. **Executive Revenue Overview**
   - KPI cards: Expected Charges, Revenue Leakage, Reconciliation Rate %, Contribution Margin %, Outstanding Balance.
   - Leakage and Leakage MoM % over time.
   - A decomposition tree from leakage to segment, region, product and customer.
2. **Revenue Leakage Analysis**
   - Matrix of status × product × month.
   - Pareto chart of the customers that make up 80% of leakage.
   - Scatter plot of Expected vs Invoiced per obligation, with the leakage-status colour.
   - Key influencers visual explaining `underbilled_amount > 0`.
3. **Billing & Payment Reconciliation**
   - Waterfall from Expected to Invoiced.
   - Ageing buckets from `fact_receivable[ageing_bucket]`.
   - Collection Rate % trend.
   - Unapplied cash and payment issues table.
4. **Customer Profitability**
   - Contribution by segment and region.
   - Distribution of Contribution Margin % (histogram).
   - Count and contribution of unprofitable customers.
   - Revenue vs Direct Cost scatter, sized by contribution.
5. **Product Profitability**
   - Product Margin % by month.
   - Cost-pool composition from `customer_economics_monthly[cost_breakdown]`, expanded in Power Query.
6. **Exception Analytics**
   - Open vs resolved over time.
   - Avg Days to Resolve by category.
   - Unassigned open exceptions.
   - Category × severity heat map.

Note: `Exception Exposure` can overlap across categories, for example a missing charge and the unbilled usage behind it. Headline leakage therefore always uses `Revenue Leakage`, which counts each obligation once, matching the application.

## 4. Refresh

- **Audit facts** update automatically. A new full-scope audit becomes the `latest_audit` for its period.
- **Unit-economics snapshot tables** are refreshed by the application's own cost-allocation engine:
  - automatically, whenever a full-scope standard audit completes;
  - manually, with `python -m backend.app.reporting.refresh [YYYY-MM …]`;
  - by an administrator, with `POST /api/v1/reporting/refresh`.

  `GET /api/v1/reporting/status` shows the months covered and when each was refreshed.
- In the Power BI Service, schedule refresh after the nightly audit using an on-premises data gateway.

## 5. Validation (executed against the demo database)

`backend/tests/test_reporting.py` asserts the following:
- For every audited month, `Σ fact_reconciliation.underbilled_amount = audit_runs.underbilled_total` and the same holds for overbilling.
- Contribution margin in the snapshot equals `/api/v1/metrics/summary` for the same month.
- `powerbi_reader` can read `reporting.*` but cannot read `public.*` or write anywhere.

The notebooks in `analytics/notebooks/` repeat these reconciliations and the exploratory analysis with pandas.
