import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home, Layers, AlertTriangle, Users, CreditCard,
  BarChart3, Sparkles, Database, Settings, Activity
} from 'lucide-react';
import { Interactive3DCard } from '../components/3d/Interactive3DCard';

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
    <aside className="w-64 shrink-0 fixed inset-y-0 left-0 bg-[#080d19]/90 backdrop-blur-xl border-r border-slate-800/80 flex flex-col z-30 select-none shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
      {/* Brand Logo Header */}
      <Link to="/" className="h-16 px-5 flex items-center space-x-3 border-b border-slate-800/60 hover:opacity-90 transition-opacity cursor-pointer">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-[0_0_15px_rgba(225,29,72,0.55)]">
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
      </Link>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `group relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-white shadow-[0_0_20px_rgba(225,29,72,0.35)]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40 hover:translate-x-1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="activeSidebarIndicator"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 border border-rose-500/50 -z-10"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <div className="flex items-center space-x-3 z-10">
                    <Icon className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-1 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-cyan-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span className={`z-10 text-[10px] font-bold px-2 py-0.5 rounded-full transition-all ${
                      isActive
                        ? 'bg-black/30 text-white'
                        : 'bg-rose-600/80 text-white border border-rose-500/50 shadow-sm'
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
      <div className="mx-3 mb-4">
        <Interactive3DCard glowColor="cyan" className="p-3 rounded-2xl bg-gradient-to-b from-[#0e172e] to-[#0a1020] border border-cyan-500/20 shadow-lg relative overflow-hidden group">
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
        </Interactive3DCard>
      </div>
    </aside>
  );
};
