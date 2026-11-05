import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Activity, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert,
  Database, Zap, ArrowRight, Check
} from 'lucide-react';
import { api } from '../../services/api';

interface UsageIntegrityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UsageIntegrityModal: React.FC<UsageIntegrityModalProps> = ({
  isOpen,
  onClose
}) => {
  const [period, setPeriod] = useState('2026-10');
  const [sourceName, setSourceName] = useState('Primary Telemetry Pipeline');
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      handleScan();
    }
  }, [isOpen]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await api.scanUsageIntegrity(period, sourceName);
      setReport(res);
    } catch (err) {
      console.error('Failed to scan usage integrity', err);
    } finally {
      setScanning(false);
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
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Activity className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white tracking-wide">
                    Usage Meter Integrity Monitor
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Pre-Billing Data Validation
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Validates ingestion streams for duplicate idempotency keys, late-arriving events, and timestamp gaps
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
          <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium">Telemetry Target:</span>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
              >
                <option value="2026-10">October 2026 (2026-10)</option>
                <option value="2026-09">September 2026 (2026-09)</option>
                <option value="All">All Ingested Telemetry</option>
              </select>

              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                <span>{scanning ? 'Auditing Telemetry...' : 'Trigger Integrity Scan'}</span>
              </button>
            </div>

            {report && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Pipeline Status:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  report.status === 'Clean'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {report.status}
                </span>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {report && (
              <>
                {/* Score and Stats */}
                <div className="grid grid-cols-5 gap-3.5">
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                    <span className="text-xs text-slate-400">Integrity Health</span>
                    <div className="text-2xl font-bold font-mono text-cyan-400 mt-2">
                      {report.integrity_score.toFixed(1)}%
                    </div>
                    <span className="text-[10px] text-slate-500">Deduction-weighted score</span>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Total Audited Events</span>
                    <div className="text-xl font-bold text-white mt-2">
                      {report.total_events_checked.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-emerald-400">
                      {report.valid_events_count.toLocaleString()} Clean
                    </span>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Duplicates Detected</span>
                    <div className="text-xl font-bold text-rose-400 mt-2">
                      {report.duplicate_events_count}
                    </div>
                    <span className="text-[10px] text-slate-500">Idempotency collisions</span>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Late Arriving</span>
                    <div className="text-xl font-bold text-amber-400 mt-2">
                      {report.late_arriving_count}
                    </div>
                    <span className="text-[10px] text-slate-500">&gt;7 days ingestion lag</span>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-400">Out-of-Sub Window</span>
                    <div className="text-xl font-bold text-rose-400 mt-2">
                      {report.unmatched_period_count}
                    </div>
                    <span className="text-[10px] text-slate-500">Pre/post contract dates</span>
                  </div>
                </div>

                {/* Anomalies List */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                  <div className="px-4 py-3 border-b border-slate-800 font-semibold text-xs text-slate-200 flex justify-between items-center">
                    <span>Detected Telemetry Anomalies ({report.anomalies?.length || 0})</span>
                    <span className="text-[11px] text-slate-400 font-normal">Pre-billing automated hygiene audit</span>
                  </div>

                  {report.anomalies?.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                      <span>Zero telemetry anomalies detected. Ingestion pipeline is 100% clean for billing.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto">
                      {report.anomalies?.map((a: any, idx: number) => (
                        <div key={idx} className="p-4 hover:bg-slate-850/40 transition">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                a.severity === 'Critical' || a.severity === 'High'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}>
                                {a.severity}
                              </span>
                              <span className="text-xs font-semibold text-white">{a.anomaly_type}</span>
                              <span className="text-xs text-slate-400 font-mono">[{a.event_id}]</span>
                            </div>
                            <span className="text-xs text-slate-400">{a.customer_name}</span>
                          </div>

                          <p className="text-xs text-slate-300 mb-2">{a.description}</p>

                          <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-2 text-[11px] text-cyan-300">
                            <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span><b>Remediation:</b> {a.remediation}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
