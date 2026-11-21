-- Exception workload: open vs resolved and time to resolve, by category.
SELECT category, COUNT(*) AS total, COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS')) AS open,
       COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved, ROUND(AVG(days_to_resolve), 1) AS avg_days_to_resolve,
       SUM(financial_impact) AS exposure, SUM(financial_impact) FILTER (WHERE counts_toward_leakage) AS leakage_counting_exposure
FROM reporting.fact_exception GROUP BY 1 ORDER BY exposure DESC;
