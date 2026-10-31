import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home, Layers, AlertTriangle, Users, CreditCard,
  BarChart3, Sparkles, Database, Settings, Activity
} from 'lucide-react';

interface SidebarProps {
  exceptionCount?: number;
  revenueHealthScore?: number;
  revenueHealthTrend?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  exceptionCount = 14,
  revenueHealthScore = 92.4,
  revenueHealthTrend = '+2.8 pp'
}) => {
  const navItems = [
    { label: 'Overview', path: '/', icon: Home, exact: true },
    { label: 'Reconciliation', path: '/reconciliation', icon: Layers },
    { label: 'Exceptions', path: '/exceptions', icon: AlertTriangle, badge: exceptionCount },
    { label: 'Customers', path: '/customers', icon: Users },
    { label: 'Billing & Payments', path: '/billing', icon: CreditCard },
    { label: 'Unit Economics', path: '/unit-economics', icon: BarChart3 },
    { label: 'AI Investigation', path: '/ai-assistant', icon: Sparkles, beta: true },
    { label: 'Data Management', path: '/data-management', icon: Database },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 shrink-0 fixed inset-y-0 left-0 bg-[#080d19]/90 backdrop-blur-xl border-r border-slate-800/80 flex flex-col z-30 select-none">
      {/* Brand Logo Header */}
      <div className="h-16 px-5 flex items-center space-x-3 border-b border-slate-800/60">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-[0_0_12px_rgba(225,29,72,0.5)]">
          <BarChart3 className="w-4 h-4 text-white" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm tracking-tight text-white">SaaS Revenue</span>
          </div>
          <div className="flex items-center space-x-1.5 -mt-0.5">
            <span className="font-bold text-sm tracking-tight text-white">Assurance</span>
            <span className="bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[9px] px-1.5 py-0.2 rounded-full font-semibold uppercase tracking-wider">
              Enterprise
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.45)] border border-rose-500/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-black/30 text-white'
                        : 'bg-rose-600/80 text-white border border-rose-500/50'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Revenue Health Card */}
      <div className="p-3 mx-3 mb-4 rounded-2xl bg-gradient-to-b from-[#0e172e] to-[#0a1020] border border-cyan-500/20 shadow-lg relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl pointer-events-none" />
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-rose-500 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 block">Revenue Health</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-white tracking-tight">{revenueHealthScore}%</span>
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center">
                ↑ {revenueHealthTrend}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
