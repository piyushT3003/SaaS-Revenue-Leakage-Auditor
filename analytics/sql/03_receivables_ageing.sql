-- Receivables ageing for invoices issued in the latest audited period, at that audit's as-of date.
WITH m AS (SELECT max(period_start) AS p FROM reporting.latest_audit)
SELECT r.ageing_bucket, COUNT(*) AS invoices, SUM(GREATEST(r.outstanding, 0)) AS outstanding
FROM reporting.fact_receivable r, m WHERE r.audit_period_start = m.p AND r.outstanding > 0
GROUP BY 1 ORDER BY MIN(r.days_past_due);
