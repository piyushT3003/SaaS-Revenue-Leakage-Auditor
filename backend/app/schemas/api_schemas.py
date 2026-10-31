from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field

# ----------------- Auth & Users -----------------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "Analyst"

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# ----------------- Executive Overview -----------------
class SparklinePoint(BaseModel):
    period: str
    value: float

class KPICard(BaseModel):
    label: str
    value: str
    raw_value: float
    change_pct: float
    change_direction: str  # "up" or "down"
    change_label: str      # "vs last month"
    sparkline: List[float]

class RevenueHealthInfo(BaseModel):
    score: float
    trend: str
    status: str
    factors: Dict[str, Any]

class RevenueTrendPoint(BaseModel):
    month: str
    billed_revenue: float
    expected_revenue: float
    revenue_leakage: float

class BillingExceptionTypeDistribution(BaseModel):
    type: str
    count: int
    percentage: float
    color: str
    financial_impact: float

class CustomerProfitabilitySummary(BaseModel):
    profitable_count: int
    profitable_pct: float
    at_risk_count: int
    at_risk_pct: float
    unprofitable_count: int
    unprofitable_pct: float
    total_customers: int

class RecentExceptionItem(BaseModel):
    id: str
    exception_code: str
    customer_id: str
    customer_name: str
    customer_logo: Optional[str] = None
    issue_type: str
    description: str
    financial_impact: float
    status: str
    severity: str
    detected_at: datetime

class ExecutiveOverviewResponse(BaseModel):
    period_start: str
    period_end: str
    mrr_kpi: KPICard
    leakage_kpi: KPICard
    outstanding_kpi: KPICard
    active_customers_kpi: KPICard
    contribution_margin_kpi: KPICard
    revenue_health: RevenueHealthInfo
    revenue_trends: List[RevenueTrendPoint]
    exceptions_by_type: List[BillingExceptionTypeDistribution]
    customer_profitability: CustomerProfitabilitySummary
    recent_exceptions: List[RecentExceptionItem]

# ----------------- Reconciliation -----------------
class ReconciliationRow(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    contract_number: str
    product_name: str
    billing_period: str
    contract_amount: float
    usage_value: float
    invoiced_amount: float
    variance: float
    variance_pct: float
    status: str  # "Matched", "Underbilled", "Overbilled", "Missing", "Unmatched"
    calculation_details: Dict[str, Any]

class ReconciliationSummary(BaseModel):
    expected_charges: float
    invoiced_amount: float
    variance_amount: float
    reconciliation_rate: float
    matched_records: int
    unmatched_records: int
    total_obligations: int

class ReconciliationResponse(BaseModel):
    period: str
    summary: ReconciliationSummary
    rows: List[ReconciliationRow]
    run_history: List[Dict[str, Any]]

# ----------------- Exception Management -----------------
class InvestigationNoteSchema(BaseModel):
    id: str
    user_name: str
    note_text: str
    created_at: datetime

class EvidenceItemSchema(BaseModel):
    id: str
    evidence_type: str
    title: str
    data: Dict[str, Any]
    created_at: datetime

class ExceptionDetail(BaseModel):
    id: str
    exception_code: str
    customer_id: str
    customer_name: str
    issue_type: str
    severity: str
    financial_impact: float
    status: str
    assigned_to_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    description: str
    calculation_explanation: str
    source_records: Dict[str, Any]
    resolved_reason: Optional[str] = None
    resolved_by_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    detected_at: datetime
    notes: List[InvestigationNoteSchema]
    evidence: List[EvidenceItemSchema]

class ExceptionResolveRequest(BaseModel):
    resolution_reason: str = Field(..., min_length=5)

class ExceptionAssignRequest(BaseModel):
    assigned_to_id: str

class ExceptionStatusRequest(BaseModel):
    status: str  # Open, In Progress, Resolved

class ExceptionNoteCreate(BaseModel):
    note_text: str = Field(..., min_length=2)

# ----------------- Customer Intelligence -----------------
class CustomerListItem(BaseModel):
    id: str
    customer_code: str
    name: str
    segment: str
    plan_tier: str
    status: str
    mrr: float
    annual_revenue: float
    health_score: float
    health_status: str
    active_subscriptions: int
    open_exceptions_count: int
    outstanding_balance: float

class CustomerDetail(BaseModel):
    customer: CustomerListItem
    contracts: List[Dict[str, Any]]
    subscriptions: List[Dict[str, Any]]
    usage_trends: List[Dict[str, Any]]
    invoices: List[Dict[str, Any]]
    payments: List[Dict[str, Any]]
    exceptions: List[Dict[str, Any]]
    unit_economics: Dict[str, Any]

# ----------------- Billing & Payments -----------------
class InvoiceLineSchema(BaseModel):
    id: Optional[str] = None
    product_id: Optional[str] = None
    description: str
    quantity: float
    unit_price: float
    discount_pct: float
    line_total: float
    line_type: str

class InvoiceListItem(BaseModel):
    id: str
    invoice_number: str
    customer_id: str
    customer_name: str
    billing_period_start: str
    billing_period_end: str
    issue_date: str
    due_date: str
    subtotal: float
    tax_amount: float
    total_amount: float
    paid_amount: float
    balance_due: float
    status: str

class InvoiceDetail(BaseModel):
    invoice: InvoiceListItem
    lines: List[InvoiceLineSchema]
    allocations: List[Dict[str, Any]]
    credit_adjustments: List[Dict[str, Any]]

class DraftInvoiceCreate(BaseModel):
    customer_id: str
    billing_period_start: date
    billing_period_end: date
    due_date: date
    lines: List[InvoiceLineSchema]

class PaymentRecordRequest(BaseModel):
    customer_id: str
    invoice_id: Optional[str] = None
    amount: float = Field(..., gt=0)
    payment_method: str = "Bank Transfer"
    payment_date: date

class CreditAdjustmentCreate(BaseModel):
    customer_id: str
    invoice_id: Optional[str] = None
    amount: float = Field(..., gt=0)
    reason: str = Field(..., min_length=5)

class AgeingAnalysis(BaseModel):
    current: float
    days_1_30: float
    days_31_60: float
    days_61_90: float
    days_over_90: float
    total_outstanding: float

# ----------------- Customer Unit Economics -----------------
class UnitEconomicsResponse(BaseModel):
    period: str
    arpc: float
    acpc: float
    contribution_per_customer: float
    overall_contribution_margin: float
    profitable_customers_count: int
    at_risk_customers_count: int
    unprofitable_customers_count: int
    revenue_vs_cost_trends: List[Dict[str, Any]]
    product_profitability: List[Dict[str, Any]]
    segment_profitability: List[Dict[str, Any]]
    cost_breakdown: List[Dict[str, Any]]
    customer_rankings: List[Dict[str, Any]]
    allocation_methodology_doc: str

# ----------------- AI Investigation Assistant -----------------
class AIQueryRequest(BaseModel):
    question: str = Field(..., min_length=3)
    conversation_id: Optional[str] = None

class AIQueryResponse(BaseModel):
    answer: str
    reporting_period: str
    supporting_metrics: Dict[str, Any]
    explanation: str
    affected_customers: List[Dict[str, Any]]
    issue_distribution: List[Dict[str, Any]]
    source_references: List[str]
    suggested_followups: List[str]
    chart_config: Optional[Dict[str, Any]] = None
    is_llm_powered: bool
    status_note: Optional[str] = None

# ----------------- Data Management -----------------
class DataQualityReport(BaseModel):
    overall_score: float
    total_records: int
    valid_records: int
    invalid_records: int
    duplicate_records: int
    last_sync: str
    sources_summary: List[Dict[str, Any]]

class BatchImportConfirmRequest(BaseModel):
    batch_id: str

# ----------------- Settings -----------------
class AppSettingsSchema(BaseModel):
    workspace_name: str = "Enterprise SaaS Assurance"
    default_currency: str = "INR"
    currency_symbol: str = "₹"
    timezone: str = "Asia/Kolkata"
    date_format: str = "DD/MM/YYYY"
    underbilling_threshold: float = 50000.0
    overdue_days_alert: int = 30
    ai_provider: str = "Google Gemini"
    gemini_api_key_configured: bool = False
    reduced_motion: bool = False
    display_density: str = "comfortable"
