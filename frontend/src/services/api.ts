const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8085/api/v1';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'API Request Failed';
    try {
      const err = await response.json();
      errorDetail = err.detail || errorDetail;
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ access_token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }),

  getMe: () => request<any>('/auth/me'),

  // Executive Overview
  getOverview: (periodStart = '2026-10-01', periodEnd = '2026-10-31') =>
    request<any>(`/overview?period_start=${periodStart}&period_end=${periodEnd}`),

  exportOverview: (format: 'csv' | 'xlsx' | 'pdf') =>
    `${API_BASE}/overview/export?format=${format}`,

  // Reconciliation
  getReconciliation: (period = '2026-10', customerId?: string, productId?: string, status?: string) => {
    let url = `/reconciliation?period=${period}`;
    if (customerId) url += `&customer_id=${customerId}`;
    if (productId) url += `&product_id=${productId}`;
    if (status && status !== 'All') url += `&status=${status}`;
    return request<any>(url);
  },

  triggerReconciliation: (period = '2026-10') =>
    request<any>(`/reconciliation/run?period=${period}`, { method: 'POST' }),

  getReconciliationJobs: (limit = 20) =>
    request<any[]>(`/reconciliation/jobs?limit=${limit}`),

  getReconciliationJobStatus: (jobId: string) =>
    request<any>(`/reconciliation/jobs/${jobId}`),

  exportReconciliation: (period = '2026-10', format: 'csv' | 'xlsx' = 'csv') =>
    `${API_BASE}/reconciliation/export?period=${period}&format=${format}`,

  getReconciliationReadiness: (period = '2026-10', customerId?: string, productId?: string) => {
    let url = `/reconciliation/readiness?period=${period}`;
    if (customerId) url += `&customer_id=${customerId}`;
    if (productId) url += `&product_id=${productId}`;
    return request<any>(url);
  },

  getReconciliationStatus: (period = '2026-10') =>
    request<any>(`/reconciliation/status?period=${period}`),

  // Exceptions
  getExceptions: (params: { search?: string; issue_type?: string; severity?: string; status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.issue_type && params.issue_type !== 'All') q.append('issue_type', params.issue_type);
    if (params.severity && params.severity !== 'All') q.append('severity', params.severity);
    if (params.status && params.status !== 'All') q.append('status', params.status);
    if (params.page) q.append('page', params.page.toString());
    if (params.limit) q.append('limit', params.limit.toString());
    return request<any>(`/exceptions?${q.toString()}`);
  },

  getExceptionDetail: (id: string) => request<any>(`/exceptions/${id}`),

  assignException: (id: string, assignedToId: string) =>
    request<any>(`/exceptions/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigned_to_id: assignedToId })
    }),

  updateExceptionStatus: (id: string, status: string) =>
    request<any>(`/exceptions/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    }),

  addExceptionNote: (id: string, noteText: string) =>
    request<any>(`/exceptions/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note_text: noteText })
    }),

  resolveException: (id: string, resolutionReason: string) =>
    request<any>(`/exceptions/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution_reason: resolutionReason })
    }),

  exportExceptions: (format: 'csv' | 'xlsx' = 'csv') =>
    `${API_BASE}/exceptions/export?format=${format}`,

  // Customers
  getCustomers: (params: { search?: string; segment?: string; plan_tier?: string; status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.segment && params.segment !== 'All') q.append('segment', params.segment);
    if (params.plan_tier && params.plan_tier !== 'All') q.append('plan_tier', params.plan_tier);
    if (params.status && params.status !== 'All') q.append('status', params.status);
    if (params.page) q.append('page', params.page.toString());
    if (params.limit) q.append('limit', params.limit.toString());
    return request<any>(`/customers?${q.toString()}`);
  },

  getCustomerDetail: (id: string) => request<any>(`/customers/${id}`),

  exportCustomers: (format: 'csv' | 'xlsx' = 'csv') =>
    `${API_BASE}/customers/export?format=${format}`,

  // Billing
  getBillingMetrics: () => request<any>('/billing/metrics'),

  getInvoices: (params: { search?: string; customer_id?: string; status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.customer_id) q.append('customer_id', params.customer_id);
    if (params.status && params.status !== 'All') q.append('status', params.status);
    if (params.page) q.append('page', params.page.toString());
    if (params.limit) q.append('limit', params.limit.toString());
    return request<any>(`/billing/invoices?${q.toString()}`);
  },

  getInvoiceDetail: (id: string) => request<any>(`/billing/invoices/${id}`),

  createDraftInvoice: (data: any) =>
    request<any>('/billing/invoices/draft', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getInvoicePdfUrl: (id: string) => `${API_BASE}/billing/invoices/${id}/pdf`,

  getPayments: (page = 1, limit = 50) =>
    request<any>(`/billing/payments?page=${page}&limit=${limit}`),

  recordPayment: (data: { customer_id: string; invoice_id?: string; amount: number; payment_method: string; payment_date: string }) =>
    request<any>('/billing/payments', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  refundPayment: (paymentId: string, reason?: string) =>
    request<any>(`/billing/payments/${paymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Customer requested refund' })
    }),

  createCreditAdjustment: (data: { customer_id: string; invoice_id?: string; amount: number; reason: string }) =>
    request<any>('/billing/credits', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getAgeingAnalysis: () => request<any>('/billing/ageing'),

  getCredits: (page = 1, limit = 50) =>
    request<any>(`/billing/credits?page=${page}&limit=${limit}`),

  createBillingCorrection: (data: {
    customer_id: string;
    amount: number;
    description?: string;
    reason: string;
    exception_id?: string;
    original_invoice_id?: string;
    period_start?: string;
    period_end?: string;
  }) =>
    request<any>('/billing/corrections', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Unit Economics
  getUnitEconomics: (period = '2026-10', segment?: string) => {
    let url = `/unit-economics?period=${period}`;
    if (segment && segment !== 'All') url += `&segment=${segment}`;
    return request<any>(url);
  },

  exportUnitEconomics: () => `${API_BASE}/unit-economics/export`,

  // AI Investigation Assistant
  askAI: (question: string) =>
    request<any>('/ai/query', {
      method: 'POST',
      body: JSON.stringify({ question })
    }),

  getSuggestedQuestions: () => request<any>('/ai/suggested'),

  exportAIReport: (question: string) =>
    fetch(`${API_BASE}/ai/export-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    }),

  // Data Management
  getDataSources: () => request<any>('/data/sources'),

  getDataQuality: () => request<any>('/data/quality'),

  validateUpload: async (file: File, dataType = 'Usage') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('data_type', dataType);

    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/data/validate-upload`, {
      method: 'POST',
      headers,
      body: formData
    });
    if (!res.ok) throw new Error('File validation failed');
    return res.json();
  },

  confirmImport: (batchId: string) => {
    const formData = new FormData();
    formData.append('batch_id', batchId);
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(`${API_BASE}/data/confirm-import`, {
      method: 'POST',
      headers,
      body: formData
    }).then(r => {
      if (!r.ok) throw new Error('Confirm import failed');
      return r.json();
    });
  },

  rollbackBatch: (batchId: string) =>
    request<any>(`/data/rollback/${batchId}`, { method: 'POST' }),

  getBatches: () => request<any>('/data/batches'),

  downloadRejectedRecords: (batchId: string) =>
    `${API_BASE}/data/batches/${batchId}/rejected`,

  getSampleCsvUrl: () => `${API_BASE}/data/download-sample`,

  // Settings
  getSettings: () => request<any>('/settings'),

  updateSettings: (data: any) =>
    request<any>('/settings', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getUsers: () => request<any>('/settings/users'),

  createUser: (userData: any) =>
    request<any>('/settings/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    }),

  createBackup: (backupName?: string) =>
    request<any>('/settings/backup', {
      method: 'POST',
      body: JSON.stringify({ backup_name: backupName })
    }),

  restoreBackup: (backupName: string) =>
    request<any>('/settings/restore', {
      method: 'POST',
      body: JSON.stringify({ backup_name: backupName })
    }),

  listBackups: () => request<any[]>('/settings/backups'),

  getAuditLogs: () => request<any>('/settings/audit-logs'),

  getNotifications: () => request<any>('/settings/notifications'),

  markAllNotificationsRead: () => request<any>('/settings/notifications/read-all', { method: 'POST' }),

  markNotificationRead: (id: string) => request<any>(`/settings/notifications/${id}/read`, { method: 'POST' }),

  testAIConnection: (apiKey: string) =>
    request<any>('/settings/ai/test-connection', {
      method: 'POST',
      body: JSON.stringify({ api_key: apiKey })
    }),

  // Global Search
  search: (query: string) => request<any>(`/search?q=${encodeURIComponent(query)}`),

  // =====================================================
  // ADVANCED ENTERPRISE 3D CAPABILITIES
  // =====================================================

  // 1. Revenue Evidence Graph
  getEvidenceGraph: (customerId?: string, exceptionId?: string) => {
    let url = '/evidence-graph?';
    if (customerId) url += `customer_id=${customerId}&`;
    if (exceptionId) url += `exception_id=${exceptionId}&`;
    return request<any>(url);
  },

  // 2. Historical Billing Replay Engine
  runHistoricalReplay: (period = '2026-08', customerId?: string) =>
    request<any>('/historical-replay/run', {
      method: 'POST',
      body: JSON.stringify({ period, customer_id: customerId })
    }),

  getHistoricalReplays: () => request<any[]>('/historical-replay/runs'),

  compareHistoricalReplays: (runIdA: string, runIdB: string) =>
    request<any>(`/historical-replay/compare?run_id_a=${runIdA}&run_id_b=${runIdB}`),

  // 3. What-If Revenue Recovery Simulator
  runWhatIfSimulation: (params: {
    name?: string;
    description?: string;
    baseline_period?: string;
    target_type?: string;
    target_id?: string;
    overage_rate_multiplier?: number;
    base_fee_multiplier?: number;
    minimum_commit_multiplier?: number;
    discount_cap_percent?: number;
    tier_threshold_adjustment_pct?: number;
    save?: boolean;
  }) =>
    request<any>('/what-if/simulate', {
      method: 'POST',
      body: JSON.stringify(params)
    }),

  getWhatIfScenarios: () => request<any[]>('/what-if/scenarios'),

  getWhatIfScenario: (id: string) => request<any>(`/what-if/scenarios/${id}`),

  deleteWhatIfScenario: (id: string) =>
    request<any>(`/what-if/scenarios/${id}`, { method: 'DELETE' }),

  // 4. Intelligent Leakage Prioritization
  getPrioritizedExceptions: () => request<any>('/prioritization/scores'),

  assignPrioritizedExceptions: (exceptionIds: string[], assigneeId: string) =>
    request<any>('/prioritization/assign', {
      method: 'POST',
      body: JSON.stringify({ exception_ids: exceptionIds, assignee_id: assigneeId })
    }),

  overrideExceptionPriority: (exceptionId: string, priority: string, reason: string) =>
    request<any>('/prioritization/override', {
      method: 'POST',
      body: JSON.stringify({ exception_id: exceptionId, priority, reason })
    }),

  // 5. Usage Meter Integrity Monitor
  scanUsageIntegrity: (period = '2026-10', sourceName = 'Primary Ingestion API Stream') =>
    request<any>('/usage-integrity/scan', {
      method: 'POST',
      body: JSON.stringify({ period, source_name: sourceName })
    }),

  getUsageIntegrityReports: () => request<any[]>('/usage-integrity/reports'),

  getUsageIntegrityReport: (id: string) => request<any>(`/usage-integrity/reports/${id}`),

  // 6. Billing Rules Regression Testing Lab
  testBillingRuleProposal: (proposalData: {
    title: string;
    description?: string;
    test_period?: string;
    proposed_rule?: any;
  }) =>
    request<any>('/billing-lab/test', {
      method: 'POST',
      body: JSON.stringify(proposalData)
    }),

  getBillingRuleProposals: () => request<any[]>('/billing-lab/proposals'),

  getBillingRuleProposal: (id: string) => request<any>(`/billing-lab/proposals/${id}`),

  reviewBillingRuleProposal: (id: string, newStatus: string, notes?: string) =>
    request<any>(`/billing-lab/proposals/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ new_status: newStatus, notes })
    }),

  // 7. Systemic Root Cause & Blast Radius Analysis
  getRootCauseClusters: () => request<any>('/root-cause/clusters'),

  confirmRootCauseCluster: (clusterId: string, status: string, confirmedCause: string, notes?: string) =>
    request<any>(`/root-cause/clusters/${clusterId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ status, confirmed_cause: confirmedCause, investigation_notes: notes })
    }),

  // 8. Automated Audit Evidence Pack
  generateEvidencePack: (packType: string, targetId?: string, period = '2026-10') =>
    request<any>('/evidence-pack/generate', {
      method: 'POST',
      body: JSON.stringify({ pack_type: packType, target_id: targetId, period })
    }),

  getEvidencePacks: () => request<any[]>('/evidence-pack/packs'),

  getEvidencePack: (id: string) => request<any>(`/evidence-pack/${id}`),

  downloadEvidencePackPdfUrl: (id: string) => `${API_BASE}/evidence-pack/${id}/pdf`,

  downloadEvidencePackXlsxUrl: (id: string) => `${API_BASE}/evidence-pack/${id}/xlsx`
};
