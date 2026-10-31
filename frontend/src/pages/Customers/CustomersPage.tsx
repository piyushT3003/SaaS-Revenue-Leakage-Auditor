import React, { useState, useEffect } from 'react';
import {
  Users, UserCheck, AlertTriangle, TrendingUp, Search, Filter,
  Download, Eye, Layers, FileText, CreditCard, Activity, Coins, ArrowRight, X
} from 'lucide-react';
import { api } from '../../services/api';
import { CustomerListItem, CustomerDetail } from '../../types';

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

  // Customer 360 profile modal state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<CustomerDetail | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileTab, setProfileTab] = useState<'overview' | 'contracts' | 'usage' | 'billing' | 'payments' | 'exceptions' | 'profitability'>('overview');

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

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Customer</span>
            <span className="text-cyan-400">Intelligence</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            360° Financial, Contractual & Profitability View Across All SaaS Accounts
          </p>
        </div>

        <button
          onClick={() => window.open(api.exportCustomers('csv'), '_blank')}
          className="btn-3d flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs font-medium"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export Directory</span>
        </button>
      </div>

      {/* TOP SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Customers */}
        <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20">
          <div className="flex items-center space-x-2 text-cyan-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-[11px] font-medium text-slate-400">Total Customers</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">{summary.total_customers}</div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Active contracted cohort</span>
        </div>

        {/* New Customers */}
        <div className="glass-panel p-4 rounded-2xl border border-blue-500/20">
          <div className="flex items-center space-x-2 text-blue-400 mb-1">
            <UserCheck className="w-4 h-4" />
            <span className="text-[11px] font-medium text-slate-400">New Customers</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">{summary.new_customers}</div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Onboarded in last 90 days</span>
        </div>

        {/* At-Risk Customers */}
        <div className="glass-panel glass-panel-red p-4 rounded-2xl border border-rose-500/30">
          <div className="flex items-center space-x-2 text-rose-400 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[11px] font-medium text-slate-400">At-Risk Customers</span>
          </div>
          <div className="text-xl font-bold text-rose-400 tracking-tight">{summary.at_risk_customers}</div>
          <span className="text-[10px] text-rose-400/80 mt-0.5 block">Health score &lt; 65% or billing gaps</span>
        </div>

        {/* Expansion Opportunities */}
        <div className="glass-panel p-4 rounded-2xl border border-emerald-500/20">
          <div className="flex items-center space-x-2 text-emerald-400 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[11px] font-medium text-slate-400">Expansion Pipeline</span>
          </div>
          <div className="text-xl font-bold text-emerald-400 tracking-tight">{summary.expansion_opportunities}</div>
          <span className="text-[10px] text-emerald-400/80 mt-0.5 block">High usage velocity &gt;85% quota</span>
        </div>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name or code..."
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
            <option value="Startup">Startup</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="All">All Tiers</option>
            <option value="Enterprise">Enterprise</option>
            <option value="Professional">Professional</option>
            <option value="Growth">Growth</option>
            <option value="Starter">Starter</option>
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
        </div>
      </div>

      {/* CUSTOMERS DIRECTORY TABLE */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
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
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading customer profiles...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No customers found matching filter criteria.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 360° CUSTOMER PROFILE MODAL */}
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
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex items-center space-x-2 border-b border-slate-800 py-2.5 overflow-x-auto text-xs">
              {[
                { id: 'overview', label: 'Financial Overview', icon: Activity },
                { id: 'contracts', label: 'Contracts & Versions', icon: Layers },
                { id: 'usage', label: 'Usage Telemetry', icon: TrendingUp },
                { id: 'billing', label: 'Invoices', icon: FileText },
                { id: 'payments', label: 'Payments', icon: CreditCard },
                { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle },
                { id: 'profitability', label: 'Unit Economics', icon: Coins }
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
    </div>
  );
};
