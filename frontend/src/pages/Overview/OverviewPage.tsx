import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Layers, AlertTriangle, CreditCard, Users, Coins, TrendingUp,
  Maximize2, Info, ArrowUpRight, ArrowDownRight, Send, Sparkles,
  ExternalLink, MoreHorizontal, CheckCircle2, ChevronRight,
  ShieldCheck, Clock, RefreshCw, FileText
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, ComposedChart
} from 'recharts';
import { api } from '../../services/api';
import { ExecutiveOverviewData, RecentExceptionItem } from '../../types';
import { Interactive3DCard } from '../../components/3d/Interactive3DCard';
import { AnimatedNumber } from '../../components/3d/AnimatedNumber';
import { PageTransition } from '../../components/3d/PageTransition';
import { StaggeredContainer } from '../../components/3d/StaggeredContainer';
import { MagneticButton } from '../../components/3d/MagneticButton';
import { WhatIfSimulatorModal } from '../../components/3d/WhatIfSimulatorModal';
import { AuditEvidencePackModal } from '../../components/3d/AuditEvidencePackModal';

export const OverviewPage: React.FC = () => {
  const { dateRange } = useOutletContext<{ dateRange: { start: string; end: string } }>();
  const [data, setData] = useState<ExecutiveOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExceptionFilter, setSelectedExceptionFilter] = useState('All');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponseModal, setAiResponseModal] = useState<any>(null);
  const [showWhatIfModal, setShowWhatIfModal] = useState(false);
  const [showEvidencePackModal, setShowEvidencePackModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await api.getOverview(dateRange.start, dateRange.end);
        setData(res);
      } catch (err) {
        console.error('Error fetching executive overview:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange]);

  const handleAskAI = async (questionText: string) => {
    if (!questionText.trim()) return;
    setAiLoading(true);
    try {
      const res = await api.askAI(questionText);
      setAiResponseModal({ question: questionText, ...res });
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-80 bg-slate-800/60 rounded-xl" />
        <div className="grid grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
          ))}
        </div>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-5 h-72 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
          <div className="col-span-4 h-72 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
          <div className="col-span-3 h-72 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
        </div>
      </div>
    );
  }

  // Filter recent exceptions by selected tab
  const filteredExceptions = data.recent_exceptions.filter((exc) => {
    if (selectedExceptionFilter === 'All') return true;
    if (selectedExceptionFilter === 'Underbilling') return exc.issue_type === 'Underbilling';
    if (selectedExceptionFilter === 'Overbilling') return exc.issue_type === 'Overbilling';
    if (selectedExceptionFilter === 'Missing') return exc.issue_type === 'Missing Charges';
    if (selectedExceptionFilter === 'Others') {
      return !['Underbilling', 'Overbilling', 'Missing Charges'].includes(exc.issue_type);
    }
    return true;
  });

  return (
    <PageTransition className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between volumetric-glow">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Executive</span>
            <span className="text-rose-500">Overview</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Contract-to-Cash, Revenue Leakage & Customer Unit Economics
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setShowWhatIfModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-emerald-300 border border-emerald-500/30 text-xs font-semibold shadow-sm transition"
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>What-If Recovery Simulator</span>
          </button>

          <button
            onClick={() => setShowEvidencePackModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-teal-300 border border-teal-500/30 text-xs font-semibold shadow-sm transition"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Audit Evidence Pack</span>
          </button>
        </div>
      </div>

      {/* STALE AUDIT WARNING BANNER (Section 12 & 19) */}
      {data.audit_status?.is_stale && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 flex items-center justify-between text-xs shadow-lg">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-white">Audit data is stale — </span>
              <span>{data.audit_status.reason || 'New source records were imported since the last audit run.'}</span>
              <span className="text-slate-400 ml-2">Re-run recommended for updated assurance.</span>
            </div>
          </div>
          <MagneticButton
            onClick={() => navigate('/reconciliation')}
            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Re-Audit Now</span>
          </MagneticButton>
        </div>
      )}

      {/* REVENUE HEALTH & AUDIT ASSURANCE PANEL (Section 12 & 19) */}
      <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4 volumetric-glow">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Revenue Assurance Health</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                {data.revenue_health.score}% {data.revenue_health.status} ({data.revenue_health.trend})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-400">
              <span>Data Quality: <strong className="text-cyan-300">{data.revenue_health.factors?.data_integrity || 98.2}%</strong></span>
              <span>•</span>
              <span>Reconciliation Rate: <strong className="text-cyan-300">{data.revenue_health.factors?.reconciliation_rate || 92.4}%</strong></span>
              <span>•</span>
              <span>Collection Efficiency: <strong className="text-cyan-300">{data.revenue_health.factors?.collection_efficiency || 91.5}%</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
          <div className="text-right">
            <div className="flex items-center space-x-1.5 justify-end">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Latest Audit:</span>
              <span className="text-xs font-mono font-bold text-white">{data.audit_status?.latest_run_id || 'RUN-202610-LATEST'}</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-semibold border ${
                data.audit_status?.is_stale
                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                  : 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
              }`}>
                {data.audit_status?.is_stale ? 'Stale' : (data.audit_status?.status || 'Successful')}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {data.audit_status?.last_run_at ? new Date(data.audit_status.last_run_at).toLocaleString() : 'Active Assurance Scope'}
            </span>
          </div>

          <button
            onClick={() => navigate('/reconciliation')}
            className="btn-3d px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium flex items-center space-x-1.5"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Audit Center</span>
          </button>
        </div>
      </div>

      {/* TOP ROW: 5 KPI CARDS */}
      <StaggeredContainer className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Card 1: Total Revenue (MRR) */}
        <Interactive3DCard
          glowColor="cyan"
          onClick={() => navigate('/billing')}
          className="glass-panel p-4 rounded-2xl cursor-pointer border border-cyan-500/20 relative overflow-hidden group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
            <div className="w-16 h-7">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.mrr_kpi.sparkline.map((v, i) => ({ val: v, i }))}>
                  <Line type="monotone" dataKey="val" stroke="#00f0ff" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">{data.mrr_kpi.label}</span>
            <div className="text-xl font-bold text-white tracking-tight mt-0.5">
              <AnimatedNumber value={data.mrr_kpi.raw_value} formatAsCurrency prefix="₹" />
            </div>
            <div className="flex items-center space-x-1 mt-1 text-[11px] font-medium text-emerald-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+{data.mrr_kpi.change_pct}% {data.mrr_kpi.change_label}</span>
            </div>
          </div>
        </Interactive3DCard>

        {/* Card 2: Revenue Leakage */}
        <Interactive3DCard
          glowColor="rose"
          onClick={() => navigate('/exceptions')}
          className="glass-panel glass-panel-red p-4 rounded-2xl cursor-pointer border border-rose-500/30 relative overflow-hidden group shadow-[0_0_24px_rgba(225,29,72,0.18)]"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="w-16 h-7">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.leakage_kpi.sparkline.map((v, i) => ({ val: v, i }))}>
                  <Line type="monotone" dataKey="val" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">{data.leakage_kpi.label}</span>
            <div className="text-xl font-bold text-white tracking-tight mt-0.5">
              <AnimatedNumber value={data.leakage_kpi.raw_value} formatAsCurrency prefix="₹" />
            </div>
            <div className="flex items-center space-x-1 mt-1 text-[11px] font-medium text-rose-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+{data.leakage_kpi.change_pct}% {data.leakage_kpi.change_label}</span>
            </div>
          </div>
        </Interactive3DCard>

        {/* Card 3: Outstanding Payments */}
        <Interactive3DCard
          glowColor="blue"
          onClick={() => navigate('/billing')}
          className="glass-panel p-4 rounded-2xl cursor-pointer border border-blue-500/20 relative overflow-hidden group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="w-16 h-7">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.outstanding_kpi.sparkline.map((v, i) => ({ val: v, i }))}>
                  <Line type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">{data.outstanding_kpi.label}</span>
            <div className="text-xl font-bold text-white tracking-tight mt-0.5">
              <AnimatedNumber value={data.outstanding_kpi.raw_value} formatAsCurrency prefix="₹" />
            </div>
            <div className="flex items-center space-x-1 mt-1 text-[11px] font-medium text-emerald-400">
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>{data.outstanding_kpi.change_pct}% {data.outstanding_kpi.change_label}</span>
            </div>
          </div>
        </Interactive3DCard>

        {/* Card 4: Active Customers */}
        <Interactive3DCard
          glowColor="cyan"
          onClick={() => navigate('/customers')}
          className="glass-panel p-4 rounded-2xl cursor-pointer border border-cyan-500/20 relative overflow-hidden group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
            <div className="w-16 h-7">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.active_customers_kpi.sparkline.map((v, i) => ({ val: v, i }))}>
                  <Line type="monotone" dataKey="val" stroke="#00f0ff" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">{data.active_customers_kpi.label}</span>
            <div className="text-xl font-bold text-white tracking-tight mt-0.5">
              <AnimatedNumber value={data.active_customers_kpi.raw_value} />
            </div>
            <div className="flex items-center space-x-1 mt-1 text-[11px] font-medium text-emerald-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+{data.active_customers_kpi.change_pct}% {data.active_customers_kpi.change_label}</span>
            </div>
          </div>
        </Interactive3DCard>

        {/* Card 5: Contribution Margin */}
        <Interactive3DCard
          glowColor="amber"
          onClick={() => navigate('/unit-economics')}
          className="glass-panel p-4 rounded-2xl cursor-pointer border border-amber-500/20 relative overflow-hidden group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Coins className="w-4 h-4" />
            </div>
            <div className="w-16 h-7">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.contribution_margin_kpi.sparkline.map((v, i) => ({ val: v, i }))}>
                  <Line type="monotone" dataKey="val" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">{data.contribution_margin_kpi.label}</span>
            <div className="text-xl font-bold text-white tracking-tight mt-0.5">
              <AnimatedNumber value={data.contribution_margin_kpi.raw_value} suffix="%" />
            </div>
            <div className="flex items-center space-x-1 mt-1 text-[11px] font-medium text-emerald-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+{data.contribution_margin_kpi.change_pct} {data.contribution_margin_kpi.change_label}</span>
            </div>
          </div>
        </Interactive3DCard>
      </StaggeredContainer>

      {/* MIDDLE ROW: 3 ANALYTICAL PANELS */}
      <div className="grid grid-cols-12 gap-5">
        {/* Panel 1: Revenue Trend & Leakage (col-span-5) */}
        <div className="col-span-12 lg:col-span-5 glass-panel p-5 rounded-2xl border border-cyan-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-bold text-white">Revenue Trend & Leakage</h2>
            </div>
            <div className="flex items-center space-x-3 text-[10px]">
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span className="text-slate-400">Billed Revenue</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-slate-400">Expected Revenue</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-slate-400">Revenue Leakage</span>
              </div>
            </div>
          </div>

          <div className="h-56 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.revenue_trends} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis yAxisId="left" stroke="#64748b" fontSize={10} tickFormatter={(v) => `₹${(v / 10000000).toFixed(1)}Cr`} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={10} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1629', borderColor: 'rgba(6,182,212,0.3)', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, '']}
                />
                <Bar yAxisId="left" dataKey="billed_revenue" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={14} />
                <Bar yAxisId="left" dataKey="expected_revenue" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={14} />
                <Line yAxisId="right" type="monotone" dataKey="revenue_leakage" stroke="#f43f5e" strokeWidth={2.5} dot={{ fill: '#f43f5e', r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Panel 2: Billing Exceptions by Type Donut (col-span-4) */}
        <div className="col-span-12 lg:col-span-4 glass-panel p-5 rounded-2xl border border-cyan-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <h2 className="text-sm font-bold text-white">Billing Exceptions by Type</h2>
            <button onClick={() => navigate('/exceptions')} className="text-slate-400 hover:text-cyan-400 p-1">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between h-56 pt-2">
            {/* Donut Chart with center label */}
            <div className="relative w-44 h-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.exceptions_by_type}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={3}
                  >
                    {data.exceptions_by_type.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0d1629', borderColor: 'rgba(6,182,212,0.3)', borderRadius: '12px', fontSize: '11px' }}
                    formatter={(val: any, name: any, item: any) => [
                      `${val} Exceptions (${item.payload.percentage}%)`,
                      name
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-white">
                  {data.exceptions_by_type.reduce((acc, curr) => acc + curr.count, 0)}
                </span>
                <span className="text-[10px] text-slate-400 -mt-0.5">Exceptions</span>
              </div>
            </div>

            {/* Legend List */}
            <div className="flex-1 pl-4 space-y-1.5 text-xs">
              {data.exceptions_by_type.map((item) => (
                <div
                  key={item.type}
                  onClick={() => navigate(`/exceptions?issue_type=${encodeURIComponent(item.type)}`)}
                  className="flex items-center justify-between p-1 rounded-lg hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-300 text-[11px] truncate">{item.type}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel 3: Customer Profitability (col-span-3) */}
        <div className="col-span-12 lg:col-span-3 glass-panel p-5 rounded-2xl border border-cyan-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center space-x-1.5">
              <h2 className="text-sm font-bold text-white">Customer Profitability</h2>
              <span title="Margin breakdown across 218 active SaaS accounts">
                <Info className="w-3.5 h-3.5 text-slate-500 cursor-pointer" />
              </span>
            </div>
            <button onClick={() => navigate('/unit-economics')} className="text-slate-400 hover:text-cyan-400 p-1">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3.5 my-auto py-2">
            {/* Profitable */}
            <div
              onClick={() => navigate('/unit-economics')}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-900/40 hover:bg-slate-800/50 cursor-pointer transition-all border border-slate-800/60"
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-slate-200">Profitable Customers</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/30">
                  {data.customer_profitability.profitable_count}
                </span>
                <span className="text-xs text-slate-400">{data.customer_profitability.profitable_pct}%</span>
              </div>
            </div>

            {/* At-Risk */}
            <div
              onClick={() => navigate('/unit-economics')}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-900/40 hover:bg-slate-800/50 cursor-pointer transition-all border border-slate-800/60"
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-xs font-medium text-slate-200">At-Risk Customers</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-amber-400 px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-500/30">
                  {data.customer_profitability.at_risk_count}
                </span>
                <span className="text-xs text-slate-400">{data.customer_profitability.at_risk_pct}%</span>
              </div>
            </div>

            {/* Unprofitable */}
            <div
              onClick={() => navigate('/unit-economics')}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-900/40 hover:bg-slate-800/50 cursor-pointer transition-all border border-slate-800/60"
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-xs font-medium text-slate-200">Unprofitable Customers</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-rose-400 px-2 py-0.5 rounded-md bg-rose-950/60 border border-rose-500/30">
                  {data.customer_profitability.unprofitable_count}
                </span>
                <span className="text-xs text-slate-400">{data.customer_profitability.unprofitable_pct}%</span>
              </div>
            </div>
          </div>

          {/* Segmented Horizontal Progress Bar */}
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-800">
            <div style={{ width: `${data.customer_profitability.profitable_pct}%` }} className="bg-emerald-500" />
            <div style={{ width: `${data.customer_profitability.at_risk_pct}%` }} className="bg-amber-400" />
            <div style={{ width: `${data.customer_profitability.unprofitable_pct}%` }} className="bg-rose-500" />
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: RECENT HIGH-IMPACT EXCEPTIONS & AI ASSISTANT */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left: Recent High-Impact Exceptions Table (col-span-8) */}
        <div className="col-span-12 lg:col-span-8 glass-panel p-5 rounded-2xl border border-cyan-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-sm font-bold text-white">Recent High-Impact Exceptions</h2>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center space-x-1.5 text-xs">
              {['All', 'Underbilling', 'Overbilling', 'Missing', 'Others'].map((tab) => {
                const countMap: Record<string, number> = {
                  All: data.recent_exceptions.length,
                  Underbilling: data.recent_exceptions.filter((e) => e.issue_type === 'Underbilling').length,
                  Overbilling: data.recent_exceptions.filter((e) => e.issue_type === 'Overbilling').length,
                  Missing: data.recent_exceptions.filter((e) => e.issue_type === 'Missing Charges').length,
                  Others: data.recent_exceptions.filter(
                    (e) => !['Underbilling', 'Overbilling', 'Missing Charges'].includes(e.issue_type)
                  ).length
                };
                const isSelected = selectedExceptionFilter === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setSelectedExceptionFilter(tab)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.4)]'
                        : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {tab} ({countMap[tab]})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exceptions Table */}
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-slate-400 font-semibold text-[11px]">
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-2">Issue Type</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-2 text-right">Financial Impact</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredExceptions.slice(0, 4).map((exc) => (
                  <tr key={exc.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Customer */}
                    <td className="py-3 px-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-6 h-6 rounded-md bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-[10px] font-bold">
                          {exc.customer_name[0]}
                        </div>
                        <span className="font-semibold text-slate-200">{exc.customer_name}</span>
                      </div>
                    </td>

                    {/* Issue Type Badge */}
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

                    {/* Description */}
                    <td className="py-3 px-3 text-slate-400 text-[11px]">
                      {exc.description}
                    </td>

                    {/* Financial Impact */}
                    <td className="py-3 px-2 text-right font-bold text-white text-xs">
                      ₹{exc.financial_impact.toLocaleString('en-IN')}
                    </td>

                    {/* Status Pill */}
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        exc.status === 'Open' ? 'bg-rose-950/80 text-rose-400 border-rose-500/40' :
                        exc.status === 'In Progress' ? 'bg-amber-950/80 text-amber-400 border-amber-500/40' :
                        'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                      }`}>
                        {exc.status}
                      </span>
                    </td>

                    {/* Action Button */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => navigate(`/exceptions?id=${exc.id}`)}
                          className={`btn-3d px-3 py-1 rounded-lg text-[11px] font-medium border ${
                            exc.status === 'Resolved'
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                              : 'bg-gradient-to-r from-rose-900/60 to-red-900/60 hover:from-rose-800 hover:to-red-800 text-white border-rose-500/40 shadow-sm'
                          }`}
                        >
                          {exc.status === 'Resolved' ? 'View Details' : 'Investigate'}
                        </button>
                        <button
                          onClick={() => navigate(`/exceptions?id=${exc.id}`)}
                          className="p-1 rounded text-slate-500 hover:text-white"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: AI Investigation Assistant (col-span-4) */}
        <div className="col-span-12 lg:col-span-4 glass-panel p-5 rounded-2xl border border-rose-500/30 flex flex-col justify-between shadow-[0_0_25px_rgba(225,29,72,0.12)]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-rose-400" />
                <h2 className="text-sm font-bold text-white">AI Investigation Assistant</h2>
              </div>
              <span className="bg-rose-950/80 text-rose-400 border border-rose-500/40 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Beta
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Ask questions about revenue, billing, customers or anomalies in natural language.
            </p>

            {/* Suggested Question Chips */}
            <div className="mt-3.5 space-y-2">
              <button
                onClick={() => handleAskAI('Why is revenue leakage up this month?')}
                className="w-full text-left px-3 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/80 hover:border-cyan-500/40 text-xs text-slate-300 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-2 truncate">
                  <TrendingUp className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">Why is revenue leakage up this month?</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 shrink-0 ml-1" />
              </button>

              <button
                onClick={() => handleAskAI('Show top 5 underbilled customers')}
                className="w-full text-left px-3 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/80 hover:border-cyan-500/40 text-xs text-slate-300 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-2 truncate">
                  <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">Show top 5 underbilled customers</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 shrink-0 ml-1" />
              </button>

              <button
                onClick={() => handleAskAI('Explain the discount drift for InfiniIT')}
                className="w-full text-left px-3 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/80 hover:border-cyan-500/40 text-xs text-slate-300 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-2 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">Explain the discount drift for InfiniIT</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 shrink-0 ml-1" />
              </button>
            </div>
          </div>

          {/* Natural Language Input Field */}
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskAI(aiQuestion);
              }}
              className="relative flex items-center"
            >
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="Ask Anything..."
                disabled={aiLoading}
                className="w-full bg-slate-900/90 border border-slate-700/80 focus:border-rose-500/80 rounded-xl pl-3.5 pr-10 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={aiLoading || !aiQuestion.trim()}
                className="absolute right-1.5 p-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 text-white disabled:opacity-40 hover:from-rose-500 hover:to-red-500 transition-all shadow-[0_0_10px_rgba(225,29,72,0.4)]"
              >
                {aiLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* AI Investigation Result Modal */}
      {aiResponseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{aiResponseModal.question}</h3>
                  <p className="text-[10px] text-cyan-400 mt-0.5">{aiResponseModal.reporting_period} • {aiResponseModal.status_note}</p>
                </div>
              </div>
              <button onClick={() => setAiResponseModal(null)} className="text-slate-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-200 leading-relaxed">
                {aiResponseModal.answer}
              </div>

              {aiResponseModal.affected_customers?.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Affected Accounts</h4>
                  <div className="space-y-1.5">
                    {aiResponseModal.affected_customers.map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                        <span className="font-medium text-white">{c.name}</span>
                        <span className="font-bold text-rose-400">₹{Number(c.impact || c.deficit || 0).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Source Relational Records Grounding</h4>
                <div className="flex flex-wrap gap-1.5">
                  {aiResponseModal.source_references?.map((ref: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] border border-slate-700">
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setAiResponseModal(null);
                  navigate('/ai-assistant');
                }}
                className="text-cyan-400 hover:underline text-xs flex items-center space-x-1"
              >
                <span>Open Full AI Investigation Suite</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setAiResponseModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-slate-800 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Advanced 3D Capability Modals */}
      <WhatIfSimulatorModal
        isOpen={showWhatIfModal}
        onClose={() => setShowWhatIfModal(false)}
      />

      <AuditEvidencePackModal
        isOpen={showEvidencePackModal}
        onClose={() => setShowEvidencePackModal(false)}
        packType="PeriodAudit"
        targetId="2026-10"
      />
    </PageTransition>
  );
};
