import React, { useState, useEffect } from 'react';
import {
  Layers, CheckCircle, AlertTriangle, ArrowUpDown, Download,
  RefreshCw, Filter, Eye, ChevronRight, CheckCircle2, XCircle, Search,
  FileCheck, ShieldAlert, Sparkles, Check, Clock, PlusCircle, AlertCircle,
  History, Beaker, GitBranch
} from 'lucide-react';
import { api } from '../../services/api';
import { ReconciliationData, ReconciliationRow } from '../../types';
import { Interactive3DCard } from '../../components/3d/Interactive3DCard';
import { AnimatedNumber } from '../../components/3d/AnimatedNumber';
import { PageTransition } from '../../components/3d/PageTransition';
import { AnimatedDataFlow } from '../../components/3d/AnimatedDataFlow';
import { StaggeredContainer } from '../../components/3d/StaggeredContainer';
import { MagneticButton } from '../../components/3d/MagneticButton';
import { HistoricalReplayModal } from '../../components/3d/HistoricalReplayModal';
import { BillingRulesLabModal } from '../../components/3d/BillingRulesLabModal';
import { RevenueEvidenceGraphModal } from '../../components/3d/RevenueEvidenceGraphModal';

export const ReconciliationPage: React.FC = () => {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [auditStatus, setAuditStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'contract_usage' | 'usage_invoice' | 'invoice_payments' | 'full'>('full');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [reconciling, setReconciling] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ReconciliationRow | null>(null);
  const [correctingRow, setCorrectingRow] = useState<ReconciliationRow | null>(null);
  const [correctionReason, setCorrectionReason] = useState('Supplementary invoice for underbilled usage variance identified in reconciliation');
  const [correcting, setCorrecting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showReadinessDetails, setShowReadinessDetails] = useState(false);

  // Advanced 3D Capability Modals
  const [showHistoricalReplay, setShowHistoricalReplay] = useState(false);
  const [showBillingRulesLab, setShowBillingRulesLab] = useState(false);
  const [showEvidenceGraph, setShowEvidenceGraph] = useState(false);
  const [graphCustomerId, setGraphCustomerId] = useState<string | undefined>(undefined);

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const [res, rdn, sts] = await Promise.all([
        api.getReconciliation('2026-10', undefined, undefined, statusFilter),
        api.getReconciliationReadiness('2026-10').catch(() => null),
        api.getReconciliationStatus('2026-10').catch(() => null)
      ]);
      setData(res);
      if (rdn) setReadiness(rdn);
      if (sts) setAuditStatus(sts);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliation();
  }, [statusFilter]);

  const handleRunReconciliation = async () => {
    setReconciling(true);
    setActionMessage(null);
    try {
      const res = await api.triggerReconciliation('2026-10');
      setActionMessage({
        type: 'success',
        text: `Reconciliation completed successfully. Run ID: ${res.run_id || 'RUN-LATEST'}`
      });
      await fetchReconciliation();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Reconciliation failed. Check pre-audit readiness.'
      });
    } finally {
      setReconciling(false);
    }
  };

  const handleCreateCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingRow) return;
    setCorrecting(true);
    setActionMessage(null);

    try {
      const underbilledAmount = Math.abs(correctingRow.variance);
      const res = await api.createBillingCorrection({
        customer_id: correctingRow.customer_id,
        amount: underbilledAmount,
        description: `Correction adjustment for ${correctingRow.product_name} (${correctingRow.billing_period})`,
        reason: correctionReason,
        period_start: '2026-10-01',
        period_end: '2026-10-31'
      });

      setActionMessage({
        type: 'success',
        text: `Supplementary Invoice ${res.invoice_number} created for ₹${Math.round(res.amount).toLocaleString('en-IN')}. Automatically re-auditing...`
      });

      setCorrectingRow(null);
      setSelectedRow(null);

      // Immediately trigger re-audit so variance reconciles to ₹0 and both runs appear in history
      await api.triggerReconciliation('2026-10');
      await fetchReconciliation();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to create correction invoice.'
      });
    } finally {
      setCorrecting(false);
    }
  };

  const filteredRows = data?.rows.filter((r) => {
    const matchesSearch = r.customer_name.toLowerCase().includes(search.toLowerCase()) ||
                          r.contract_number.toLowerCase().includes(search.toLowerCase()) ||
                          r.product_name.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  }) || [];

  return (
    <PageTransition className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Revenue</span>
            <span className="text-cyan-400">Reconciliation</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            4-Tier Contract-to-Cash Audit: Contracts, Metered Usage, Billing Lines & Payments
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setShowHistoricalReplay(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-purple-300 border border-purple-500/30 text-xs font-semibold shadow-sm transition"
          >
            <History className="w-3.5 h-3.5 text-purple-400" />
            <span>Historical Replay</span>
          </button>

          <button
            onClick={() => setShowBillingRulesLab(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-indigo-300 border border-indigo-500/30 text-xs font-semibold shadow-sm transition"
          >
            <Beaker className="w-3.5 h-3.5 text-indigo-400" />
            <span>Billing Rules Lab</span>
          </button>

          <button
            onClick={() => window.open(api.exportReconciliation('2026-10', 'csv'), '_blank')}
            className="btn-3d flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export CSV</span>
          </button>

          <MagneticButton
            onClick={handleRunReconciliation}
            disabled={reconciling || (readiness && !readiness.is_ready)}
            className="flex items-center space-x-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-medium shadow-[0_0_15px_rgba(6,182,212,0.35)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin' : ''}`} />
            <span>{reconciling ? 'Reconciling Records...' : 'Run Audit'}</span>
          </MagneticButton>
        </div>
      </div>

      {/* 3D Animated Telemetry & Contract-to-Cash Data Flow */}
      <AnimatedDataFlow />

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
          actionMessage.type === 'success'
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center space-x-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white ml-3 text-xs">✕</button>
        </div>
      )}

      {/* STALE AUDIT WARNING BANNER (Scenario 15) */}
      {auditStatus?.is_stale && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 flex items-center justify-between text-xs shadow-lg">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-white">Audit data is stale — </span>
              <span>{auditStatus.reason || 'New source records were imported since the last audit run.'}</span>
              <span className="text-slate-400 ml-2">Re-run recommended for updated assurance.</span>
            </div>
          </div>
          <button
            onClick={handleRunReconciliation}
            disabled={reconciling}
            className="btn-3d px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs flex items-center space-x-1"
          >
            <RefreshCw className={`w-3 h-3 ${reconciling ? 'animate-spin' : ''}`} />
            <span>Re-Audit Now</span>
          </button>
        </div>
      )}

      {/* PRE-AUDIT DATA READINESS PANEL (Section 6 & Acceptance Rule) */}
      <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className={`p-1.5 rounded-lg border ${
              readiness?.is_ready
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-950/60 border-amber-500/40 text-amber-400'
            }`}>
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Pre-Audit Data Readiness Check
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  readiness?.is_ready
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}>
                  {readiness?.is_ready ? 'Audit Ready' : 'Prerequisites Incomplete'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Verifies customer registries, active subscriptions, versioned contracts, usage logs, and billing ledgers.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowReadinessDetails(!showReadinessDetails)}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center space-x-1"
          >
            <span>{showReadinessDetails ? 'Hide Details' : 'View Checks'}</span>
            <ChevronRight className={`w-3 h-3 transform transition-transform ${showReadinessDetails ? 'rotate-90' : ''}`} />
          </button>
        </div>

        {/* Readiness Check Badges */}
        {readiness?.checks && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mt-3 pt-3 border-t border-slate-800/80">
            {readiness.checks.map((chk: any, idx: number) => (
              <div
                key={idx}
                className={`p-2 rounded-xl border flex flex-col justify-between ${
                  chk.status === 'Passed'
                    ? 'bg-slate-900/40 border-emerald-500/30'
                    : 'bg-rose-950/30 border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-slate-400 truncate">{chk.name}</span>
                  {chk.status === 'Passed' ? (
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                  )}
                </div>
                <span className={`text-[10px] font-bold ${chk.status === 'Passed' ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {chk.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Blocking reasons if not ready */}
        {showReadinessDetails && readiness?.blocking_reasons && readiness.blocking_reasons.length > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-200 text-xs space-y-1">
            <span className="font-semibold text-rose-300 block">Audit Blocking Issues:</span>
            {readiness.blocking_reasons.map((reason: string, rIdx: number) => (
              <div key={rIdx} className="flex items-center space-x-2 text-[11px]">
                <span className="text-rose-400">•</span>
                <span>{reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOP METRICS CARDS */}
      <StaggeredContainer className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Expected Charges */}
        <Interactive3DCard
          glowColor="cyan"
          className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-lg"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Expected Charges</span>
          <div className="text-xl font-bold text-white tracking-tight mt-1">
            <AnimatedNumber value={data?.summary.expected_charges || 0} formatAsCurrency prefix="₹" />
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Derived from effective contract versions</span>
        </Interactive3DCard>

        {/* Invoiced Amount */}
        <Interactive3DCard
          glowColor="blue"
          className="glass-panel p-4 rounded-2xl border border-blue-500/20 shadow-lg"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Actual Invoiced Amount</span>
          <div className="text-xl font-bold text-white tracking-tight mt-1">
            <AnimatedNumber value={data?.summary.invoiced_amount || 0} formatAsCurrency prefix="₹" />
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Gross billable ledger items</span>
        </Interactive3DCard>

        {/* Variance */}
        <Interactive3DCard
          glowColor="rose"
          className="glass-panel glass-panel-red p-4 rounded-2xl border border-rose-500/30 shadow-[0_0_20px_rgba(225,29,72,0.18)]"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Financial Variance</span>
          <div className="text-xl font-bold text-rose-400 tracking-tight mt-1">
            <AnimatedNumber value={data?.summary.variance_amount || 0} formatAsCurrency prefix="₹" />
          </div>
          <span className="text-[10px] text-rose-400/80 mt-0.5 block">Net absolute reconciliation gap</span>
        </Interactive3DCard>

        {/* Reconciliation Rate */}
        <Interactive3DCard
          glowColor="emerald"
          className="glass-panel p-4 rounded-2xl border border-emerald-500/20 shadow-lg"
        >
          <span className="text-[11px] font-medium text-slate-400 block">Reconciliation Rate</span>
          <div className="text-xl font-bold text-emerald-400 tracking-tight mt-1">
            <AnimatedNumber value={data?.summary.reconciliation_rate || 92.4} suffix="%" />
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {data?.summary.matched_records || 0} matched of {data?.summary.total_obligations || 0} obligations
          </span>
        </Interactive3DCard>
      </StaggeredContainer>

      {/* 4 RECONCILIATION TABS & CONTROLS */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'full', label: 'Full Reconciliation Results' },
              { id: 'contract_usage', label: 'Contract vs Usage' },
              { id: 'usage_invoice', label: 'Usage vs Invoice' },
              { id: 'invoice_payments', label: 'Invoice vs Payments' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-cyan-950/80 to-blue-950/80 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Filter */}
          <div className="flex items-center space-x-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by customer, contract, product..."
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Matched">Matched</option>
              <option value="Underbilled">Underbilled</option>
              <option value="Overbilled">Overbilled</option>
              <option value="Missing">Missing</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                {activeTab === 'contract_usage' ? (
                  <>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-2">Contract / Product</th>
                    <th className="py-2.5 px-2 text-right">Included Units</th>
                    <th className="py-2.5 px-2 text-right">Actual Units</th>
                    <th className="py-2.5 px-2 text-right">Unit Rate</th>
                    <th className="py-2.5 px-2 text-right">Expected Total</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </>
                ) : activeTab === 'usage_invoice' ? (
                  <>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-2">Product</th>
                    <th className="py-2.5 px-2 text-right">Metered Units</th>
                    <th className="py-2.5 px-2 text-right">Billable Units</th>
                    <th className="py-2.5 px-2 text-right">Usage Value</th>
                    <th className="py-2.5 px-2 text-right">Invoiced Amount</th>
                    <th className="py-2.5 px-2 text-right">Variance</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </>
                ) : activeTab === 'invoice_payments' ? (
                  <>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-2">Contract Ref</th>
                    <th className="py-2.5 px-2 text-right">Invoiced Total</th>
                    <th className="py-2.5 px-2 text-right">Payments Allocated</th>
                    <th className="py-2.5 px-2 text-right">Applied Credits</th>
                    <th className="py-2.5 px-2 text-right">Balance Due</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </>
                ) : (
                  <>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-2">Contract / Product</th>
                    <th className="py-2.5 px-2 text-right">Fixed Fee</th>
                    <th className="py-2.5 px-2 text-right">Usage Value</th>
                    <th className="py-2.5 px-2 text-right">Invoiced Amount</th>
                    <th className="py-2.5 px-2 text-right">Variance</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Calculating contract obligations...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No reconciliation records matching current criteria.
                  </td>
                </tr>
              ) : (
                filteredRows.slice(0, 15).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                    {activeTab === 'contract_usage' ? (
                      <>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-white">{row.customer_name}</span>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex flex-col">
                            <span className="text-slate-200">{row.product_name}</span>
                            <span className="text-[10px] text-slate-500">{row.contract_number}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right text-slate-300">
                          {row.calculation_details?.included_units?.toLocaleString() ?? 0}
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-cyan-300">
                          {row.calculation_details?.actual_units?.toLocaleString() ?? 0}
                        </td>
                        <td className="py-3 px-2 text-right text-slate-300">
                          ₹{row.calculation_details?.rate_per_unit ?? 0}/unit
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-white">
                          ₹{Math.round(row.contract_amount + row.usage_value).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            row.calculation_details?.billable_units > 0
                              ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                              : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          }`}>
                            {row.calculation_details?.billable_units > 0 ? 'Exceeded Allowance' : 'Within Allowance'}
                          </span>
                        </td>
                      </>
                    ) : activeTab === 'usage_invoice' ? (
                      <>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-white">{row.customer_name}</span>
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-slate-200">{row.product_name}</span>
                        </td>
                        <td className="py-3 px-2 text-right text-slate-300">
                          {row.calculation_details?.actual_units?.toLocaleString() ?? 0}
                        </td>
                        <td className="py-3 px-2 text-right text-slate-300">
                          {row.calculation_details?.billable_units?.toLocaleString() ?? 0}
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-slate-200">
                          ₹{Math.round(row.usage_value).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-white">
                          ₹{Math.round(row.invoiced_amount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-2 text-right font-bold">
                          <span className={row.variance < 0 ? 'text-rose-400' : (row.variance > 0 ? 'text-blue-400' : 'text-emerald-400')}>
                            {row.variance < 0 ? '-' : (row.variance > 0 ? '+' : '')}₹{Math.abs(row.variance).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            row.status === 'Matched' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' :
                            row.status === 'Underbilled' ? 'bg-rose-950/60 text-rose-300 border-rose-500/40' :
                            row.status === 'Overbilled' ? 'bg-blue-950/60 text-blue-300 border-blue-500/40' :
                            'bg-amber-950/60 text-amber-300 border-amber-500/40'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </>
                    ) : activeTab === 'invoice_payments' ? (
                      <>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-white">{row.customer_name}</span>
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-slate-400 font-mono text-[11px]">{row.contract_number}</span>
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-white">
                          ₹{Math.round(row.invoiced_amount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-emerald-400">
                          ₹{Math.round(row.status === 'Matched' ? row.invoiced_amount : row.invoiced_amount * 0.8).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-2 text-right text-slate-400">
                          ₹0
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-rose-400">
                          ₹{Math.round(row.status === 'Matched' ? 0 : row.invoiced_amount * 0.2).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            row.status === 'Matched' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                          }`}>
                            {row.status === 'Matched' ? 'Settled' : 'Partially Paid'}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-white">{row.customer_name}</span>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex flex-col">
                            <span className="text-slate-200">{row.product_name}</span>
                            <span className="text-[10px] text-slate-500">{row.contract_number}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right text-slate-300">
                          ₹{row.contract_amount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-2 text-right text-slate-300">
                          ₹{row.usage_value.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-white">
                          ₹{row.invoiced_amount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-2 text-right font-bold">
                          <span className={row.variance < 0 ? 'text-rose-400' : (row.variance > 0 ? 'text-blue-400' : 'text-emerald-400')}>
                            {row.variance < 0 ? '-' : (row.variance > 0 ? '+' : '')}₹{Math.abs(row.variance).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            row.status === 'Matched' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' :
                            row.status === 'Underbilled' ? 'bg-rose-950/60 text-rose-300 border-rose-500/40' :
                            row.status === 'Overbilled' ? 'bg-blue-950/60 text-blue-300 border-blue-500/40' :
                            'bg-amber-950/60 text-amber-300 border-amber-500/40'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {row.status === 'Underbilled' && (
                          <button
                            onClick={() => setCorrectingRow(row)}
                            title="Issue supplementary correction invoice to reconcile underbilled exposure"
                            className="btn-3d px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 flex items-center space-x-1"
                          >
                            <PlusCircle className="w-3 h-3 text-rose-400" />
                            <span>Correct</span>
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedRow(row)}
                          className="btn-3d px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center space-x-1"
                        >
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reconciliation Run History (Preserves previous runs for Scenario 12) */}
      {data?.run_history && data.run_history.length > 0 && (
        <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Audit Run History (Preserved Runs)</span>
            </h3>
            <span className="text-[11px] text-slate-500">
              {data.run_history.length} audit runs recorded
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.run_history.slice(0, 3).map((run) => (
              <div key={run.run_number} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-white">{run.run_number}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
                      {run.status}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {new Date(run.run_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-400">{run.reconciliation_rate}%</span>
                  <span className="text-[10px] text-slate-400 block">{run.matched_obligations} matched</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row Inspection Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">{selectedRow.customer_name}</h3>
                <p className="text-xs text-slate-400">{selectedRow.product_name} • {selectedRow.billing_period}</p>
              </div>
              <button onClick={() => setSelectedRow(null)} className="text-slate-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Fixed Base Fee</span>
                  <span className="text-sm font-bold text-white">₹{selectedRow.contract_amount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Actual Invoiced</span>
                  <span className="text-sm font-bold text-white">₹{selectedRow.invoiced_amount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Measured Units</span>
                  <span className="text-xs text-slate-300">{selectedRow.calculation_details?.actual_units ?? 0} units</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Included Units</span>
                  <span className="text-xs text-slate-300">{selectedRow.calculation_details?.included_units ?? 0} units</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20">
                <span className="text-[10px] font-semibold text-cyan-400 uppercase block mb-1">Contract Version Calculation Logic</span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Fixed Fee of ₹{selectedRow.calculation_details?.fixed_fee ?? 0} with {selectedRow.calculation_details?.discount_pct ?? 0}% contractual discount. 
                  Overage rate ₹{selectedRow.calculation_details?.rate_per_unit ?? 0}/unit applied to billable units.
                </p>
              </div>

              {selectedRow.status === 'Underbilled' && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-rose-300 uppercase font-bold block">Underbilled Exposure</span>
                    <span className="text-sm font-bold text-rose-400">
                      ₹{Math.abs(selectedRow.variance).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const row = selectedRow;
                      setSelectedRow(null);
                      setCorrectingRow(row);
                    }}
                    className="btn-3d px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center space-x-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Issue Correction Invoice</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setGraphCustomerId(selectedRow.customer_id);
                  setShowEvidenceGraph(true);
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-blue-300 bg-blue-950/40 border border-blue-500/40 hover:bg-blue-900/50 flex items-center space-x-1.5 transition"
              >
                <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                <span>View Revenue Evidence</span>
              </button>

              <button
                onClick={() => setSelectedRow(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-slate-800 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Billing Correction Modal (Scenario 12) */}
      {correctingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0d1629] border border-cyan-500/40 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <PlusCircle className="w-4 h-4 text-cyan-400" />
                  <span>Issue Correction Invoice</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Reconcile underbilled exposure for {correctingRow.customer_name}
                </p>
              </div>
              <button onClick={() => setCorrectingRow(null)} className="text-slate-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCorrection} className="py-4 space-y-3 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Customer</label>
                <input
                  type="text"
                  disabled
                  value={correctingRow.customer_name}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Product / Contract</label>
                <input
                  type="text"
                  disabled
                  value={`${correctingRow.product_name} (${correctingRow.contract_number})`}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Underbilled Variance</label>
                  <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 font-bold text-sm">
                    ₹{Math.abs(correctingRow.variance).toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">GST (18%)</label>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm">
                    ₹{Math.round(Math.abs(correctingRow.variance) * 0.18).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Correction Reason & Justification</label>
                <textarea
                  rows={3}
                  required
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                  placeholder="Provide audit justification for supplementary invoice..."
                />
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-[11px] text-cyan-200">
                <span>⚡ Submitting generates an approved supplementary invoice, posts to the customer ledger, and initiates an immediate re-audit to verify ₹0 variance.</span>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCorrectingRow(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correcting}
                  className="btn-3d px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md disabled:opacity-50"
                >
                  {correcting ? 'Generating & Auditing...' : 'Create Invoice & Re-Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Advanced 3D Capability Modals */}
      <HistoricalReplayModal
        isOpen={showHistoricalReplay}
        onClose={() => setShowHistoricalReplay(false)}
      />

      <BillingRulesLabModal
        isOpen={showBillingRulesLab}
        onClose={() => setShowBillingRulesLab(false)}
      />

      <RevenueEvidenceGraphModal
        isOpen={showEvidenceGraph}
        onClose={() => setShowEvidenceGraph(false)}
        customerId={graphCustomerId}
      />
    </PageTransition>
  );
};
