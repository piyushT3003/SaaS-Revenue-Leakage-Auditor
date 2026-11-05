import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Activity, Receipt, CreditCard, CheckCircle2, ArrowRight } from 'lucide-react';

interface StageProps {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  metric: string;
  status: 'matched' | 'auditing';
  color: string;
}

export const AnimatedDataFlow: React.FC = () => {
  const stages: StageProps[] = [
    {
      id: 'contracts',
      title: 'Contracts & Terms',
      subtitle: 'Commitments & Allowances',
      icon: FileText,
      metric: '₹1.48 Cr Contracted',
      status: 'matched',
      color: '#06b6d4',
    },
    {
      id: 'usage',
      title: 'Metered Usage',
      subtitle: 'API & Telemetry Logs',
      icon: Activity,
      metric: '3,842,100 Units',
      status: 'matched',
      color: '#3b82f6',
    },
    {
      id: 'invoices',
      title: 'Rated Invoices',
      subtitle: 'Billed Line Charges',
      icon: Receipt,
      metric: '₹1.24 Cr Invoiced',
      status: 'matched',
      color: '#8b5cf6',
    },
    {
      id: 'payments',
      title: 'Cash & Payments',
      subtitle: 'Allocated Settlement',
      icon: CreditCard,
      metric: '₹1.18 Cr Collected',
      status: 'matched',
      color: '#10b981',
    },
  ];

  return (
    <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 relative overflow-hidden volumetric-glow">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Automated Contract-to-Cash Data Stream Pipeline</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time deterministic telemetry flow across contract commitments, metered usage, billed invoices, and collected payments
          </p>
        </div>
        <div className="flex items-center space-x-2 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded-full">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Pipeline Integrity: 99.4%</span>
        </div>
      </div>

      {/* Grid of pipeline stages */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          return (
            <div key={stage.id} className="relative group">
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 hover:border-cyan-500/40 transition-all shadow-md relative z-10 flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center border"
                      style={{
                        backgroundColor: `${stage.color}15`,
                        borderColor: `${stage.color}40`,
                        color: stage.color,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700">
                      Tier 0{idx + 1}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white tracking-tight">{stage.title}</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">{stage.subtitle}</p>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white font-mono">{stage.metric}</span>
                  <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Verified</span>
                  </span>
                </div>
              </div>

              {/* Connecting arrow indicator between cards on desktop */}
              {idx < stages.length - 1 && (
                <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 text-cyan-400 bg-slate-950 p-1 rounded-full border border-slate-800 shadow-sm">
                  <ArrowRight className="w-3 h-3 animate-pulse" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ambient animated SVG circuit stream underneath */}
      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Active Ingestion Socket: Connected</span>
        </div>
        <div className="flex items-center space-x-4">
          <span>Reconciliation Cycle: Automated Daily Batch</span>
          <span className="text-cyan-400 font-semibold">Variance Tolerance: ±₹1.00</span>
        </div>
      </div>
    </div>
  );
};
