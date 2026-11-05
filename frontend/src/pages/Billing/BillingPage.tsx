import React, { useState, useEffect } from 'react';
import {
  FileText, CreditCard, DollarSign, Clock, AlertTriangle, Download,
  Plus, Search, Filter, Eye, CheckCircle2, X, Share2
} from 'lucide-react';
import { api } from '../../services/api';
import { InvoiceListItem } from '../../types';
import { Interactive3DCard } from '../../components/3d/Interactive3DCard';
import { AnimatedNumber } from '../../components/3d/AnimatedNumber';
import { PageTransition } from '../../components/3d/PageTransition';
import { StaggeredContainer } from '../../components/3d/StaggeredContainer';
import { MagneticButton } from '../../components/3d/MagneticButton';
import { HistoricalReplayModal } from '../../components/3d/HistoricalReplayModal';
import { RevenueEvidenceGraphModal } from '../../components/3d/RevenueEvidenceGraphModal';

export const BillingPage: React.FC = () => {
  const [metrics, setMetrics] = useState<any>({
    invoiced_amount: 12480000.0,
    payments_received: 11160000.0,
    outstanding_balance: 1320000.0,
    collection_rate: 89.4,
    overdue_amount: 480000.0
  });
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'credits' | 'ageing'>('invoices');
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [ageing, setAgeing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [showEvidenceGraph, setShowEvidenceGraph] = useState(false);

  // Form states
  const [draftForm, setDraftForm] = useState({
    customer_id: '',
    billing_period_start: '2026-10-01',
    billing_period_end: '2026-10-31',
    due_date: '2026-11-30',
    description: 'Enterprise Cloud Platform Subscription & API Metered Usage',
    quantity: '1',
    unit_price: '100000',
    discount_pct: '0',
    line_type: 'Fixed'
  });

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
      const [m, invs, pmts, creds, age] = await Promise.all([
        api.getBillingMetrics(),
        api.getInvoices({ search: search || undefined, status: statusFilter !== 'All' ? statusFilter : undefined }),
        api.getPayments(1, 50),
        api.getCredits(1, 50),
        api.getAgeingAnalysis()
      ]);
      setMetrics(m);
      setInvoices(invs.items || []);
      setPayments(pmts.items || []);
      setCredits(creds.items || []);
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

  const handleCreateDraftInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftForm.customer_id || !draftForm.unit_price) return;
    try {
      const qty = parseFloat(draftForm.quantity) || 1;
      const price = parseFloat(draftForm.unit_price) || 0;
      const disc = parseFloat(draftForm.discount_pct) || 0;

      await api.createDraftInvoice({
        customer_id: draftForm.customer_id,
        billing_period_start: draftForm.billing_period_start,
        billing_period_end: draftForm.billing_period_end,
        due_date: draftForm.due_date,
        lines: [
          {
            description: draftForm.description,
            quantity: qty,
            unit_price: price,
            discount_pct: disc,
            line_type: draftForm.line_type
          }
        ]
      });
      setShowDraftModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <PageTransition className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Billing &amp;</span>
            <span className="text-cyan-400">Payments</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Invoice Register, Accounts Receivable Collections &amp; Payment Allocation Ledger
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowReplayModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/40 hover:bg-cyan-900/50 text-cyan-300 text-xs font-semibold transition-colors btn-3d shadow-sm"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Historical Replay</span>
          </button>

          <MagneticButton
            onClick={() => setShowDraftModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>Generate Draft Invoice</span>
          </MagneticButton>

          <MagneticButton
            onClick={() => setShowCreditModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Credit Adjustment</span>
          </MagneticButton>

          <MagneticButton
            onClick={() => setShowRecordPaymentModal(true)}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-medium shadow-[0_0_15px_rgba(6,182,212,0.35)]"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </MagneticButton>
        </div>
      </div>

      {/* TOP METRIC CARDS */}
      <StaggeredContainer className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Invoiced Amount */}
        <Interactive3DCard
          glowColor="cyan"
          className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-lg"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Total Invoiced</span>
          <div className="text-xl font-bold text-white tracking-tight mt-1">
            <AnimatedNumber value={metrics.invoiced_amount} formatAsCurrency prefix="₹" />
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Eligible billed revenue</span>
        </Interactive3DCard>

        {/* Payments Received */}
        <Interactive3DCard
          glowColor="emerald"
          className="glass-panel p-4 rounded-2xl border border-emerald-500/20 shadow-lg"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Payments Received</span>
          <div className="text-xl font-bold text-emerald-400 tracking-tight mt-1">
            <AnimatedNumber value={metrics.payments_received} formatAsCurrency prefix="₹" />
          </div>
          <span className="text-[10px] text-emerald-400/80 mt-0.5 block">Treasury collected</span>
        </Interactive3DCard>

        {/* Outstanding Balance */}
        <Interactive3DCard
          glowColor="rose"
          className="glass-panel glass-panel-red p-4 rounded-2xl border border-rose-500/30 shadow-[0_0_20px_rgba(225,29,72,0.18)]"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Outstanding Balance</span>
          <div className="text-xl font-bold text-rose-400 tracking-tight mt-1">
            <AnimatedNumber value={metrics.outstanding_balance} formatAsCurrency prefix="₹" />
          </div>
          <span className="text-[10px] text-rose-400/80 mt-0.5 block">Unpaid receivables</span>
        </Interactive3DCard>

        {/* Collection Rate */}
        <Interactive3DCard
          glowColor="blue"
          className="glass-panel p-4 rounded-2xl border border-blue-500/20 shadow-lg"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Collection Rate</span>
          <div className="text-xl font-bold text-blue-400 tracking-tight mt-1">
            <AnimatedNumber value={metrics.collection_rate} suffix="%" />
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Paid vs Collectible</span>
        </Interactive3DCard>

        {/* Overdue Amount */}
        <Interactive3DCard
          glowColor="amber"
          className="glass-panel glass-panel-red p-4 rounded-2xl border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.18)]"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Overdue Amount</span>
          <div className="text-xl font-bold text-amber-400 tracking-tight mt-1">
            <AnimatedNumber value={metrics.overdue_amount} formatAsCurrency prefix="₹" />
          </div>
          <span className="text-[10px] text-amber-400/80 mt-0.5 block">Past Net-30 due date</span>
        </Interactive3DCard>
      </StaggeredContainer>

      {/* TABS & SEARCH */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            {[
              { id: 'invoices', label: 'Invoice Register' },
              { id: 'payments', label: 'Payment Receipts' },
              { id: 'credits', label: 'Credit Adjustments' },
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

        {/* Tab 3: Credit Adjustments */}
        {activeTab === 'credits' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Complete adjustment history — {credits.length} record{credits.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => setShowCreditModal(true)}
                className="btn-3d flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-medium shadow-[0_0_12px_rgba(245,158,11,0.3)]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Issue Credit Adjustment</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500 tracking-wider">
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-2">Invoice Ref</th>
                    <th className="py-2.5 px-2 text-right">Amount</th>
                    <th className="py-2.5 px-2">Reason</th>
                    <th className="py-2.5 px-2">Authorized By</th>
                    <th className="py-2.5 px-2">Date</th>
                    <th className="py-2.5 px-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {credits.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No credit adjustments recorded. Use "Issue Credit Adjustment" to create one.
                      </td>
                    </tr>
                  ) : (
                    credits.map((cr) => (
                      <tr key={cr.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-amber-400">{cr.id.slice(0, 8).toUpperCase()}</td>
                        <td className="py-3 px-3 font-semibold text-white">{cr.customer_name}</td>
                        <td className="py-3 px-2 text-slate-400 font-mono">{cr.invoice_number}</td>
                        <td className="py-3 px-2 text-right font-bold text-amber-400">₹{Math.round(cr.amount).toLocaleString('en-IN')}</td>
                        <td className="py-3 px-2 text-slate-300 max-w-[180px] truncate" title={cr.reason}>{cr.reason}</td>
                        <td className="py-3 px-2 text-slate-400">{cr.authorized_by}</td>
                        <td className="py-3 px-2 text-slate-400">{new Date(cr.created_at).toLocaleDateString('en-IN')}</td>
                        <td className="py-3 px-2 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                            {cr.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Ageing Analysis */}
        {activeTab === 'ageing' && ageing && (
          <div className="space-y-4">
            <p className="text-[10px] text-slate-500">Click any segment to view overdue invoices in the Invoice Register</p>
            <div className="grid grid-cols-5 gap-3">
              <div
                onClick={() => { setActiveTab('invoices'); setStatusFilter('Issued'); }}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-950/20 transition-all"
              >
                <span className="text-[10px] text-slate-500 uppercase block">Current (Not Due)</span>
                <span className="text-lg font-bold text-emerald-400 mt-1 block">₹{Math.round(ageing.current).toLocaleString('en-IN')}</span>
              </div>
              <div
                onClick={() => { setActiveTab('invoices'); setStatusFilter('Overdue'); }}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center cursor-pointer hover:border-amber-500/40 hover:bg-amber-950/20 transition-all"
              >
                <span className="text-[10px] text-slate-500 uppercase block">1 – 30 Days</span>
                <span className="text-lg font-bold text-amber-400 mt-1 block">₹{Math.round(ageing.days_1_30).toLocaleString('en-IN')}</span>
              </div>
              <div
                onClick={() => { setActiveTab('invoices'); setStatusFilter('Overdue'); }}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center cursor-pointer hover:border-amber-500/40 hover:bg-amber-950/20 transition-all"
              >
                <span className="text-[10px] text-slate-500 uppercase block">31 – 60 Days</span>
                <span className="text-lg font-bold text-amber-500 mt-1 block">₹{Math.round(ageing.days_31_60).toLocaleString('en-IN')}</span>
              </div>
              <div
                onClick={() => { setActiveTab('invoices'); setStatusFilter('Overdue'); }}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center cursor-pointer hover:border-rose-500/40 hover:bg-rose-950/20 transition-all"
              >
                <span className="text-[10px] text-slate-500 uppercase block">61 – 90 Days</span>
                <span className="text-lg font-bold text-rose-400 mt-1 block">₹{Math.round(ageing.days_61_90).toLocaleString('en-IN')}</span>
              </div>
              <div
                onClick={() => { setActiveTab('invoices'); setStatusFilter('Overdue'); }}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center cursor-pointer hover:border-rose-500/40 hover:bg-rose-950/20 transition-all"
              >
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
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.open(api.getInvoicePdfUrl(selectedInvoice.invoice.id), '_blank')}
                  className="btn-3d flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Official PDF</span>
                </button>
                <button
                  onClick={() => setShowEvidenceGraph(true)}
                  className="btn-3d flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 text-xs font-medium"
                >
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Revenue Evidence Lineage</span>
                </button>
              </div>
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

      {/* DRAFT INVOICE GENERATION MODAL */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Generate Verified Draft Invoice</span>
              </h3>
              <button onClick={() => setShowDraftModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDraftInvoice} className="py-4 space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Customer Account</label>
                <select
                  value={draftForm.customer_id}
                  onChange={(e) => setDraftForm({ ...draftForm, customer_id: e.target.value })}
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                >
                  <option value="">Select Target Customer</option>
                  {invoices.map((inv) => (
                    <option key={inv.customer_id} value={inv.customer_id}>{inv.customer_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Billing Period Start</label>
                  <input
                    type="date"
                    value={draftForm.billing_period_start}
                    onChange={(e) => setDraftForm({ ...draftForm, billing_period_start: e.target.value })}
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Billing Period End</label>
                  <input
                    type="date"
                    value={draftForm.billing_period_end}
                    onChange={(e) => setDraftForm({ ...draftForm, billing_period_end: e.target.value })}
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Net-30 Due Date</label>
                  <input
                    type="date"
                    value={draftForm.due_date}
                    onChange={(e) => setDraftForm({ ...draftForm, due_date: e.target.value })}
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Line Charge Type</label>
                  <select
                    value={draftForm.line_type}
                    onChange={(e) => setDraftForm({ ...draftForm, line_type: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                  >
                    <option value="Fixed">Contract Fixed Fee</option>
                    <option value="Usage">Metered Usage</option>
                    <option value="Overage">Allowance Overage</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Line Description</label>
                <input
                  type="text"
                  value={draftForm.description}
                  onChange={(e) => setDraftForm({ ...draftForm, description: e.target.value })}
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Quantity</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={draftForm.quantity}
                    onChange={(e) => setDraftForm({ ...draftForm, quantity: e.target.value })}
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={draftForm.unit_price}
                    onChange={(e) => setDraftForm({ ...draftForm, unit_price: e.target.value })}
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Discount %</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draftForm.discount_pct}
                    onChange={(e) => setDraftForm({ ...draftForm, discount_pct: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* LIVE CALCULATION SUMMARY */}
              {(() => {
                const sub = (parseFloat(draftForm.quantity) || 0) * (parseFloat(draftForm.unit_price) || 0) * (1 - (parseFloat(draftForm.discount_pct) || 0) / 100);
                const gst = sub * 0.18;
                const tot = sub + gst;
                return (
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Subtotal</span>
                      <span>₹{Math.round(sub).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>GST (18%)</span>
                      <span>₹{Math.round(gst).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold text-xs pt-1 border-t border-slate-800">
                      <span>Total Invoice Amount</span>
                      <span className="text-cyan-400">₹{Math.round(tot).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-3d px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium shadow-sm"
                >
                  Create Draft Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Historical Billing Replay Engine 3D Modal */}
      <HistoricalReplayModal
        isOpen={showReplayModal}
        onClose={() => setShowReplayModal(false)}
      />

      {/* Revenue Evidence Graph 3D Modal */}
      <RevenueEvidenceGraphModal
        isOpen={showEvidenceGraph}
        onClose={() => setShowEvidenceGraph(false)}
        invoiceId={selectedInvoice?.invoice?.id}
        customerId={selectedInvoice?.invoice?.customer_id}
      />
    </PageTransition>
  );
};
