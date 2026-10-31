import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle, Clock, ShieldAlert, Search, Filter,
  Download, Eye, UserPlus, MessageSquare, Check, X, ArrowUpDown, ChevronRight, FileText
} from 'lucide-react';
import { api } from '../../services/api';
import { ExceptionDetail } from '../../types';

export const ExceptionsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialId = searchParams.get('id');

  const [exceptions, setExceptions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    total_exceptions: 14,
    open_exceptions: 10,
    in_progress: 3,
    resolved: 1,
    financial_exposure: 876000.0
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [issueTypeFilter, setIssueTypeFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Investigation drawer state
  const [selectedException, setSelectedException] = useState<ExceptionDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [resolutionReason, setResolutionReason] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchExceptions = async () => {
    setLoading(true);
    try {
      const res = await api.getExceptions({
        search: search || undefined,
        issue_type: issueTypeFilter !== 'All' ? issueTypeFilter : undefined,
        severity: severityFilter !== 'All' ? severityFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
      });
      setExceptions(res.items || []);
      if (res.metrics) setMetrics(res.metrics);

      // If URL has specific exception ID, open it
      if (initialId && !selectedException) {
        openInvestigation(initialId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExceptions();
  }, [search, issueTypeFilter, severityFilter, statusFilter]);

  const openInvestigation = async (id: string) => {
    setDrawerLoading(true);
    setIsResolving(false);
    setResolutionReason('');
    setActionSuccess(null);
    try {
      const res = await api.getExceptionDetail(id);
      setSelectedException(res);
    } catch (err) {
      console.error(err);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedException || !newNote.trim()) return;
    try {
      await api.addExceptionNote(selectedException.id, newNote);
      setNewNote('');
      setActionSuccess('Investigation note added');
      // Refresh detail
      openInvestigation(selectedException.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async () => {
    if (!selectedException || !resolutionReason.trim()) return;
    try {
      await api.resolveException(selectedException.id, resolutionReason);
      setActionSuccess('Exception resolved successfully with preserved audit trail');
      setIsResolving(false);
      openInvestigation(selectedException.id);
      fetchExceptions();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedException) return;
    try {
      await api.updateExceptionStatus(selectedException.id, newStatus);
      setActionSuccess(`Status updated to ${newStatus}`);
      openInvestigation(selectedException.id);
      fetchExceptions();
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
            <span>Exception</span>
            <span className="text-rose-500">Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Investigate & Resolve Financial Discrepancies Across 8 Detection Categories
          </p>
        </div>

        <button
          onClick={() => window.open(api.exportExceptions('csv'), '_blank')}
          className="btn-3d flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs font-medium"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export Exceptions</span>
        </button>
      </div>

      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Total Exceptions */}
        <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">Total Exceptions</span>
          <div className="text-xl font-bold text-white tracking-tight mt-1">{metrics.total_exceptions}</div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Identified in active period</span>
        </div>

        {/* Open */}
        <div className="glass-panel glass-panel-red p-4 rounded-2xl border border-rose-500/30">
          <span className="text-[11px] font-medium text-slate-400 block">Open Exceptions</span>
          <div className="text-xl font-bold text-rose-400 tracking-tight mt-1">{metrics.open_exceptions}</div>
          <span className="text-[10px] text-rose-400/80 mt-0.5 block">Awaiting investigation</span>
        </div>

        {/* In Progress */}
        <div className="glass-panel p-4 rounded-2xl border border-amber-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">In Progress</span>
          <div className="text-xl font-bold text-amber-400 tracking-tight mt-1">{metrics.in_progress}</div>
          <span className="text-[10px] text-amber-400/80 mt-0.5 block">Active audit investigation</span>
        </div>

        {/* Resolved */}
        <div className="glass-panel p-4 rounded-2xl border border-emerald-500/20">
          <span className="text-[11px] font-medium text-slate-400 block">Resolved</span>
          <div className="text-xl font-bold text-emerald-400 tracking-tight mt-1">{metrics.resolved}</div>
          <span className="text-[10px] text-emerald-400/80 mt-0.5 block">Audit history preserved</span>
        </div>

        {/* Financial Exposure */}
        <div className="glass-panel glass-panel-red p-4 rounded-2xl border border-rose-500/30 shadow-[0_0_15px_rgba(225,29,72,0.15)]">
          <span className="text-[11px] font-medium text-slate-400 block">Financial Exposure</span>
          <div className="text-xl font-bold text-white tracking-tight mt-1">
            ₹{Math.round(metrics.financial_exposure).toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-rose-400 mt-0.5 block">Non-duplicated leakage</span>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20 flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, customer, description..."
            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex items-center space-x-2">
          {/* Issue Type */}
          <select
            value={issueTypeFilter}
            onChange={(e) => setIssueTypeFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Categories (8)</option>
            <option value="Underbilling">Underbilling</option>
            <option value="Overbilling">Overbilling</option>
            <option value="Missing Charges">Missing Charges</option>
            <option value="Duplicate Invoices">Duplicate Invoices</option>
            <option value="Discount Drift">Discount Drift</option>
            <option value="Pricing Mismatch">Pricing Mismatch</option>
            <option value="Unbilled Usage">Unbilled Usage</option>
            <option value="Payment Discrepancies">Payment Discrepancies</option>
          </select>

          {/* Severity */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical (≥₹1L)</option>
            <option value="High">High (≥₹50k)</option>
            <option value="Medium">Medium (≥₹20k)</option>
            <option value="Low">Low (&lt;₹20k)</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* EXCEPTIONS TABLE */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Exception Code</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-2">Issue Type</th>
                <th className="py-2.5 px-2 text-right">Financial Impact</th>
                <th className="py-2.5 px-2 text-center">Severity</th>
                <th className="py-2.5 px-2 text-center">Status</th>
                <th className="py-2.5 px-3">Assigned Owner</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading exceptions...
                  </td>
                </tr>
              ) : exceptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No exceptions found matching filters.
                  </td>
                </tr>
              ) : (
                exceptions.map((exc) => (
                  <tr key={exc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-mono font-semibold text-cyan-400">
                      {exc.exception_code}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-white">{exc.customer_name}</span>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        exc.issue_type === 'Underbilling' ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40' :
                        exc.issue_type === 'Pricing Mismatch' ? 'bg-amber-950/60 text-amber-300 border-amber-500/40' :
                        exc.issue_type === 'Missing Charges' ? 'bg-blue-950/60 text-blue-300 border-blue-500/40' :
                        'bg-rose-950/60 text-rose-300 border-rose-500/40'
                      }`}>
                        {exc.issue_type}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right font-bold text-white">
                      ₹{Math.round(exc.financial_impact).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        exc.severity === 'Critical' ? 'bg-rose-950/80 text-rose-400' :
                        exc.severity === 'High' ? 'bg-amber-950/80 text-amber-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {exc.severity}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        exc.status === 'Open' ? 'bg-rose-950/80 text-rose-400 border-rose-500/40' :
                        exc.status === 'In Progress' ? 'bg-amber-950/80 text-amber-400 border-amber-500/40' :
                        'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                      }`}>
                        {exc.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {exc.assigned_to_name || 'Unassigned'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => openInvestigation(exc.id)}
                        className={`btn-3d px-3 py-1 rounded-lg text-[11px] font-medium border ${
                          exc.status === 'Resolved'
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            : 'bg-gradient-to-r from-rose-900/70 to-red-900/70 hover:from-rose-800 hover:to-red-800 text-white border-rose-500/40 shadow-sm'
                        }`}
                      >
                        {exc.status === 'Resolved' ? 'View Details' : 'Investigate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INVESTIGATION DETAIL DRAWER */}
      {selectedException && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-sm">
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-xl bg-[#0a0f1d] border-l border-slate-800 shadow-2xl flex flex-col">
              {/* Header */}
              <div className="p-5 border-b border-slate-800 flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-cyan-400">{selectedException.exception_code}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-500/40">
                      {selectedException.issue_type}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300">
                      {selectedException.severity}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-white mt-1">{selectedException.customer_name}</h2>
                </div>
                <button
                  onClick={() => setSelectedException(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {actionSuccess && (
                <div className="mx-5 mt-3 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                {/* Financial Exposure Card */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Financial Impact</span>
                    <span className="text-xl font-bold text-rose-400">₹{selectedException.financial_impact.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Status</span>
                    <select
                      value={selectedException.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>
                </div>

                {/* Calculation & Explanation */}
                <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1.5">
                  <h4 className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">Root Cause Calculation</h4>
                  <p className="text-slate-300 leading-relaxed">{selectedException.calculation_explanation}</p>
                </div>

                {/* Resolution History if resolved */}
                {selectedException.resolved_reason && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase block mb-1">Resolution Justification</span>
                    <p className="text-slate-200">{selectedException.resolved_reason}</p>
                    <span className="text-[10px] text-slate-500 mt-2 block">
                      Resolved at {new Date(selectedException.resolved_at || '').toLocaleString()}
                    </span>
                  </div>
                )}

                {/* Investigation Notes */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Investigation Audit Notes</h4>
                  <div className="space-y-2">
                    {selectedException.notes?.map((n) => (
                      <div key={n.id} className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800 text-[11px]">
                        <div className="flex items-center justify-between text-slate-500 text-[10px] mb-1">
                          <span className="font-semibold text-slate-300">{n.user_name}</span>
                          <span>{new Date(n.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed">{n.note_text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Add Note Input */}
                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      type="text"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add investigation observation..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!newNote.trim()}
                      className="btn-3d px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs disabled:opacity-40"
                    >
                      Post Note
                    </button>
                  </div>
                </div>

                {/* Resolve Action Section */}
                {selectedException.status !== 'Resolved' && (
                  <div className="pt-3 border-t border-slate-800">
                    {!isResolving ? (
                      <button
                        onClick={() => setIsResolving(true)}
                        className="btn-3d w-full py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                      >
                        Resolve Exception
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-emerald-500/40 space-y-2">
                        <label className="text-[11px] font-semibold text-emerald-400 block">
                          Mandatory Resolution Reason
                        </label>
                        <textarea
                          value={resolutionReason}
                          onChange={(e) => setResolutionReason(e.target.value)}
                          placeholder="Document exact audit rationale, contract amendment #, or commercial credit memo..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 h-20"
                        />
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => setIsResolving(false)}
                            className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleResolve}
                            disabled={resolutionReason.trim().length < 5}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 shadow-sm"
                          >
                            Confirm Resolution
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
