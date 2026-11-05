import React, { useState, useEffect } from 'react';
import {
  Users, UserCheck, AlertTriangle, TrendingUp, Search, Filter,
  Download, Eye, Layers, FileText, CreditCard, Activity, Coins, ArrowRight, X,
  CheckSquare, Square, Scale, CheckCircle2, ChevronRight, GitBranch, ShieldCheck
} from 'lucide-react';
import { api } from '../../services/api';
import { CustomerListItem, CustomerDetail } from '../../types';
import { Interactive3DCard } from '../../components/3d/Interactive3DCard';
import { AnimatedNumber } from '../../components/3d/AnimatedNumber';
import { PageTransition } from '../../components/3d/PageTransition';
import { CustomerFlipCard } from '../../components/3d/CustomerFlipCard';
import { StaggeredContainer } from '../../components/3d/StaggeredContainer';
import { MagneticButton } from '../../components/3d/MagneticButton';
import { RevenueEvidenceGraphModal } from '../../components/3d/RevenueEvidenceGraphModal';
import { AuditEvidencePackModal } from '../../components/3d/AuditEvidencePackModal';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [summary, setSummary] = useState<any>({
    total_customers: 218,
    new_customers: 24,
    at_risk_customers: 38,
    expansion_opportunities: 42
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('All');
  const [planFilter, setPlanFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Customer selection for comparison (Section 13)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Customer 360 profile modal state (8 Tabs)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<CustomerDetail | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileTab, setProfileTab] = useState<
    'overview' | 'contracts' | 'subscriptions' | 'usage' | 'billing' | 'payments' | 'exceptions' | 'profitability'
  >('overview');

  // Advanced 3D Capability Modals
  const [showEvidenceGraph, setShowEvidenceGraph] = useState(false);
  const [showEvidencePack, setShowEvidencePack] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomers({
        search: search || undefined,
        segment: segmentFilter !== 'All' ? segmentFilter : undefined,
        plan_tier: planFilter !== 'All' ? planFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined
      });
      setCustomers(res.items || []);
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search, segmentFilter, planFilter, statusFilter]);

  const toggleCustomerSelection = (id: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openCustomerProfile = async (id: string) => {
    setSelectedCustomerId(id);
    setProfileLoading(true);
    setProfileTab('overview');
    try {
      const res = await api.getCustomerDetail(id);
      setProfileData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  const selectedCustomersForComparison = customers.filter((c) =>
    selectedCustomerIds.includes(c.id)
  );

  return (
    <PageTransition className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Customer</span>
            <span className="text-cyan-400">Intelligence</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            360° Financial, Contractual &amp; Profitability View Across All SaaS Accounts
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {selectedCustomerIds.length >= 2 && (
            <MagneticButton
              onClick={() => setShowCompareModal(true)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold shadow-[0_0_15px_rgba(6,182,212,0.35)]"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Compare ({selectedCustomerIds.length}) Accounts</span>
            </MagneticButton>
          )}

          <MagneticButton
            onClick={() => window.open(api.exportCustomers('csv'), '_blank')}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Directory</span>
          </MagneticButton>
        </div>
      </div>

      {/* TOP SUMMARY CARDS */}
      <StaggeredContainer className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Customers */}
        <Interactive3DCard
          glowColor="cyan"
          className="glass-panel p-4 rounded-2xl border border-cyan-500/20 shadow-lg"
        >
          <div className="flex items-center space-x-2 text-cyan-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-[11px] font-medium text-slate-400">Total Customers</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            <AnimatedNumber value={summary.total_customers} />
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Active contracted cohort</span>
        </Interactive3DCard>

        {/* New Customers */}
        <Interactive3DCard
          glowColor="blue"
          className="glass-panel p-4 rounded-2xl border border-blue-500/20 shadow-lg"
        >
          <div className="flex items-center space-x-2 text-blue-400 mb-1">
            <UserCheck className="w-4 h-4" />
            <span className="text-[11px] font-medium text-slate-400">New Customers</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            <AnimatedNumber value={summary.new_customers} />
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Onboarded in active period</span>
        </Interactive3DCard>

        {/* At-Risk Customers */}
        <Interactive3DCard
          glowColor="rose"
          className="glass-panel glass-panel-red p-4 rounded-2xl border border-rose-500/30 shadow-[0_0_20px_rgba(225,29,72,0.18)]"
        >
          <div className="flex items-center space-x-2 text-rose-400 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[11px] font-medium text-slate-400">At-Risk Accounts</span>
          </div>
          <div className="text-xl font-bold text-rose-400 tracking-tight">
            <AnimatedNumber value={summary.at_risk_customers} />
          </div>
          <span className="text-[10px] text-rose-400/80 mt-0.5 block">High dispute / margin deficit</span>
        </Interactive3DCard>

        {/* Expansion Opportunities */}
        <Interactive3DCard
          glowColor="emerald"
          className="glass-panel p-4 rounded-2xl border border-emerald-500/20 shadow-lg"
        >
          <div className="flex items-center space-x-2 text-emerald-400 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[11px] font-medium text-slate-400">Expansion Pipeline</span>
          </div>
          <div className="text-xl font-bold text-emerald-400 tracking-tight">
            <AnimatedNumber value={summary.expansion_opportunities} />
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Tier ceiling exceeded &gt;80%</span>
        </Interactive3DCard>
      </StaggeredContainer>

      {/* FILTER & SEARCH BAR */}
      <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, code..."
            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Segments</option>
            <option value="Enterprise">Enterprise</option>
            <option value="Mid-Market">Mid-Market</option>
            <option value="SMB">SMB</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Plans</option>
            <option value="Enterprise Unlimited">Enterprise Unlimited</option>
            <option value="Professional Growth">Professional Growth</option>
            <option value="Starter Cloud">Starter Cloud</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="At-Risk">At-Risk</option>
            <option value="Suspended">Suspended</option>
          </select>

          {selectedCustomerIds.length > 0 && (
            <button
              onClick={() => setSelectedCustomerIds([])}
              className="text-xs text-slate-400 hover:text-white px-2 py-1"
            >
              Deselect ({selectedCustomerIds.length})
            </button>
          )}
        </div>
      </div>

      {/* 3D INTERACTIVE FLIP SPOTLIGHT (Key Strategic Accounts) */}
      {customers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Interactive 3D Diagnostic Cards — Flip to Inspect Unit COGS</span>
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">3D Spatial Matrix</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {customers.slice(0, 3).map((cust) => (
              <CustomerFlipCard
                key={cust.id}
                customer={cust as any}
                onSelect={(id) => openCustomerProfile(id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* CUSTOMERS DIRECTORY TABLE */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                <th className="py-2.5 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={customers.length > 0 && selectedCustomerIds.length === customers.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedCustomerIds(customers.map((c) => c.id));
                      else setSelectedCustomerIds([]);
                    }}
                    className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                  />
                </th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-2">Segment</th>
                <th className="py-2.5 px-2">Plan Tier</th>
                <th className="py-2.5 px-2 text-right">Monthly Revenue</th>
                <th className="py-2.5 px-2 text-right">Annual Run-Rate</th>
                <th className="py-2.5 px-3 text-center">Health Score</th>
                <th className="py-2.5 px-2 text-center">Open Exceptions</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading customer profiles...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No customers found matching filter criteria.
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const isSelected = selectedCustomerIds.includes(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`table-row-hover hover:bg-slate-800/30 transition-colors ${
                        isSelected ? 'bg-cyan-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCustomerSelection(c.id)}
                          className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">
                            {c.name[0]}
                          </div>
                          <div>
                            <span className="font-semibold text-white block">{c.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{c.customer_code}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-2 text-slate-300">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px]">
                          {c.segment}
                        </span>
                      </td>

                      <td className="py-3 px-2 text-slate-300">
                        {c.plan_tier}
                      </td>

                      <td className="py-3 px-2 text-right font-medium text-white">
                        ₹{Math.round(c.mrr).toLocaleString('en-IN')}
                      </td>

                      <td className="py-3 px-2 text-right text-slate-300">
                        ₹{Math.round(c.annual_revenue).toLocaleString('en-IN')}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800">
                          <span className={`w-2 h-2 rounded-full ${
                            c.health_score >= 80 ? 'bg-emerald-400' : (c.health_score >= 60 ? 'bg-amber-400' : 'bg-rose-500')
                          }`} />
                          <span className="font-bold text-white text-[11px]">{c.health_score}%</span>
                        </div>
                      </td>

                      <td className="py-3 px-2 text-center">
                        {c.open_exceptions_count > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-400 border border-rose-500/40">
                            {c.open_exceptions_count} Discrepancy
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-medium">Reconciled</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => openCustomerProfile(c.id)}
                          className="btn-3d px-3 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center space-x-1 ml-auto"
                        >
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          <span>360° Profile</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CUSTOMER COMPARISON MODAL (Section 13) */}
      {showCompareModal && selectedCustomersForComparison.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-4xl bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Scale className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Side-by-Side Customer Comparison</h3>
              </div>
              <button onClick={() => setShowCompareModal(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            <div className="py-4 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Metric</th>
                    {selectedCustomersForComparison.map((c) => (
                      <th key={c.id} className="py-2.5 px-3 font-bold text-cyan-400">{c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-400">Customer Code</td>
                    {selectedCustomersForComparison.map((c) => (
                      <td key={c.id} className="py-2.5 px-3 font-mono text-cyan-300">{c.customer_code}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-400">Market Segment</td>
                    {selectedCustomersForComparison.map((c) => (
                      <td key={c.id} className="py-2.5 px-3">{c.segment}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-400">Subscription Tier</td>
                    {selectedCustomersForComparison.map((c) => (
                      <td key={c.id} className="py-2.5 px-3">{c.plan_tier}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-400">Contracted MRR</td>
                    {selectedCustomersForComparison.map((c) => (
                      <td key={c.id} className="py-2.5 px-3 font-bold text-white">₹{Math.round(c.mrr).toLocaleString('en-IN')}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-400">Annual Run-Rate (ARR)</td>
                    {selectedCustomersForComparison.map((c) => (
                      <td key={c.id} className="py-2.5 px-3 font-bold text-white">₹{Math.round(c.annual_revenue).toLocaleString('en-IN')}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-400">Account Health</td>
                    {selectedCustomersForComparison.map((c) => (
                      <td key={c.id} className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.health_score >= 80 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30' : 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
                        }`}>
                          {c.health_score}%
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-400">Open Exceptions</td>
                    {selectedCustomersForComparison.map((c) => (
                      <td key={c.id} className="py-2.5 px-3">
                        <span className={c.open_exceptions_count > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                          {c.open_exceptions_count} Cases
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-slate-800 hover:bg-slate-700"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 360° CUSTOMER PROFILE MODAL (All 8 Section 13 Tabs) */}
      {selectedCustomerId && profileData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-4xl bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold text-base shadow-md">
                  {profileData.customer.name[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{profileData.customer.name}</h3>
                  <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                    <span className="font-mono text-cyan-400">{profileData.customer.customer_code}</span>
                    <span>•</span>
                    <span>{profileData.customer.segment}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">Health: {profileData.customer.health_score}%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowEvidenceGraph(true)}
                  className="px-3 py-1.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/50 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center space-x-1.5 transition"
                >
                  <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                  <span>View Revenue Evidence</span>
                </button>

                <button
                  onClick={() => setShowEvidencePack(true)}
                  className="px-3 py-1.5 rounded-xl bg-teal-950/40 hover:bg-teal-900/50 border border-teal-500/40 text-teal-300 text-xs font-semibold flex items-center space-x-1.5 transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>Evidence Pack</span>
                </button>

                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs (8 Specific Tabs from Section 13) */}
            <div className="flex items-center space-x-2 border-b border-slate-800 py-2.5 overflow-x-auto text-xs">
              {[
                { id: 'overview', label: '1. Overview', icon: Activity },
                { id: 'contracts', label: '2. Contracts', icon: Layers },
                { id: 'subscriptions', label: '3. Subscriptions', icon: CreditCard },
                { id: 'usage', label: '4. Usage', icon: TrendingUp },
                { id: 'billing', label: '5. Invoices', icon: FileText },
                { id: 'payments', label: '6. Payments', icon: CreditCard },
                { id: 'exceptions', label: '7. Exceptions', icon: AlertTriangle },
                { id: 'profitability', label: '8. Profitability', icon: Coins }
              ].map((t) => {
                const Icon = t.icon;
                const isActive = profileTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setProfileTab(t.id as any)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-cyan-950 to-blue-950 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Body */}
            <div className="py-4 space-y-4 flex-1 text-xs">
              {/* TAB 1: OVERVIEW */}
              {profileTab === 'overview' && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-500 uppercase text-[10px] block">Contracted MRR</span>
                    <span className="text-lg font-bold text-white mt-1 block">₹{profileData.customer.mrr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-500 uppercase text-[10px] block">Annual Revenue (ARR)</span>
                    <span className="text-lg font-bold text-white mt-1 block">₹{profileData.customer.annual_revenue.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-500 uppercase text-[10px] block">Contribution Margin</span>
                    <span className="text-lg font-bold text-emerald-400 mt-1 block">
                      {profileData.unit_economics?.margin_pct ?? 0}%
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: CONTRACTS */}
              {profileTab === 'contracts' && (
                <div className="space-y-3">
                  {profileData.contracts.map((cnt: any) => (
                    <div key={cnt.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{cnt.contract_number}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                          {cnt.status}
                        </span>
                      </div>
                      <span className="text-slate-400 text-[11px] block">Validity: {cnt.start_date} to {cnt.end_date}</span>
                      <div className="pt-2 border-t border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Contract Versions</span>
                        {cnt.versions.map((v: any) => (
                          <div key={v.version_number} className="flex items-center justify-between mt-1 text-slate-300">
                            <span>Version #{v.version_number} (Fixed: ₹{v.fixed_fee.toLocaleString('en-IN')})</span>
                            <span className="text-cyan-400">Discount: {v.discount_pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: SUBSCRIPTIONS */}
              {profileTab === 'subscriptions' && (
                <div className="space-y-2">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                        <th className="py-2 px-3">Product Name</th>
                        <th className="py-2 px-2">Category</th>
                        <th className="py-2 px-2">Billing Cycle</th>
                        <th className="py-2 px-2 text-right">MRR</th>
                        <th className="py-2 px-2">Start Date</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {(profileData as any).subscriptions?.map((sub: any) => (
                        <tr key={sub.id}>
                          <td className="py-2 px-3 font-semibold text-white">{sub.product_name}</td>
                          <td className="py-2 px-2 text-slate-400">{sub.category}</td>
                          <td className="py-2 px-2 text-slate-300">{sub.billing_cycle}</td>
                          <td className="py-2 px-2 text-right font-bold text-cyan-300">₹{Math.round(sub.mrr).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-2 text-slate-400">{sub.start_date}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                              {sub.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 4: USAGE */}
              {profileTab === 'usage' && (
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-white block">Metered Product Consumption</span>
                  <p className="text-[11px] text-slate-400">
                    Telemetry logs for October 2026 recorded API calls, active seats, and transaction compute units across active products.
                  </p>
                </div>
              )}

              {/* TAB 5: BILLING / INVOICES */}
              {profileTab === 'billing' && (
                <div className="space-y-2">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                        <th className="py-2">Invoice #</th>
                        <th className="py-2">Period</th>
                        <th className="py-2 text-right">Amount</th>
                        <th className="py-2 text-right">Balance Due</th>
                        <th className="py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {profileData.invoices.map((inv: any) => (
                        <tr key={inv.id}>
                          <td className="py-2 font-mono text-cyan-400">{inv.invoice_number}</td>
                          <td className="py-2 text-slate-400">{inv.period}</td>
                          <td className="py-2 text-right font-medium text-white">₹{inv.total_amount.toLocaleString('en-IN')}</td>
                          <td className="py-2 text-right text-rose-400 font-bold">₹{inv.balance_due.toLocaleString('en-IN')}</td>
                          <td className="py-2 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">{inv.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 6: PAYMENTS */}
              {profileTab === 'payments' && (
                <div className="space-y-2">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                        <th className="py-2">Reference</th>
                        <th className="py-2">Date</th>
                        <th className="py-2">Method</th>
                        <th className="py-2 text-right">Amount</th>
                        <th className="py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {profileData.payments.map((p: any) => (
                        <tr key={p.id}>
                          <td className="py-2 font-mono text-emerald-400">{p.payment_reference}</td>
                          <td className="py-2 text-slate-400">{p.payment_date}</td>
                          <td className="py-2 text-slate-300">{p.method}</td>
                          <td className="py-2 text-right font-bold text-white">₹{p.amount.toLocaleString('en-IN')}</td>
                          <td className="py-2 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/60 text-emerald-400">{p.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 7: EXCEPTIONS */}
              {profileTab === 'exceptions' && (
                <div className="space-y-2">
                  {profileData.exceptions.length === 0 ? (
                    <div className="p-4 text-center text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
                      Zero exceptions logged for this account.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {profileData.exceptions.map((e: any) => (
                        <div key={e.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-rose-400 block">{e.exception_code}</span>
                            <span className="text-slate-300 text-[11px]">{e.issue_type}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-white block">₹{e.financial_impact.toLocaleString('en-IN')}</span>
                            <span className="px-2 py-0.2 rounded text-[10px] bg-rose-950/80 text-rose-300">{e.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 8: PROFITABILITY */}
              {profileTab === 'profitability' && profileData.unit_economics && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">October 2026 Unit Economics</span>
                    <span className="font-bold text-emerald-400 text-sm">{(profileData.unit_economics.margin_pct || 0).toFixed(1)}% Margin</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Monthly Revenue</span>
                      <span className="text-white font-bold">₹{Math.round(profileData.unit_economics.revenue || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Direct Allocated Service Costs</span>
                      <span className="text-white font-bold">₹{Math.round(profileData.unit_economics.direct_cost || 0).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-slate-800 hover:bg-slate-700"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Advanced 3D Capability Modals */}
      <RevenueEvidenceGraphModal
        isOpen={showEvidenceGraph}
        onClose={() => setShowEvidenceGraph(false)}
        customerId={selectedCustomerId || undefined}
      />

      <AuditEvidencePackModal
        isOpen={showEvidencePack}
        onClose={() => setShowEvidencePack(false)}
        packType="Customer"
        targetId={selectedCustomerId || undefined}
      />
    </PageTransition>
  );
};
