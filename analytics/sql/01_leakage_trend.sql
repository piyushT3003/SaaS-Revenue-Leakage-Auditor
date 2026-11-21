-- Monthly revenue leakage, overbilling and reconciliation rate from the latest full-scope audit per month.
SELECT a.period_start AS month, a.run_code,
       SUM(f.expected_amount) AS expected, SUM(f.invoiced_amount) AS invoiced,
       SUM(f.underbilled_amount) AS leakage, SUM(f.overbilled_amount) AS overbilling,
       ROUND(100.0 * SUM(f.is_matched) / NULLIF(SUM(f.is_in_scope), 0), 2) AS reconciliation_rate_pct
FROM reporting.latest_audit a
JOIN reporting.fact_reconciliation f USING (audit_run_id)
GROUP BY 1, 2 ORDER BY 1;
