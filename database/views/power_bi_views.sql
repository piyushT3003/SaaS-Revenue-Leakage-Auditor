-- ==============================================================================
-- SAAS REVENUE ASSURANCE - POWER BI INTEGRATION VIEWS
-- Compatible with PostgreSQL and SQLite
-- ==============================================================================

-- 1. Executive Revenue & Leakage Monthly View
CREATE VIEW IF NOT EXISTS v_powerbi_monthly_revenue_assurance AS
SELECT
    strftime('%Y-%m', i.billing_period_start) AS reporting_month,
    COUNT(DISTINCT i.customer_id) AS active_billed_customers,
    SUM(i.subtotal) AS total_invoiced_revenue,
    SUM(i.tax_amount) AS total_tax,
    SUM(i.total_amount) AS gross_invoiced_amount,
    SUM(i.paid_amount) AS total_collected_cash,
    SUM(i.balance_due) AS outstanding_receivables,
    ROUND(SUM(i.paid_amount) * 100.0 / NULLIF(SUM(i.total_amount), 0), 1) AS collection_rate_pct
FROM invoices i
WHERE i.status != 'Cancelled'
GROUP BY strftime('%Y-%m', i.billing_period_start);

-- 2. Customer Unit Economics & Margin View
CREATE VIEW IF NOT EXISTS v_powerbi_customer_unit_economics AS
SELECT
    c.id AS customer_id,
    c.customer_code,
    c.name AS customer_name,
    c.segment,
    c.plan_tier,
    c.status AS customer_status,
    c.health_score,
    c.health_status,
    pc.period AS reporting_period,
    COALESCE(SUM(inv.subtotal), 0) AS monthly_revenue,
    COALESCE(pc.infrastructure_cost, 0) AS infra_direct_cost,
    COALESCE(pc.compute_cost, 0) AS compute_direct_cost,
    COALESCE(pc.support_cost, 0) AS support_direct_cost,
    COALESCE(pc.third_party_cost, 0) AS third_party_direct_cost,
    COALESCE(pc.total_direct_cost, 0) AS total_direct_costs,
    ROUND(COALESCE(SUM(inv.subtotal), 0) - COALESCE(pc.total_direct_cost, 0), 2) AS contribution_margin_inr,
    ROUND(
        (COALESCE(SUM(inv.subtotal), 0) - COALESCE(pc.total_direct_cost, 0)) * 100.0 /
        NULLIF(COALESCE(SUM(inv.subtotal), 0), 0),
        1
    ) AS contribution_margin_pct
FROM customers c
LEFT JOIN product_costs pc ON c.id = pc.customer_id
LEFT JOIN invoices inv ON c.id = inv.customer_id AND strftime('%Y-%m', inv.billing_period_start) = pc.period AND inv.status != 'Cancelled'
GROUP BY c.id, pc.period;

-- 3. Exception & Financial Leakage Audit View
CREATE VIEW IF NOT EXISTS v_powerbi_financial_exceptions AS
SELECT
    e.id AS exception_id,
    e.exception_code,
    c.customer_code,
    c.name AS customer_name,
    c.segment,
    e.issue_type,
    e.severity,
    e.financial_impact AS financial_leakage_inr,
    e.status AS resolution_status,
    e.description,
    e.calculation_explanation,
    e.detected_at,
    e.resolved_at,
    e.resolved_reason
FROM exceptions e
JOIN customers c ON e.customer_id = c.id;

-- 4. Contract-to-Cash Reconciliation View
CREATE VIEW IF NOT EXISTS v_powerbi_reconciliation_summary AS
SELECT
    r.id AS run_id,
    r.run_number,
    r.period,
    r.total_eligible_obligations,
    r.matched_obligations,
    r.mismatched_obligations,
    r.expected_total,
    r.invoiced_total,
    r.variance_total,
    r.reconciliation_rate,
    r.status,
    r.run_at
FROM reconciliation_runs r;
