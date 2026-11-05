import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, History, Play, GitCompare, CheckCircle2, AlertCircle,
  ArrowRight, RefreshCw, Calendar, FileText, ChevronRight
} from 'lucide-react';
import { api } from '../../services/api';

interface HistoricalReplayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoricalReplayModal: React.FC<HistoricalReplayModalProps> = ({
  isOpen,
  onClose
}) => {
  const [period, setPeriod] = useState('2026-08');
  const [running, setRunning] = useState(false);
  const [currentRunResult, setCurrentRunResult] = useState<any>(null);
  const [runsList, setRunsList] = useState<any[]>([]);
  const [selectedRunA, setSelectedRunA] = useState<string>('');
  const [selectedRunB, setSelectedRunB] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadRuns();
    }
  }, [isOpen]);

  const loadRuns = async () => {
    try {
      const runs = await api.getHistoricalReplays();
      setRunsList(runs);
      if (runs.length >= 2) {
        setSelectedRunA(runs[0].id);
        setSelectedRunB(runs[1].id);
      } else if (runs.length === 1) {
        setSelectedRunA(runs[0].id);
      }
    } catch (err) {
      console.error('Failed to load replay runs', err);
    }
  };

  const handleExecuteReplay = async () => {
    setRunning(true);
    try {
      const res = await api.runHistoricalReplay(period);
      setCurrentRunResult(res);
      await loadRuns();
    } catch (err) {
      console.error('Failed to execute replay', err);
    } finally {
      setRunning(false);
    }
  };

  const handleCompare = async () => {
    if (!selectedRunA || !selectedRunB) return;
    setComparing(true);
    try {
      const comp = await api.compareHistoricalReplays(selectedRunA, selectedRunB);
      setComparisonResult(comp);
    } catch (err) {
      console.error('Failed to compare runs', err);
    } finally {
      setComparing(false);
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
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white tracking-wide">
                    Historical Billing Replay Engine
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    Immutable Contract Audits
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Reconstruct previous billing periods using historical contract versions and preserved meter telemetry
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

          {/* Action Ribbon */}
          <div className="px-6 py-3.5 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium">Replay Period:</span>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="2026-08">August 2026 (2026-08)</option>
                <option value="2026-09">September 2026 (2026-09)</option>
                <option value="2026-10">October 2026 (2026-10)</option>
              </select>

              <button
                onClick={handleExecuteReplay}
                disabled={running}
                className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-lg shadow-purple-900/30 transition"
              >
                {running ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{running ? 'Reconstructing...' : 'Execute Historical Replay'}</span>
              </button>
            </div>

            {/* Run comparison selector */}
            {runsList.length >= 2 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Compare:</span>
                <select
                  value={selectedRunA}
                  onChange={(e) => setSelectedRunA(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                >
                  {runsList.map(r => (
                    <option key={r.id} value={r.id}>{r.replay_code} ({r.period})</option>
                  ))}
                </select>
                <span className="text-xs text-slate-500">vs</span>
                <select
                  value={selectedRunB}
                  onChange={(e) => setSelectedRunB(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                >
                  {runsList.map(r => (
                    <option key={r.id} value={r.id}>{r.replay_code} ({r.period})</option>
                  ))}
                </select>
                <button
                  onClick={handleCompare}
                  disabled={comparing}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs font-medium rounded-lg text-slate-200 transition flex items-center gap-1"
                >
                  <GitCompare className="w-3 h-3" />
                  <span>Compare</span>
                </button>
              </div>
            )}
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Run-to-Run Comparison View */}
            {comparisonResult && (
              <div className="bg-slate-950/60 border border-purple-500/40 rounded-xl p-5 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-purple-400" />
                    <h3 className="text-sm font-semibold text-white">Replay Run-to-Run Delta Comparison</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                    Comparative Variance Verified
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-400">Expected Shift</span>
                    <div className="text-base font-bold text-white mt-1">
                      ₹{comparisonResult.deltas.expected_delta.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-400">Invoiced Shift</span>
                    <div className="text-base font-bold text-white mt-1">
                      ₹{comparisonResult.deltas.invoiced_delta.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-400">Variance Divergence</span>
                    <div className="text-base font-bold text-amber-400 mt-1">
                      ₹{comparisonResult.deltas.variance_delta.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-400">Discrepancy Shift</span>
                    <div className="text-base font-bold text-rose-400 mt-1">
                      {comparisonResult.deltas.discrepancy_delta > 0 ? '+' : ''}{comparisonResult.deltas.discrepancy_delta} accounts
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-lg text-xs text-purple-200 leading-relaxed whitespace-pre-line">
                  {comparisonResult.difference_explanation}
                </div>
              </div>
            )}

            {/* Current Execution Result */}
            {currentRunResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Reconstructed Expected</span>
                    <div className="text-lg font-bold text-white mt-1">
                      ₹{currentRunResult.summary.reconstructed_expected_receivable.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Historical Invoiced</span>
                    <div className="text-lg font-bold text-slate-300 mt-1">
                      ₹{currentRunResult.summary.historical_invoiced_total.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Audit Discrepancies</span>
                    <div className="text-lg font-bold text-rose-400 mt-1">
                      {currentRunResult.summary.discrepancies_detected} Detected
                    </div>
                  </div>
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Net Variance</span>
                    <div className="text-lg font-bold text-amber-400 mt-1">
                      ₹{currentRunResult.summary.net_historical_variance.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Discrepancy details table */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 font-semibold text-xs text-slate-200">
                    Line-by-Line Historical Reconstruction Details ({currentRunResult.reconstructed_rows?.length || 0} Accounts Audited)
                  </div>
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                        <tr>
                          <th className="px-4 py-2.5">Customer</th>
                          <th className="px-4 py-2.5">Contract Version</th>
                          <th className="px-4 py-2.5">Expected</th>
                          <th className="px-4 py-2.5">Invoiced</th>
                          <th className="px-4 py-2.5">Variance</th>
                          <th className="px-4 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {currentRunResult.reconstructed_rows?.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="px-4 py-2.5 font-medium text-white">{row.customer_name}</td>
                            <td className="px-4 py-2.5 text-slate-400">{row.contract_version}</td>
                            <td className="px-4 py-2.5 font-mono text-slate-200">₹{row.expected.toLocaleString()}</td>
                            <td className="px-4 py-2.5 font-mono text-slate-300">₹{row.invoiced.toLocaleString()}</td>
                            <td className={`px-4 py-2.5 font-mono font-medium ${
                              row.variance > 0 ? 'text-rose-400' : (row.variance < 0 ? 'text-blue-400' : 'text-slate-400')
                            }`}>
                              ₹{row.variance.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                row.status === 'Matched'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
                <History className="w-12 h-12 text-slate-600 mb-3" />
                <h4 className="text-sm font-semibold text-white mb-1">Select a period and execute historical replay</h4>
                <p className="text-xs text-slate-500 max-w-md">
                  The engine will pull historical contract versions, apply exact pricing rules active during that period, and reconstruct billing line items.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
