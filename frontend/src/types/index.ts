export interface KPICardData {
  label: string;
  value: string;
  raw_value: number;
  change_pct: number;
  change_direction: 'up' | 'down';
  change_label: string;
  sparkline: number[];
}

export interface RevenueHealthData {
  score: number;
  trend: string;
  status: string;
  factors: Record<string, any>;
}

export interface RevenueTrendPoint {
  month: string;
  billed_revenue: number;
  expected_revenue: number;
  revenue_leakage: number;
}

export interface ExceptionTypeDistribution {
  type: string;
  count: number;
  percentage: number;
  color: string;
  financial_impact: number;
}

export interface CustomerProfitabilitySummary {
  profitable_count: number;
  profitable_pct: number;
  at_risk_count: number;
  at_risk_pct: number;
  unprofitable_count: number;
  unprofitable_pct: number;
  total_customers: number;
}

export interface RecentExceptionItem {
  id: string;
  exception_code: string;
  customer_id: string;
  customer_name: string;
  customer_logo?: string;
  issue_type: string;
  description: string;
  financial_impact: number;
  status: 'Open' | 'In Progress' | 'Resolved';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  detected_at: string;
}

export interface ExecutiveOverviewData {
  period_start: string;
  period_end: string;
  mrr_kpi: KPICardData;
  leakage_kpi: KPICardData;
  outstanding_kpi: KPICardData;
  active_customers_kpi: KPICardData;
  contribution_margin_kpi: KPICardData;
  revenue_health: RevenueHealthData;
  revenue_trends: RevenueTrendPoint[];
  exceptions_by_type: ExceptionTypeDistribution[];
  customer_profitability: CustomerProfitabilitySummary;
  recent_exceptions: RecentExceptionItem[];
}

export interface ReconciliationRow {
  id: string;
  customer_id: string;
  customer_name: string;
  contract_number: string;
  product_name: string;
  billing_period: string;
  contract_amount: number;
  usage_value: number;
  invoiced_amount: number;
  variance: number;
  variance_pct: number;
  status: 'Matched' | 'Underbilled' | 'Overbilled' | 'Missing' | 'Unmatched';
  calculation_details: Record<string, any>;
}

export interface ReconciliationSummary {
  expected_charges: number;
  invoiced_amount: number;
  variance_amount: number;
  reconciliation_rate: number;
  matched_records: number;
  unmatched_records: number;
  total_obligations: number;
}

export interface ReconciliationData {
  period: string;
  summary: ReconciliationSummary;
  rows: ReconciliationRow[];
  run_history: Array<{
    run_number: string;
    period: string;
    run_at: string;
    status: string;
    matched_obligations: number;
    mismatched_obligations: number;
    reconciliation_rate: number;
    variance_total: number;
  }>;
}

export interface ExceptionDetail {
  id: string;
  exception_code: string;
  customer_id: string;
  customer_name: string;
  issue_type: string;
  severity: string;
  financial_impact: number;
  status: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  description: string;
  calculation_explanation: string;
  source_records: Record<string, any>;
  resolved_reason?: string;
  resolved_by_name?: string;
  resolved_at?: string;
  detected_at: string;
  notes: Array<{
    id: string;
    user_name: string;
    note_text: string;
    created_at: string;
  }>;
  evidence: Array<{
    id: string;
    evidence_type: string;
    title: string;
    data: Record<string, any>;
    created_at: string;
  }>;
}

export interface CustomerListItem {
  id: string;
  customer_code: string;
  name: string;
  segment: string;
  plan_tier: string;
  status: string;
  mrr: number;
  annual_revenue: number;
  health_score: number;
  health_status: string;
  active_subscriptions: number;
  open_exceptions_count: number;
  outstanding_balance: number;
}

export interface CustomerDetail {
  customer: CustomerListItem & { domain?: string; billing_currency?: string; payment_terms_days?: number };
  contracts: Array<{
    id: string;
    contract_number: string;
    start_date: string;
    end_date: string;
    status: string;
    versions: Array<{
      version_number: number;
      effective_from: string;
      effective_to: string;
      fixed_fee: number;
      included_units: number;
      overage_rate: number;
      discount_pct: number;
      is_current: boolean;
    }>;
  }>;
  subscriptions: Array<{
    id: string;
    product_name: string;
    category: string;
    billing_cycle: string;
    mrr: number;
    start_date: string;
    status: string;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    period: string;
    issue_date: string;
    total_amount: number;
    paid_amount: number;
    balance_due: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    payment_reference: string;
    payment_date: string;
    amount: number;
    method: string;
    status: string;
  }>;
  exceptions: Array<{
    id: string;
    exception_code: string;
    issue_type: string;
    severity: string;
    financial_impact: number;
    status: string;
    description: string;
    detected_at: string;
  }>;
  unit_economics?: {
    revenue: number;
    direct_cost: number;
    contribution: number;
    margin_pct: number;
  };
}

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: string;
}

export interface UnitEconomicsData {
  period: string;
  arpc: number;
  acpc: number;
  contribution_per_customer: number;
  overall_contribution_margin: number;
  profitable_customers_count: number;
  at_risk_customers_count: number;
  unprofitable_customers_count: number;
  revenue_vs_cost_trends: Array<{ month: string; revenue: number; cost: number; margin_pct: number }>;
  product_profitability: Array<{ name: string; revenue: number; direct_cost: number; contribution: number; margin_pct: number }>;
  segment_profitability: Array<{ segment: string; revenue: number; direct_cost: number; contribution: number; margin_pct: number; customer_count: number }>;
  cost_breakdown: Array<{ category: string; amount: number; percentage: number; description: string }>;
  customer_rankings: Array<{
    id: string;
    customer_code: string;
    customer_name: string;
    segment: string;
    plan_tier: string;
    revenue: number;
    direct_cost: number;
    contribution: number;
    margin_pct: number;
    status: string;
  }>;
  allocation_methodology_doc: string;
}

export interface AIQueryResponse {
  answer: string;
  reporting_period: string;
  supporting_metrics: Record<string, any>;
  explanation: string;
  affected_customers: Array<Record<string, any>>;
  issue_distribution: Array<Record<string, any>>;
  source_references: string[];
  suggested_followups: string[];
  chart_config?: {
    type: string;
    title: string;
    data: any[];
  };
  is_llm_powered: boolean;
  status_note?: string;
}
