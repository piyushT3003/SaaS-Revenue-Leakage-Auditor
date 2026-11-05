import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCw, TrendingUp, TrendingDown, ShieldCheck, AlertTriangle, ExternalLink, ArrowRight } from 'lucide-react';
import { CustomerListItem } from '../../types';

interface CustomerFlipCardProps {
  customer: CustomerListItem;
  onSelect?: (id: string) => void;
}

export const CustomerFlipCard: React.FC<CustomerFlipCardProps> = ({
  customer,
  onSelect,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return '₹0';
    return '₹' + Math.round(val).toLocaleString('en-IN');
  };

  const displayName = customer.name || (customer as any).customer_name || 'Customer Account';
  const displayVal = customer.mrr || (customer as any).contract_value || 0;

  return (
    <div className="flip-card-container w-full h-[220px]">
      <div className={`flip-card-inner ${isFlipped ? 'is-flipped' : ''}`}>
        {/* FRONT FACE */}
        <div className="flip-card-front glass-panel p-4 flex flex-col justify-between border border-slate-800 hover:border-cyan-500/40 bg-slate-900/80 shadow-lg">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                  {customer.customer_code}
                </span>
                <h4 className="text-sm font-bold text-white tracking-tight truncate max-w-[190px]">
                  {displayName}
                </h4>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  customer.status === 'Active'
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                    : 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                }`}
              >
                {customer.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Segment & Tier</span>
                <span className="font-semibold text-slate-200 truncate block">
                  {customer.segment} · {customer.plan_tier}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Contract MRR</span>
                <span className="font-semibold text-cyan-400">
                  {formatCurrency(displayVal)}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-white">Score: {customer.health_score || 94}/100</span>
            </div>

            <button
              onClick={() => setIsFlipped(true)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-cyan-400 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-800/40 transition-colors btn-3d"
            >
              <RotateCw className="w-3 h-3" />
              <span>Unit Diagnostics</span>
            </button>
          </div>
        </div>

        {/* BACK FACE (DIAGNOSTICS & UNIT ECONOMICS) */}
        <div className="flip-card-back glass-panel p-4 flex flex-col justify-between border border-cyan-500/30 bg-slate-950/95 shadow-xl">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Unit Margin & COGS</span>
              </span>
              <button
                onClick={() => setIsFlipped(false)}
                className="text-slate-400 hover:text-white text-xs p-1 rounded hover:bg-slate-800 transition-colors"
                title="Flip to overview"
              >
                ✕
              </button>
            </div>

            <div className="mt-2.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Direct Cloud Compute:</span>
                <span className="font-mono text-slate-200">₹14,200</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Dedicated Support:</span>
                <span className="font-mono text-slate-200">₹6,800</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Third-Party Vendor APIs:</span>
                <span className="font-mono text-slate-200">₹3,400</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 font-semibold">
                <span className="text-emerald-400">Contribution Margin:</span>
                <span className="text-emerald-400 font-bold">72.4%</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
            <button
              onClick={() => setIsFlipped(false)}
              className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1"
            >
              <RotateCw className="w-3 h-3" />
              <span>Back</span>
            </button>

            {onSelect && (
              <button
                onClick={() => onSelect(customer.id)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors flex items-center space-x-1 btn-3d"
              >
                <span>Full Profile</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
