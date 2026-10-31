const API_BASE = 'http://localhost:8000/api/v1';

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

  exportReconciliation: (period = '2026-10', format: 'csv' | 'xlsx' = 'csv') =>
    `${API_BASE}/reconciliation/export?period=${period}&format=${format}`,

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

  createCreditAdjustment: (data: { customer_id: string; invoice_id?: string; amount: number; reason: string }) =>
    request<any>('/billing/credits', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getAgeingAnalysis: () => request<any>('/billing/ageing'),

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
    return fetch(`${API_BASE}/data/confirm-import`, {
      method: 'POST',
      body: formData
    }).then(r => r.json());
  },

  rollbackBatch: (batchId: string) =>
    request<any>(`/data/rollback/${batchId}`, { method: 'POST' }),

  getBatches: () => request<any>('/data/batches'),

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
  search: (query: string) => request<any>(`/search?q=${encodeURIComponent(query)}`)
};
