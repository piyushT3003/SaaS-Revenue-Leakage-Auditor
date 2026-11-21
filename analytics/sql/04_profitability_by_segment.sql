-- Contribution margin by customer segment and month (engine snapshot).
SELECT e.month_start, d.segment, COUNT(*) AS customers, SUM(e.net_revenue) AS revenue, SUM(e.direct_cost) AS direct_cost,
       SUM(e.contribution) AS contribution, ROUND(100 * SUM(e.contribution) / NULLIF(SUM(e.net_revenue), 0), 2) AS margin_pct,
       COUNT(*) FILTER (WHERE e.profitability = 'UNPROFITABLE') AS unprofitable
FROM reporting.customer_economics_monthly e JOIN reporting.dim_customer d USING (customer_id)
GROUP BY 1, 2 ORDER BY 1, 2;
