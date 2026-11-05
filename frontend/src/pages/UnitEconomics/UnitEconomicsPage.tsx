import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins, TrendingUp, TrendingDown, Users, AlertTriangle, ShieldCheck,
  Download, Filter, Search, Info, HelpCircle, ArrowUpRight, ArrowDownRight,
  Layers, CheckCircle2, ChevronRight, BarChart3, PieChart as PieChartIcon
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, PieChart, Pie, Cell, ComposedChart, Area
} from 'recharts';
import { api } from '../../services/api';
import { UnitEconomicsData } from '../../types';
import { Interactive3DCard } from '../../components/3d/Interactive3DCard';
import { AnimatedNumber } from '../../components/3d/AnimatedNumber';
import { PageTransition } from '../../components/3d/PageTransition';
import { StaggeredContainer } from '../../components/3d/StaggeredContainer';
import { MagneticButton } from '../../components/3d/MagneticButton';
import { WhatIfSimulatorModal } from '../../components/3d/WhatIfSimulatorModal';

export const UnitEconomicsPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<UnitEconomicsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('2026-10');
  const [segmentFilter, setSegmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'revenue' | 'direct_cost' | 'contribution' | 'margin_pct'>('contribution');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showMethodologyModal, setShowMethodologyModal] = useState(false);
  const [showWhatIfModal, setShowWhatIfModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [period, segmentFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.getUnitEconomics(period, segmentFilter);
      setData(res);
    } catch (err) {
      console.error('Error fetching unit economics:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return '₹' + Math.round(val).toLocaleString('en-IN');
  };

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-80 bg-slate-800/60 rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
          ))}
        </div>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-8 h-80 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
          <div className="col-span-4 h-80 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
        </div>
      </div>
    );
  }

  // Filter and sort customer rankings
  const filteredCustomers = data.customer_rankings.filter((c) => {
    const matchesSearch = c.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.customer_code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSegment = segmentFilter === 'All' || c.segment === segmentFilter;
    return matchesSearch && matchesSegment;
  }).sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    return sortOrder === 'desc' ? valB - valA : valA - valB;
  });

  const costColors = ['#00f0ff', '#3b82f6', '#8b5cf6', '#f43f5e', '#10b981'];

  return (
    <PageTransition className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 volumetric-glow">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Customer</span>
            <span className="text-cyan-400">Unit Economics</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Customer profitability, direct service cost allocation, and contribution margins
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowWhatIfModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-500/40 hover:bg-cyan-900/50 transition-colors btn-3d shadow-sm"
          >
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>What-If Simulator</span>
          </button>

          <MagneticButton
            onClick={() => setShowMethodologyModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 hover:bg-cyan-900/50 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Allocation Methodology</span>
          </MagneticButton>

          <a
            href={api.exportUnitEconomics()}
            download="unit_economics_report.csv"
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all shadow-sm btn-3d"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* TOP ROW: 4 PRIMARY UNIT ECONOMICS KPI CARDS */}
      <StaggeredContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: ARPC */}
        <Interactive3DCard className="glass-panel p-4 rounded-2xl border border-cyan-500/20 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Coins className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
              +4.8% vs Q3
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">Average Revenue Per Customer (ARPC)</span>
            <div className="text-2xl font-bold text-white tracking-tight mt-0.5">
              <AnimatedNumber value={data.arpc} prefix="₹" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Monthly net billed revenue / active customers</p>
          </div>
        </Interactive3DCard>

        {/* Card 2: ACPC */}
        <Interactive3DCard className="glass-panel p-4 rounded-2xl border border-blue-500/20 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-full">
              -1.2% MoM
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">Average Cost Per Customer (ACPC)</span>
            <div className="text-2xl font-bold text-white tracking-tight mt-0.5">
              <AnimatedNumber value={data.acpc} prefix="₹" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Direct cloud, compute & support infrastructure</p>
          </div>
        </Interactive3DCard>

        {/* Card 3: Contribution Per Customer */}
        <Interactive3DCard className="glass-panel p-4 rounded-2xl border border-emerald-500/20 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
              +7.4% MoM
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">Contribution Per Customer</span>
            <div className="text-2xl font-bold text-emerald-400 tracking-tight mt-0.5">
              <AnimatedNumber value={data.contribution_per_customer} prefix="₹" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Gross profit margin generated per customer</p>
          </div>
        </Interactive3DCard>

        {/* Card 4: Overall Contribution Margin % */}
        <Interactive3DCard className="glass-panel p-4 rounded-2xl border border-cyan-500/20 relative overflow-hidden group shadow-[0_0_20px_rgba(0,240,255,0.05)]">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-[11px] font-bold text-cyan-300">
              Target: 70.0%
            </div>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-medium text-slate-400 block">Overall Contribution Margin</span>
            <div className="text-2xl font-bold text-white tracking-tight mt-0.5">
              <AnimatedNumber value={data.overall_contribution_margin} suffix="%" decimals={1} />
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-1.5 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(data.overall_contribution_margin, 100)}%` }}
              />
            </div>
          </div>
        </Interactive3DCard>
      </StaggeredContainer>

      {/* SECOND ROW: CUSTOMER PROFITABILITY COHORTS */}
      <StaggeredContainer className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Interactive3DCard className="glass-panel p-4 rounded-xl border border-emerald-500/20 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Profitable Cohort (&gt; 40% Margin)</div>
            <div className="text-lg font-bold text-white">
              <AnimatedNumber value={data.profitable_customers_count} suffix=" Customers" />
            </div>
            <div className="text-[11px] text-emerald-400 font-medium">
              {((data.profitable_customers_count / (data.profitable_customers_count + data.at_risk_customers_count + data.unprofitable_customers_count)) * 100).toFixed(1)}% of total customer base
            </div>
          </div>
        </Interactive3DCard>

        <Interactive3DCard className="glass-panel p-4 rounded-xl border border-amber-500/20 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">At-Risk Cohort (0% - 40% Margin)</div>
            <div className="text-lg font-bold text-white">
              <AnimatedNumber value={data.at_risk_customers_count} suffix=" Customers" />
            </div>
            <div className="text-[11px] text-amber-400 font-medium">Requires price tier adjustment or cloud optimization</div>
          </div>
        </Interactive3DCard>

        <Interactive3DCard className="glass-panel p-4 rounded-xl border border-rose-500/30 flex items-center space-x-3 shadow-[0_0_15px_rgba(225,29,72,0.1)]">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Unprofitable Cohort (&lt; 0% Margin)</div>
            <div className="text-lg font-bold text-white">
              <AnimatedNumber value={data.unprofitable_customers_count} suffix=" Customers" />
            </div>
            <div className="text-[11px] text-rose-400 font-medium">Service cost exceeds contract invoice value</div>
          </div>
        </Interactive3DCard>
      </StaggeredContainer>

      {/* THIRD ROW: REVENUE VS COST TRENDS & DIRECT COST BREAKDOWN */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left: Revenue vs Cost Historical Trend */}
        <div className="col-span-12 lg:col-span-8 glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <span>Revenue vs Cost Dynamics</span>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded-md">6-Month Trend</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Monthly trajectory of billed SaaS revenue, direct cost, and contribution margin %</p>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center space-x-1.5 text-cyan-400">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>Revenue</span>
              </span>
              <span className="flex items-center space-x-1.5 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <span>Direct Cost</span>
              </span>
              <span className="flex items-center space-x-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>Margin %</span>
              </span>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.revenue_vs_cost_trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(val) => `₹${(val / 100000).toFixed(0)}L`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#10b981"
                  domain={[0, 100]}
                  tick={{ fill: '#10b981', fontSize: 11 }}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    borderColor: 'rgba(51, 65, 85, 0.8)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#fff'
                  }}
                  formatter={(val: any, name: any) => {
                    if (name === 'margin_pct') return [`${val}%`, 'Contribution Margin'];
                    return [formatCurrency(Number(val)), name === 'revenue' ? 'Revenue' : 'Direct Cost'];
                  }}
                />
                <Area yAxisId="left" type="monotone" dataKey="revenue" fill="url(#revenueGrad)" stroke="#00f0ff" strokeWidth={2} isAnimationActive={true} animationDuration={900} />
                <Bar yAxisId="left" dataKey="cost" fill="#f43f5e" radius={[4, 4, 0, 0]} opacity={0.7} barSize={24} isAnimationActive={true} animationDuration={900} />
                <Line yAxisId="right" type="monotone" dataKey="margin_pct" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} isAnimationActive={true} animationDuration={900} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Direct Cost Breakdown */}
        <div className="col-span-12 lg:col-span-4 glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <PieChartIcon className="w-4 h-4 text-cyan-400" />
              <span>Direct Cost Structure</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Allocation by functional delivery expense</p>

            <div className="h-44 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.cost_breakdown}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={4}
                    isAnimationActive={true}
                    animationDuration={900}
                  >
                    {data.cost_breakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={costColors[index % costColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderColor: 'rgba(51, 65, 85, 0.8)',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: '#fff'
                    }}
                    formatter={(val: any) => [formatCurrency(Number(val)), 'Cost']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-2 mt-2">
            {data.cost_breakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: costColors[idx % costColors.length] }} />
                  <span className="text-slate-300 font-medium">{item.category}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-white font-semibold">{formatCurrency(item.amount)}</span>
                  <span className="text-slate-400 text-[10px]">({item.percentage.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOURTH ROW: PRODUCT & SEGMENT PROFITABILITY COMPARISONS */}
      <div className="grid grid-cols-12 gap-5">
        {/* Product Profitability */}
        <div className="col-span-12 lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800">
          <h2 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>Product Profitability Analysis</span>
          </h2>
          <p className="text-xs text-slate-400 mb-4">Gross revenue vs direct costs and net contribution margin by product tier</p>

          <div className="space-y-3">
            {data.product_profitability.map((p, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-xs">{p.name}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    p.margin_pct >= 70 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40' :
                    p.margin_pct >= 40 ? 'bg-amber-950/40 text-amber-400 border border-amber-800/40' :
                    'bg-rose-950/40 text-rose-400 border border-rose-800/40'
                  }`}>
                    {p.margin_pct.toFixed(1)}% Margin
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2.5 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Revenue</span>
                    <span className="font-semibold text-slate-200">{formatCurrency(p.revenue)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Direct Cost</span>
                    <span className="font-semibold text-rose-400">{formatCurrency(p.direct_cost)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Contribution</span>
                    <span className="font-semibold text-cyan-400">{formatCurrency(p.contribution)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Segment Profitability */}
        <div className="col-span-12 lg:col-span-6 glass-panel p-5 rounded-2xl border border-slate-800">
          <h2 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Customer Segment Profitability</span>
          </h2>
          <p className="text-xs text-slate-400 mb-4">Enterprise, Mid-Market, and SMB cohort financial profiles</p>

          <div className="space-y-3">
            {data.segment_profitability.map((seg, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-white text-xs">{seg.segment}</span>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                      {seg.customer_count} accounts
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">
                    {seg.margin_pct.toFixed(1)}% Contribution
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2.5 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Segment Revenue</span>
                    <span className="font-semibold text-slate-200">{formatCurrency(seg.revenue)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Segment Cost</span>
                    <span className="font-semibold text-slate-300">{formatCurrency(seg.direct_cost)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Net Contribution</span>
                    <span className="font-semibold text-cyan-400">{formatCurrency(seg.contribution)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FIFTH ROW: CUSTOMER PROFITABILITY RANKING TABLE */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Customer Profitability Rankings</span>
              <span className="text-xs text-slate-500 font-normal">({filteredCustomers.length} accounts)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Account-level economics ranked by net financial contribution</p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 w-48"
              />
            </div>

            {/* Segment Filter */}
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-300 px-3 py-1.5 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="All">All Segments</option>
              <option value="Enterprise">Enterprise</option>
              <option value="Mid-Market">Mid-Market</option>
              <option value="SMB">SMB</option>
            </select>
          </div>
        </div>

        {/* Ranking Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-[11px] text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Segment</th>
                <th className="py-2.5 px-3">Tier</th>
                <th
                  onClick={() => {
                    if (sortField === 'revenue') setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                    else { setSortField('revenue'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  Revenue {sortField === 'revenue' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  onClick={() => {
                    if (sortField === 'direct_cost') setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                    else { setSortField('direct_cost'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  Direct Cost {sortField === 'direct_cost' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  onClick={() => {
                    if (sortField === 'contribution') setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                    else { setSortField('contribution'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-3 cursor-pointer hover:text-white text-cyan-400"
                >
                  Contribution {sortField === 'contribution' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  onClick={() => {
                    if (sortField === 'margin_pct') setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                    else { setSortField('margin_pct'); setSortOrder('desc'); }
                  }}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  Margin % {sortField === 'margin_pct' && (sortOrder === 'desc' ? '↓' : '↑')}
                </th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredCustomers.slice(0, 15).map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/customers?id=${c.id}`)}
                  className="table-row-hover hover:bg-slate-800/40 transition-colors cursor-pointer group"
                >
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors flex items-center space-x-1.5">
                      <span>{c.customer_name}</span>
                      <ArrowUpRight className="w-3 h-3 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">{c.customer_code}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">{c.segment}</td>
                  <td className="py-2.5 px-3 text-slate-400">{c.plan_tier}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-200">{formatCurrency(c.revenue)}</td>
                  <td className="py-2.5 px-3 font-medium text-rose-400/90">{formatCurrency(c.direct_cost)}</td>
                  <td className="py-2.5 px-3 font-bold text-cyan-400">{formatCurrency(c.contribution)}</td>
                  <td className="py-2.5 px-3 font-semibold">
                    <span className={
                      c.margin_pct >= 50 ? 'text-emerald-400' :
                      c.margin_pct >= 20 ? 'text-amber-400' : 'text-rose-400'
                    }>
                      {c.margin_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      c.status === 'Profitable' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40' :
                      c.status === 'At-Risk' ? 'bg-amber-950/40 text-amber-400 border border-amber-800/40' :
                      'bg-rose-950/40 text-rose-400 border border-rose-800/40'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ALLOCATION METHODOLOGY MODAL */}
      {showMethodologyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel max-w-2xl w-full p-6 rounded-2xl border border-cyan-500/30 relative max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Direct Service Cost Allocation Methodology</h3>
                  <p className="text-xs text-slate-400">Standardized SaaS Unit Economics Computation Framework</p>
                </div>
              </div>
              <button
                onClick={() => setShowMethodologyModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-1">Standard Formula</div>
                <div className="font-mono text-sm text-white bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  Contribution Margin % = ((Net Revenue - Direct Service Costs) / Net Revenue) * 100
                </div>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1.5">1. Cloud Infrastructure & Compute Allocation</h4>
                <p className="text-slate-400">
                  Direct Kubernetes cluster and server compute usage is tracked by customer namespace and API execution tags.
                  Shared database and caching nodes are allocated based on recorded API call volume and data storage footprint in gigabytes.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1.5">2. Dedicated Customer Support & SLA Allocation</h4>
                <p className="text-slate-400">
                  Direct customer support costs are computed from Zendesk/Jira ticket resolution hours multiplied by the blended hourly support engineer rate (₹1,800/hr). Enterprise designated support engineering (TAM) is allocated directly to customer contracts.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1.5">3. Payment Gateway & Interchange Processing</h4>
                <p className="text-slate-400">
                  Actual merchant interchange fees (1.9% for domestic cards, 2.9% for international cards, ₹15 flat for NACH/NEFT bank transfers) are assigned per transaction to corresponding customer invoices.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1.5">4. Third-Party Vendor APIs & Telemetry</h4>
                <p className="text-slate-400">
                  Per-seat licenses, OCR token consumption, LLM tokens, and SMS/email gateway fees are attributed 1:1 based on telemetry usage logs linked to the customer account.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-300">
                <span className="font-bold">Compliance Note:</span> This methodology complies with SaaS GAAP standards for Cost of Goods Sold (COGS) reporting and eliminates indirect sales/marketing overhead from gross unit economics.
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowMethodologyModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
              >
                Close Guidance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* What-If Revenue Recovery Simulator 3D Modal */}
      <WhatIfSimulatorModal
        isOpen={showWhatIfModal}
        onClose={() => setShowWhatIfModal(false)}
      />
    </PageTransition>
  );
};
