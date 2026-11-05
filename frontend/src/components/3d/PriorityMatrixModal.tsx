import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, AlertTriangle, ShieldAlert, CheckSquare, Square, UserPlus,
  SlidersHorizontal, ChevronRight, HelpCircle, CheckCircle2, User
} from 'lucide-react';
import { api } from '../../services/api';

interface PriorityMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssignComplete?: () => void;
}

export const PriorityMatrixModal: React.FC<PriorityMatrixModalProps> = ({
  isOpen,
  onClose,
  onAssignComplete
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selectedExceptions, setSelectedExceptions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'All' | 'Critical' | 'High' | 'Medium' | 'Low'>('All');
  const [inspectingFactors, setInspectingFactors] = useState<any | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Override dialog
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<any | null>(null);
  const [newPriority, setNewPriority] = useState('Critical');
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPriorityScores();
      loadUsers();
    }
  }, [isOpen]);

  const loadPriorityScores = async () => {
    setLoading(true);
    try {
      const res = await api.getPrioritizedExceptions();
      setData(res);
    } catch (err) {
      console.error('Failed to load priority scores', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const users = await api.getUsers();
      setUsersList(users);
      if (users.length > 0) setAssigneeId(users[0].id);
    } catch (err) {
      console.error('Failed to load users', err);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedExceptions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (!data?.scored_exceptions) return;
    const currentList = filteredList.map((e: any) => e.exception_id);
    if (selectedExceptions.length === currentList.length) {
      setSelectedExceptions([]);
    } else {
      setSelectedExceptions(currentList);
    }
  };

  const handleBulkAssign = async () => {
    if (!selectedExceptions.length || !assigneeId) return;
    setAssigning(true);
    try {
      await api.assignPrioritizedExceptions(selectedExceptions, assigneeId);
      setSelectedExceptions([]);
      await loadPriorityScores();
      if (onAssignComplete) onAssignComplete();
    } catch (err) {
      console.error('Failed to assign exceptions', err);
    } finally {
      setAssigning(false);
    }
  };

  const handleOverrideSubmit = async () => {
    if (!overrideTarget || !overrideReason.trim()) return;
    try {
      await api.overrideExceptionPriority(overrideTarget.exception_id, newPriority, overrideReason);
      setOverrideModalOpen(false);
      setOverrideTarget(null);
      setOverrideReason('');
      await loadPriorityScores();
      if (onAssignComplete) onAssignComplete();
    } catch (err) {
      console.error('Failed to override priority', err);
    }
  };

  if (!isOpen) return null;

  const filteredList = data?.scored_exceptions?.filter((e: any) =>
    activeTab === 'All' ? true : e.assigned_priority === activeTab
  ) || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl h-[88vh] bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white tracking-wide">
                    Intelligent Leakage Prioritization Matrix
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    Deterministic 5-Factor Ranking
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Calculates composite priority scores (0–100) using Exposure, Recurrence, Tier, Evidence & Age
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Metric Summary Ribbon */}
          {data && (
            <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(['All', 'Critical', 'High', 'Medium', 'Low'] as const).map(tab => {
                  const count = tab === 'All' ? data.total_scored : data.priority_distribution[tab] || 0;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                        activeTab === tab
                          ? 'bg-rose-600 text-white shadow'
                          : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span>{tab}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Bulk Assignment Control */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {selectedExceptions.length} selected
                </span>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                >
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkAssign}
                  disabled={!selectedExceptions.length || assigning}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assign Selected</span>
                </button>
              </div>
            </div>
          )}

          {/* Table of Scored Exceptions */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-8">
                        <button onClick={selectAll}>
                          {selectedExceptions.length === filteredList.length && filteredList.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-rose-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3">Exception Code</th>
                      <th className="px-4 py-3">Customer Account</th>
                      <th className="px-4 py-3">Exposure</th>
                      <th className="px-4 py-3 text-center">Score (0–100)</th>
                      <th className="px-4 py-3">Priority Tier</th>
                      <th className="px-4 py-3">Assignee</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredList.map((exc: any) => {
                      const isSelected = selectedExceptions.includes(exc.exception_id);
                      return (
                        <tr
                          key={exc.exception_id}
                          className={`hover:bg-slate-850/50 transition ${
                            isSelected ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <button onClick={() => toggleSelect(exc.exception_id)}>
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-rose-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-semibold text-white">
                            {exc.exception_code}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-200">{exc.customer_name}</div>
                            <span className="text-[10px] text-slate-400">{exc.customer_segment}</span>
                          </td>
                          <td className="px-4 py-3 font-mono font-medium text-rose-400">
                            ₹{exc.financial_impact.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 font-mono font-bold text-white text-xs">
                              <span className={`w-2 h-2 rounded-full ${
                                exc.composite_score >= 80 ? 'bg-rose-500' :
                                exc.composite_score >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`} />
                              <span>{exc.composite_score.toFixed(1)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              exc.assigned_priority === 'Critical'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : exc.assigned_priority === 'High'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              {exc.assigned_priority}
                            </span>
                            {exc.manual_override && (
                              <span className="ml-1 text-[9px] text-purple-400 font-medium">Overridden</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {exc.assigned_to}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setInspectingFactors(exc)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium"
                              >
                                View Factors
                              </button>
                              <button
                                onClick={() => {
                                  setOverrideTarget(exc);
                                  setNewPriority(exc.assigned_priority);
                                  setOverrideModalOpen(true);
                                }}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded text-[11px]"
                              >
                                Override
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Factor Breakdown Drawer/Modal */}
          {inspectingFactors && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
                  <div>
                    <span className="text-xs font-semibold text-rose-400 uppercase">Multi-Factor Lineage</span>
                    <h3 className="text-base font-bold text-white">{inspectingFactors.exception_code} Prioritization Factors</h3>
                  </div>
                  <button onClick={() => setInspectingFactors(null)} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {Object.entries(inspectingFactors.factors || {}).map(([fname, fval]: any) => (
                    <div key={fname} className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                      <div className="flex justify-between items-center mb-1">
                        <span className="capitalize text-xs font-semibold text-white">
                          {fname.replace('_', ' ')} ({(fval.weight * 100).toFixed(0)}% weight)
                        </span>
                        <span className="font-mono text-xs font-bold text-rose-400">{fval.score.toFixed(1)} / 100</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{fval.detail}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-xs text-slate-400">Calculated Composite:</span>
                  <span className="text-base font-bold font-mono text-white">{inspectingFactors.composite_score.toFixed(1)} / 100</span>
                </div>
              </div>
            </div>
          )}

          {/* Override Dialog */}
          {overrideModalOpen && overrideTarget && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <h3 className="text-base font-bold text-white">Manual Priority Override</h3>
                  <button onClick={() => setOverrideModalOpen(false)} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Select New Priority</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Audit Justification & Reason</label>
                    <textarea
                      rows={3}
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Explain reason for manual priority escalation/de-escalation..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setOverrideModalOpen(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleOverrideSubmit}
                    disabled={!overrideReason.trim()}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded text-xs font-semibold"
                  >
                    Apply Override
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
