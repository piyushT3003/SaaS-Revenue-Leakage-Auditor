import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Network, CheckCircle2, AlertOctagon, HelpCircle, FileText,
  Users, DollarSign, ChevronRight, Check
} from 'lucide-react';
import { api } from '../../services/api';

interface RootCauseClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RootCauseClusterModal: React.FC<RootCauseClusterModalProps> = ({
  isOpen,
  onClose
}) => {
  const [loading, setLoading] = useState(true);
  const [clusterData, setClusterData] = useState<any | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<any | null>(null);

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmedCause, setConfirmedCause] = useState('');
  const [investigationNotes, setInvestigationNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadClusters();
    }
  }, [isOpen]);

  const loadClusters = async () => {
    setLoading(true);
    try {
      const res = await api.getRootCauseClusters();
      setClusterData(res);
      if (res.clusters && res.clusters.length > 0) {
        setSelectedCluster(res.clusters[0]);
      }
    } catch (err) {
      console.error('Failed to load root cause clusters', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!selectedCluster || !confirmedCause.trim()) return;
    try {
      await api.confirmRootCauseCluster(
        selectedCluster.id,
        'Confirmed',
        confirmedCause,
        investigationNotes
      );
      setConfirmOpen(false);
      setConfirmedCause('');
      setInvestigationNotes('');
      await loadClusters();
    } catch (err) {
      console.error('Failed to confirm cluster', err);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl h-[86vh] bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Network className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white tracking-wide">
                    Systemic Root-Cause & Blast Radius Analysis
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Algorithmic Anomaly Clustering
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Identifies systemic root causes across contracts, meters, and pricing rules rather than isolated symptoms
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

          {/* Main Layout */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Cluster List */}
            <div className="w-80 p-5 border-r border-slate-800 flex flex-col overflow-y-auto bg-slate-950/30 space-y-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Identified Systemic Clusters ({clusterData?.total_clusters || 0})
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="space-y-2">
                  {clusterData?.clusters.map((c: any) => {
                    const isSelected = selectedCluster?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCluster(c)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition relative overflow-hidden ${
                          isSelected
                            ? 'bg-amber-950/30 border-amber-500 shadow-md ring-1 ring-amber-500'
                            : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            {c.cluster_type}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                            c.status === 'Confirmed'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-700 text-slate-300'
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <h4 className="font-semibold text-xs text-white truncate mb-1">{c.title}</h4>
                        <div className="flex justify-between items-center text-[11px] text-slate-400">
                          <span>{c.affected_customer_count} Accounts</span>
                          <span className="font-mono text-amber-400 font-medium">₹{c.aggregate_exposure.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Blast Radius Canvas */}
            <div className="flex-1 p-6 flex flex-col overflow-y-auto bg-slate-950/20 space-y-5">
              {selectedCluster ? (
                <>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white">{selectedCluster.title}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {selectedCluster.cluster_code}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Grouping Factor: <span className="text-slate-200">{selectedCluster.grouping_factor}</span>
                      </p>
                    </div>

                    {selectedCluster.status !== 'Confirmed' ? (
                      <button
                        onClick={() => {
                          setConfirmedCause(selectedCluster.grouping_factor);
                          setConfirmOpen(true);
                        }}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirm Root Cause</span>
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirmed & Slated for Rebill</span>
                      </span>
                    )}
                  </div>

                  {/* Blast Radius Quadrant */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-blue-400" />
                        <span>Portfolio Blast Radius</span>
                      </span>
                      <div className="text-2xl font-bold text-white mt-2">
                        {selectedCluster.affected_customer_count} Accounts
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {selectedCluster.affected_invoices_count} associated invoices
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                        <span>Aggregate Portfolio Exposure</span>
                      </span>
                      <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
                        ₹{selectedCluster.aggregate_exposure.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-slate-500">Cumulative unrecovered revenue</span>
                    </div>

                    <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5">
                        <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                        <span>Risk Velocity</span>
                      </span>
                      <div className="text-2xl font-bold text-rose-400 mt-2">
                        Systemic
                      </div>
                      <span className="text-[10px] text-slate-500">Impacting all active billing cycles</span>
                    </div>
                  </div>

                  {/* Investigation Notes */}
                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
                    <span className="font-semibold text-slate-300 uppercase tracking-wider block">
                      Investigation & Forensic Audit Notes
                    </span>
                    <p className="text-slate-300 leading-relaxed">
                      {selectedCluster.investigation_notes}
                    </p>
                    {selectedCluster.confirmed_cause && (
                      <div className="mt-3 p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-lg text-emerald-300">
                        <b>Confirmed Remediation Basis:</b> {selectedCluster.confirmed_cause}
                      </div>
                    )}
                  </div>

                  {/* Sample Affected Exceptions */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow">
                    <div className="px-4 py-3 border-b border-slate-800 font-semibold text-xs text-slate-200">
                      Sample Associated Exceptions
                    </div>
                    <div className="divide-y divide-slate-800/60">
                      {selectedCluster.affected_exceptions?.map((e: any) => (
                        <div key={e.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-800/30">
                          <div>
                            <span className="font-semibold text-white mr-2">{e.code}</span>
                            <span className="text-slate-400">{e.customer}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-rose-400 font-medium">₹{e.impact.toLocaleString()}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                              {e.severity}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <Network className="w-12 h-12 text-slate-600 mb-2" />
                  <span>Select a cluster from the left panel to inspect blast radius</span>
                </div>
              )}
            </div>
          </div>

          {/* Confirm Dialog */}
          {confirmOpen && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <h3 className="text-base font-bold text-white">Confirm Systemic Root Cause</h3>
                  <button onClick={() => setConfirmOpen(false)} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Confirmed Cause Description</label>
                    <textarea
                      rows={2}
                      value={confirmedCause}
                      onChange={(e) => setConfirmedCause(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Action Plan & Remediation Notes</label>
                    <textarea
                      rows={3}
                      value={investigationNotes}
                      onChange={(e) => setInvestigationNotes(e.target.value)}
                      placeholder="Outline batch credit adjustments, contract addenda, or telemetry fixes..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setConfirmOpen(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSubmit}
                    disabled={!confirmedCause.trim()}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded text-xs font-semibold"
                  >
                    Confirm & Record
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
