import React, { useState, useEffect } from 'react';
import {
  Layers, CheckCircle, AlertTriangle, ArrowUpDown, Download,
  RefreshCw, Filter, Eye, ChevronRight, CheckCircle2, XCircle, Search
} from 'lucide-react';
import { api } from '../../services/api';
import { ReconciliationData, ReconciliationRow } from '../../types';

export const ReconciliationPage: React.FC = () => {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'contract_usage' | 'usage_invoice' | 'invoice_payments' | 'full'>('full');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [reconciling, setReconciling] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ReconciliationRow | null>(null);

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const res = await api.getReconciliation('2026-10', undefined, undefined, statusFilter);
      setData(res);
    } catch (err) {
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
    try {
      await api.triggerReconciliation('2026-10');
      await fetchReconciliation();
    } catch (err) {
      console.error(err);
    } finally {
      setReconciling(false);
    }
  };

  const filteredRows = data?.rows.filter((r) => {
    const matchesSearch = r.customer_name.toLowerCase().includes(search.toLowerCase()) ||
                          r.contract_number.toLowerCase().includes(search.toLowerCase()) ||
                          r.product_name.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  }) || [];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
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

        <div className="flex items-center space-x-3">
          <button
            onClick={() => window.open(api.exportReconciliation('2026-10', 'csv'), '_blank')}
            className="btn-3d flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleRunReconciliation}
            disabled={reconciling}
            className="btn-3d flex items-center space-x-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-medium shadow-[0_0_15px_rgba(6,182,212,0.35)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin' : ''}`} />
            <span>{reconciling ? 'Reconciling Records...' : 'Run Reconciliation'}</span>
          </button>
        </div>
      </div>

      {/* TOP METRICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Expected Charges */}
        <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">Expected Charges</span>
          <div className="text-xl font-bold text-white tracking-tight mt-1">
            ₹{data?.summary.expected_charges ? Math.round(data.summary.expected_charges).toLocaleString('en-IN') : '0'}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Derived from effective contract versions</span>
        </div>

        {/* Invoiced Amount */}
        <div className="glass-panel p-4 rounded-2xl border border-blue-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">Actual Invoiced Amount</span>
          <div className="text-xl font-bold text-white tracking-tight mt-1">
            ₹{data?.summary.invoiced_amount ? Math.round(data.summary.invoiced_amount).toLocaleString('en-IN') : '0'}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Gross billable ledger items</span>
        </div>

        {/* Variance */}
        <div className="glass-panel glass-panel-red p-4 rounded-2xl border border-rose-500/30">
          <span className="text-[11px] font-medium text-slate-400 block">Financial Variance</span>
          <div className="text-xl font-bold text-rose-400 tracking-tight mt-1">
            ₹{data?.summary.variance_amount ? Math.round(data.summary.variance_amount).toLocaleString('en-IN') : '0'}
          </div>
          <span className="text-[10px] text-rose-400/80 mt-0.5 block">Net absolute reconciliation gap</span>
        </div>

        {/* Reconciliation Rate */}
        <div className="glass-panel p-4 rounded-2xl border border-emerald-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">Reconciliation Rate</span>
          <div className="text-xl font-bold text-emerald-400 tracking-tight mt-1">
            {data?.summary.reconciliation_rate || 92.4}%
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {data?.summary.matched_records || 0} matched of {data?.summary.total_obligations || 0} obligations
          </span>
        </div>
      </div>

      {/* 4 RECONCILIATION TABS & CONTROLS */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
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
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-2">Contract / Product</th>
                <th className="py-2.5 px-2 text-right">Fixed Fee</th>
                <th className="py-2.5 px-2 text-right">Usage Value</th>
                <th className="py-2.5 px-2 text-right">Invoiced Amount</th>
                <th className="py-2.5 px-2 text-right">Variance</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Calculating contract obligations...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No reconciliation records matching current criteria.
                  </td>
                </tr>
              ) : (
                filteredRows.slice(0, 15).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
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
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setSelectedRow(row)}
                        className="btn-3d px-3 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center space-x-1.5 ml-auto"
                      >
                        <Eye className="w-3 h-3 text-cyan-400" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reconciliation Run History */}
      {data?.run_history && data.run_history.length > 0 && (
        <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Reconciliation Audit History</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.run_history.slice(0, 3).map((run) => (
              <div key={run.run_number} className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">{run.run_number}</span>
                  <span className="text-[10px] text-slate-500">{new Date(run.run_at).toLocaleString()}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-400">{run.reconciliation_rate}%</span>
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
                  <span className="text-xs text-slate-300">{selectedRow.calculation_details.actual_units} units</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Included Units</span>
                  <span className="text-xs text-slate-300">{selectedRow.calculation_details.included_units} units</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20">
                <span className="text-[10px] font-semibold text-cyan-400 uppercase block mb-1">Contract Version Calculation Logic</span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Fixed Fee of ₹{selectedRow.calculation_details.fixed_fee} with {selectedRow.calculation_details.discount_pct}% contractual discount. 
                  Overage rate ₹{selectedRow.calculation_details.rate_per_unit}/unit applied to billable units.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
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
    </div>
  );
};
