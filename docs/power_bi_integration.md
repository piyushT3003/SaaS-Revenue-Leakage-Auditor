# Power BI Integration Guide — SaaS Revenue Assurance

This document details how to ingest and model the SaaS Revenue Assurance data directly in Power BI Desktop or Power BI Service without duplicating the financial logic.

## 1. Direct Database Views

Four production-ready analytical SQL views are deployed in `database/views/power_bi_views.sql`:

1. `v_powerbi_monthly_revenue_assurance`:
   - Summarizes monthly billed revenue, gross billed amounts, tax, cash collected, outstanding receivables, and collection rate %.
2. `v_powerbi_customer_unit_economics`:
   - Provides customer-level contribution margins, net revenue, direct cost breakdown (compute, infra, support, licenses), and margin classification.
3. `v_powerbi_financial_exceptions`:
   - Categorizes all 8 anomaly types with financial exposure, severity, resolution status, and audit timestamps.
4. `v_powerbi_reconciliation_summary`:
   - Tracks historical reconciliation rate %, matched obligations, and total variance across billing cycles.

## 2. Connection Approaches

### Option A: PostgreSQL DirectQuery / Import
- **Connector**: PostgreSQL Database
- **Server**: `localhost:5432` (or AWS RDS / Cloud SQL endpoint)
- **Database**: `saas_assurance`
- **Data Connectivity Mode**: `DirectQuery` (for real-time synchronization) or `Import` (for high-speed in-memory DAX processing).

### Option B: REST API Connector (Web Connector)
- Power BI can consume the authenticated REST API endpoints:
  - `GET /api/v1/overview/export?format=csv`
  - `GET /api/v1/reconciliation/export?format=csv`
  - `GET /api/v1/exceptions/export?format=csv`
  - `GET /api/v1/customers/export?format=csv`
  - `GET /api/v1/unit-economics/export?format=csv`

## 3. Recommended DAX Measures

```dax
// Revenue Leakage Exposure
Total Leakage = SUM('v_powerbi_financial_exceptions'[financial_leakage_inr])

// Contribution Margin %
Contribution Margin % = 
DIVIDE(
    SUM('v_powerbi_customer_unit_economics'[contribution_margin_inr]),
    SUM('v_powerbi_customer_unit_economics'[monthly_revenue]),
    0
)

// Collection Rate %
Collection Rate % = 
DIVIDE(
    SUM('v_powerbi_monthly_revenue_assurance'[total_collected_cash]),
    SUM('v_powerbi_monthly_revenue_assurance'[gross_invoiced_amount]),
    0
)
```
