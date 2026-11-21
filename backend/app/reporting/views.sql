-- =====================================================================================
-- Reporting layer for Power BI (schema "reporting").  Star schema: conformed dimensions +
-- facts.  Definitions mirror the application exactly (docs/metrics/METRIC_DEFINITIONS.md):
--   * audit facts come from the LATEST COMPLETED, FULL-SCOPE, STANDARD audit per period
--     (replays and scoped runs are excluded), as on the dashboards;
--   * revenue leakage = Σ max(0, expected − invoiced) over obligations that are neither
--     EXCLUDED nor PENDING_REVIEW (= audit_runs.underbilled_total);
--   * contribution margin comes from reporting.customer_economics_monthly, a snapshot
--     written by the application's own cost-allocation engine (never re-derived in DAX).
-- All money columns are NUMERIC. Views are read-only; grant the powerbi_reader role only.
-- =====================================================================================
CREATE SCHEMA IF NOT EXISTS reporting;

-- ---------------------------------------------------------------- dimensions
CREATE OR REPLACE VIEW reporting.dim_date AS
SELECT d::date                                   AS date_key,
       EXTRACT(year FROM d)::int                 AS year,
       EXTRACT(quarter FROM d)::int              AS quarter,
       EXTRACT(month FROM d)::int                AS month,
       to_char(d, 'Mon YYYY')                    AS month_label,
       date_trunc('month', d)::date              AS month_start,
       (date_trunc('month', d) + interval '1 month - 1 day')::date AS month_end,
       EXTRACT(isodow FROM d)::int               AS iso_weekday
FROM generate_series(date '2024-01-01', date '2030-12-31', interval '1 day') AS d;

CREATE OR REPLACE VIEW reporting.dim_customer AS
SELECT id AS customer_id, tenant_id, customer_code, name AS customer_name, segment, industry, region, status, onboarded_on, account_owner
FROM public.customers;

CREATE OR REPLACE VIEW reporting.dim_product AS
SELECT id AS product_id, tenant_id, product_code, name AS product_name, product_family, charge_model, unit_name, is_active
FROM public.products;

-- ---------------------------------------------------------------- audits
CREATE OR REPLACE VIEW reporting.latest_audit AS
SELECT DISTINCT ON (tenant_id, period_start, period_end)
       id AS audit_run_id, tenant_id, run_code, status, period_start, period_end, as_of_date, completed_at, engine_version,
       expected_total, invoiced_total, variance_total, underbilled_total, overbilled_total, reconciliation_rate
FROM public.audit_runs
WHERE run_type = 'STANDARD' AND status IN ('COMPLETED', 'COMPLETED_WITH_EXCLUSIONS')
  AND jsonb_array_length(scope -> 'customer_ids') = 0 AND jsonb_array_length(scope -> 'product_ids') = 0
ORDER BY tenant_id, period_start, period_end, completed_at DESC;

CREATE OR REPLACE VIEW reporting.fact_reconciliation AS
SELECT r.id AS result_id, r.tenant_id, a.audit_run_id, a.run_code, a.period_start AS audit_period_start,
       r.customer_id, r.product_id, r.charge_type, r.period_start AS service_period_start, r.period_end AS service_period_end,
       r.status, (r.obligation_id IS NULL) AS is_unmatched_invoice_line,
       r.expected_amount, r.invoiced_amount, r.variance,
       CASE WHEN r.obligation_id IS NOT NULL AND r.status NOT IN ('EXCLUDED', 'PENDING_REVIEW')
            THEN GREATEST(r.expected_amount - r.invoiced_amount, 0) ELSE 0 END AS underbilled_amount,
       CASE WHEN r.obligation_id IS NOT NULL AND r.status NOT IN ('EXCLUDED', 'PENDING_REVIEW')
            THEN GREATEST(r.invoiced_amount - r.expected_amount, 0) ELSE 0 END AS overbilled_amount,
       (r.status = 'MATCHED')::int AS is_matched,
       (r.status NOT IN ('EXCLUDED') AND r.obligation_id IS NOT NULL)::int AS is_in_scope,
       r.match_method, r.match_confidence, r.excluded_reason
FROM public.reconciliation_results r
JOIN reporting.latest_audit a ON a.audit_run_id = r.audit_run_id;

CREATE OR REPLACE VIEW reporting.fact_receivable AS
SELECT p.id AS row_id, p.tenant_id, a.audit_run_id, a.period_start AS audit_period_start, a.as_of_date,
       p.customer_id, p.invoice_id, i.invoice_number, i.issue_date, i.due_date, p.status, p.issue_code,
       p.invoice_total, p.credits_applied, p.payments_allocated, p.outstanding, p.days_past_due, p.ageing_bucket
FROM public.payment_reconciliation_results p
JOIN reporting.latest_audit a ON a.audit_run_id = p.audit_run_id
LEFT JOIN public.invoices i ON i.id = p.invoice_id
WHERE p.record_type = 'INVOICE';

CREATE OR REPLACE VIEW reporting.fact_payment_issue AS
SELECT p.id AS row_id, p.tenant_id, a.audit_run_id, a.period_start AS audit_period_start, p.customer_id, p.payment_id,
       pay.payment_number, pay.received_on, p.status, p.issue_code, p.payment_amount, p.unallocated_amount, p.explanation
FROM public.payment_reconciliation_results p
JOIN reporting.latest_audit a ON a.audit_run_id = p.audit_run_id
LEFT JOIN public.payments pay ON pay.id = p.payment_id
WHERE p.record_type = 'PAYMENT';

-- ---------------------------------------------------------------- exceptions
CREATE OR REPLACE VIEW reporting.fact_exception AS
SELECT e.id AS exception_id, e.tenant_id, e.exception_code, e.category, e.severity, e.status,
       e.customer_id, e.period_start, e.period_end, e.financial_impact, e.counts_toward_leakage, e.exposure_key,
       e.created_at::date AS detected_on, e.resolved_at::date AS resolved_on,
       CASE WHEN e.resolved_at IS NOT NULL THEN (e.resolved_at::date - e.created_at::date) END AS days_to_resolve,
       (e.owner_user_id IS NOT NULL) AS is_assigned, fr.run_code AS first_detected_in, lr.run_code AS last_seen_in
FROM public.exceptions e
JOIN public.audit_runs fr ON fr.id = e.audit_run_id
LEFT JOIN public.audit_runs lr ON lr.id = e.last_seen_audit_run_id;

-- ---------------------------------------------------------------- billing & cash
CREATE OR REPLACE VIEW reporting.fact_invoice_line AS
SELECT l.id AS invoice_line_id, l.tenant_id, i.id AS invoice_id, i.invoice_number, i.customer_id, l.product_id,
       i.issue_date, i.due_date, l.period_start AS service_period_start, l.period_end AS service_period_end,
       l.charge_type, l.quantity, l.unit_price, l.discount_pct, l.discount_amount, l.line_amount
FROM public.invoice_lines l
JOIN public.invoices i ON i.id = l.invoice_id
WHERE i.status NOT IN ('DRAFT', 'VOID') AND i.voided_at IS NULL;

CREATE OR REPLACE VIEW reporting.fact_payment AS
SELECT p.id AS payment_id, p.tenant_id, p.payment_number, p.customer_id, p.received_on, p.amount, p.method, p.source,
       p.verification_status, p.status,
       COALESCE((SELECT SUM(a.amount) FROM public.payment_allocations a WHERE a.payment_id = p.id AND a.reversed_at IS NULL), 0) AS allocated_amount
FROM public.payments p;

-- ---------------------------------------------------------------- unit economics (engine snapshot)
CREATE TABLE IF NOT EXISTS reporting.customer_economics_monthly (
    tenant_id     integer       NOT NULL,
    month_start   date          NOT NULL,
    customer_id   integer       NOT NULL,
    net_revenue   numeric(18,2) NOT NULL,
    direct_cost   numeric(18,2) NOT NULL,
    contribution  numeric(18,2) NOT NULL,
    margin_pct    numeric(9,4),
    profitability varchar(16)   NOT NULL,
    cost_breakdown jsonb        NOT NULL DEFAULT '{}'::jsonb,
    refreshed_at  timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, month_start, customer_id)
);
CREATE TABLE IF NOT EXISTS reporting.product_economics_monthly (
    tenant_id    integer       NOT NULL,
    month_start  date          NOT NULL,
    product_id   integer       NOT NULL,
    revenue      numeric(18,2) NOT NULL,
    direct_cost  numeric(18,2) NOT NULL,
    contribution numeric(18,2) NOT NULL,
    margin_pct   numeric(9,4),
    refreshed_at timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, month_start, product_id)
);

-- ---------------------------------------------------------------- read-only role for Power BI
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powerbi_reader') THEN
    CREATE ROLE powerbi_reader NOLOGIN;  -- enable with: ALTER ROLE powerbi_reader LOGIN PASSWORD '...';
  END IF;
END $$;
GRANT USAGE ON SCHEMA reporting TO powerbi_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO powerbi_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT SELECT ON TABLES TO powerbi_reader;
