-- Pareto: which customers make up the leakage in the latest month (cumulative share).
WITH m AS (SELECT max(period_start) AS p FROM reporting.latest_audit),
c AS (SELECT f.customer_id, SUM(f.underbilled_amount) AS leakage
      FROM reporting.fact_reconciliation f, m WHERE f.audit_period_start = m.p GROUP BY 1 HAVING SUM(f.underbilled_amount) > 0)
SELECT d.customer_name, d.segment, c.leakage,
       ROUND(100.0 * SUM(c.leakage) OVER (ORDER BY c.leakage DESC) / SUM(c.leakage) OVER (), 1) AS cumulative_pct
FROM c JOIN reporting.dim_customer d USING (customer_id) ORDER BY c.leakage DESC;
