import React, { useState, useEffect } from 'react';
import {
  FileText, CreditCard, DollarSign, Clock, AlertTriangle, Download,
  Plus, Search, Filter, Eye, CheckCircle2, X
} from 'lucide-react';
import { api } from '../../services/api';
import { InvoiceListItem } from '../../types';

export const BillingPage: React.FC = () => {
  const [metrics, setMetrics] = useState<any>({
    invoiced_amount: 12480000.0,
    payments_received: 11160000.0,
    outstanding_balance: 1320000.0,
    collection_rate: 89.4,
    overdue_amount: 480000.0
  });
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'ageing'>('invoices');
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [ageing, setAgeing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);

  // Form states
  const [paymentForm, setPaymentForm] = useState({
    customer_id: '',
    invoice_id: '',
    amount: '',
    payment_method: 'NEFT/RTGS',
    payment_date: new Date().toISOString().split('T')[0]
  });

  const [creditForm, setCreditForm] = useState({
    customer_id: '',
    invoice_id: '',
    amount: '',
    reason: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [m, invs, pmts, age] = await Promise.all([
        api.getBillingMetrics(),
        api.getInvoices({ search: search || undefined, status: statusFilter !== 'All' ? statusFilter : undefined }),
        api.getPayments(1, 50),
        api.getAgeingAnalysis()
      ]);
      setMetrics(m);
      setInvoices(invs.items || []);
      setPayments(pmts.items || []);
      setAgeing(age);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, statusFilter]);

  const handleOpenInvoiceDetail = async (id: string) => {
    try {
      const detail = await api.getInvoiceDetail(id);
      setSelectedInvoice(detail);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.amount || !paymentForm.customer_id) return;
    try {
      await api.recordPayment({
        customer_id: paymentForm.customer_id,
        invoice_id: paymentForm.invoice_id || undefined,
        amount: parseFloat(paymentForm.amount),
        payment_method: paymentForm.payment_method,
        payment_date: paymentForm.payment_date
      });
      setShowRecordPaymentModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditForm.amount || !creditForm.customer_id) return;
    try {
      await api.createCreditAdjustment({
        customer_id: creditForm.customer_id,
        invoice_id: creditForm.invoice_id || undefined,
        amount: parseFloat(creditForm.amount),
        reason: creditForm.reason
      });
      setShowCreditModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Billing &</span>
            <span className="text-cyan-400">Payments</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Invoice Register, Accounts Receivable Collections & Payment Allocation Ledger
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowCreditModal(true)}
            className="btn-3d flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Credit Adjustment</span>
          </button>

          <button
            onClick={() => setShowRecordPaymentModal(true)}
            className="btn-3d flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-medium shadow-[0_0_15px_rgba(6,182,212,0.35)]"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* TOP METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Invoiced Amount */}
        <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">Total Invoiced</span>
          <div className="text-xl font-bold text-white tracking-tight mt-1">
            ₹{Math.round(metrics.invoiced_amount).toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Eligible billed revenue</span>
        </div>

        {/* Payments Received */}
        <div className="glass-panel p-4 rounded-2xl border border-emerald-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">Payments Received</span>
          <div className="text-xl font-bold text-emerald-400 tracking-tight mt-1">
            ₹{Math.round(metrics.payments_received).toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-emerald-400/80 mt-0.5 block">Treasury collected</span>
        </div>

        {/* Outstanding Balance */}
        <div className="glass-panel glass-panel-red p-4 rounded-2xl border border-rose-500/30">
          <span className="text-[11px] font-medium text-slate-400 block">Outstanding Balance</span>
          <div className="text-xl font-bold text-rose-400 tracking-tight mt-1">
            ₹{Math.round(metrics.outstanding_balance).toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-rose-400/80 mt-0.5 block">Unpaid receivables</span>
        </div>

        {/* Collection Rate */}
        <div className="glass-panel p-4 rounded-2xl border border-blue-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">Collection Rate</span>
          <div className="text-xl font-bold text-blue-400 tracking-tight mt-1">
            {metrics.collection_rate}%
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Paid vs Collectible</span>
        </div>

        {/* Overdue Amount */}
        <div className="glass-panel glass-panel-red p-4 rounded-2xl border border-amber-500/30">
          <span className="text-[11px] font-medium text-slate-400 block">Overdue Amount</span>
          <div className="text-xl font-bold text-amber-400 tracking-tight mt-1">
            ₹{Math.round(metrics.overdue_amount).toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-amber-400/80 mt-0.5 block">Past Net-30 due date</span>
        </div>
      </div>

      {/* TABS & SEARCH */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            {[
              { id: 'invoices', label: 'Invoice Register' },
              { id: 'payments', label: 'Payment Receipts' },
              { id: 'ageing', label: 'AR Ageing Analysis' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === t.id
                    ? 'bg-gradient-to-r from-cyan-950 to-blue-950 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'invoices' && (
            <div className="flex items-center space-x-2">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search invoice number..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="Issued">Issued</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>
          )}
        </div>

        {/* Tab 1: Invoices */}
        {activeTab === 'invoices' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                  <th className="py-2.5 px-3">Invoice Number</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-2">Issue Date</th>
                  <th className="py-2.5 px-2">Due Date</th>
                  <th className="py-2.5 px-2 text-right">Subtotal</th>
                  <th className="py-2.5 px-2 text-right">Total Amount</th>
                  <th className="py-2.5 px-2 text-right">Balance Due</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {invoices.slice(0, 15).map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-cyan-400">{inv.invoice_number}</td>
                    <td className="py-3 px-3 font-semibold text-white">{inv.customer_name}</td>
                    <td className="py-3 px-2 text-slate-400">{inv.issue_date}</td>
                    <td className="py-3 px-2 text-slate-400">{inv.due_date}</td>
                    <td className="py-3 px-2 text-right text-slate-300">₹{inv.subtotal.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-2 text-right font-medium text-white">₹{inv.total_amount.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-2 text-right font-bold text-rose-400">
                      ₹{inv.balance_due.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        inv.status === 'Paid' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40' :
                        inv.status === 'Overdue' ? 'bg-rose-950/80 text-rose-400 border-rose-500/40' :
                        'bg-amber-950/60 text-amber-400 border-amber-500/40'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleOpenInvoiceDetail(inv.id)}
                          className="btn-3d px-2.5 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        >
                          View Lines
                        </button>
                        <button
                          onClick={() => window.open(api.getInvoicePdfUrl(inv.id), '_blank')}
                          className="btn-3d p-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-400 border border-cyan-500/30"
                          title="Download PDF Invoice"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Payments */}
        {activeTab === 'payments' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                  <th className="py-2.5 px-3">Payment Reference</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-2">Payment Date</th>
                  <th className="py-2.5 px-2">Method</th>
                  <th className="py-2.5 px-2 text-right">Amount</th>
                  <th className="py-2.5 px-2 text-right">Allocated Amount</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {payments.slice(0, 15).map((pmt) => (
                  <tr key={pmt.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-emerald-400">{pmt.payment_reference}</td>
                    <td className="py-3 px-3 font-semibold text-white">{pmt.customer_name}</td>
                    <td className="py-3 px-2 text-slate-400">{pmt.payment_date}</td>
                    <td className="py-3 px-2 text-slate-300">{pmt.method}</td>
                    <td className="py-3 px-2 text-right font-bold text-white">₹{pmt.amount.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-2 text-right text-emerald-400">₹{pmt.allocated_amount.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-2 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                        {pmt.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Ageing Analysis */}
        {activeTab === 'ageing' && ageing && (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase block">Current (Not Due)</span>
                <span className="text-lg font-bold text-emerald-400 mt-1 block">₹{Math.round(ageing.current).toLocaleString('en-IN')}</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase block">1 – 30 Days</span>
                <span className="text-lg font-bold text-amber-400 mt-1 block">₹{Math.round(ageing.days_1_30).toLocaleString('en-IN')}</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase block">31 – 60 Days</span>
                <span className="text-lg font-bold text-amber-500 mt-1 block">₹{Math.round(ageing.days_31_60).toLocaleString('en-IN')}</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase block">61 – 90 Days</span>
                <span className="text-lg font-bold text-rose-400 mt-1 block">₹{Math.round(ageing.days_61_90).toLocaleString('en-IN')}</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase block">&gt; 90 Days</span>
                <span className="text-lg font-bold text-rose-500 mt-1 block">₹{Math.round(ageing.days_over_90).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-slate-300">
              Total overdue portfolio represents ₹{Math.round(ageing.total_outstanding - ageing.current).toLocaleString('en-IN')} subject to active automated dunning reminders.
            </div>
          </div>
        )}
      </div>

      {/* INVOICE DETAIL MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Invoice #{selectedInvoice.invoice.invoice_number}</h3>
                <p className="text-xs text-slate-400">{selectedInvoice.invoice.customer_name} • Due: {selectedInvoice.invoice.due_date}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-2">Item Description</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Rate</th>
                    <th className="py-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {selectedInvoice.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="py-2 text-slate-200">{l.description}</td>
                      <td className="py-2 text-right text-slate-400">{l.quantity}</td>
                      <td className="py-2 text-right text-slate-400">₹{l.unit_price.toLocaleString('en-IN')}</td>
                      <td className="py-2 text-right font-medium text-white">₹{l.line_total.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pt-3 border-t border-slate-800 flex justify-between font-bold text-sm">
                <span className="text-slate-400">Total Invoice Amount:</span>
                <span className="text-cyan-400">₹{selectedInvoice.invoice.total_amount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                onClick={() => window.open(api.getInvoicePdfUrl(selectedInvoice.invoice.id), '_blank')}
                className="btn-3d flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Official PDF</span>
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {showRecordPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white pb-3 border-b border-slate-800">Record Internal Payment</h3>
            <form onSubmit={handleRecordPayment} className="py-4 space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Customer</label>
                <select
                  value={paymentForm.customer_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, customer_id: e.target.value })}
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                >
                  <option value="">Select Customer</option>
                  {invoices.map((inv) => (
                    <option key={inv.customer_id} value={inv.customer_id}>{inv.customer_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Amount (₹)</label>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="e.g. 150000"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Payment Method</label>
                <select
                  value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                >
                  <option value="NEFT/RTGS">NEFT / RTGS</option>
                  <option value="Bank Wire">Bank Wire</option>
                  <option value="Corporate Card">Corporate Card</option>
                  <option value="ACH">ACH Transfer</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRecordPaymentModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-3d px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-sm"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREDIT ADJUSTMENT MODAL */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white pb-3 border-b border-slate-800">Apply Authorized Credit Adjustment</h3>
            <form onSubmit={handleCreateCredit} className="py-4 space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Customer</label>
                <select
                  value={creditForm.customer_id}
                  onChange={(e) => setCreditForm({ ...creditForm, customer_id: e.target.value })}
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                >
                  <option value="">Select Customer</option>
                  {invoices.map((inv) => (
                    <option key={inv.customer_id} value={inv.customer_id}>{inv.customer_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Credit Amount (₹)</label>
                <input
                  type="number"
                  value={creditForm.amount}
                  onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                  placeholder="e.g. 50000"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Reason / Authorization</label>
                <textarea
                  value={creditForm.reason}
                  onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })}
                  placeholder="e.g. SLA downtime credit agreed in Ticket #4928"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none h-16"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreditModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-3d px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-sm"
                >
                  Apply Credit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
