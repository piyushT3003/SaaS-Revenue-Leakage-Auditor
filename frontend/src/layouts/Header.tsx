import React, { useState } from 'react';
import {
  Search, Calendar, ChevronDown, Bell, HelpCircle,
  Download, LogOut, User as UserIcon, Shield
} from 'lucide-react';

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenDateRange: () => void;
  onOpenNotifications: () => void;
  onOpenHelp: () => void;
  onExportReport: () => void;
  dateRangeLabel: string;
  unreadCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  onOpenDateRange,
  onOpenNotifications,
  onOpenHelp,
  onExportReport,
  dateRangeLabel,
  unreadCount = 3
}) => {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  return (
    <header className="h-16 fixed top-0 right-0 left-64 bg-[#080d19]/80 backdrop-blur-xl border-b border-slate-800/80 px-6 flex items-center justify-between z-20 select-none">
      {/* Global Search Bar */}
      <div className="w-96">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-full bg-[#0d1629]/90 border border-slate-700/60 hover:border-cyan-500/50 text-slate-400 hover:text-slate-200 transition-all text-xs shadow-inner"
        >
          <div className="flex items-center space-x-2.5 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Search customers, contracts, invoices, exceptions...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-800/80 rounded border border-slate-700 shrink-0">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right Action Controls */}
      <div className="flex items-center space-x-4">
        {/* Date Range Selector Pill */}
        <button
          onClick={onOpenDateRange}
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#0d1629]/90 border border-slate-700/60 hover:border-cyan-500/50 text-xs font-medium text-slate-300 transition-all"
        >
          <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>{dateRangeLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
        </button>

        {/* Notification Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 rounded-full bg-[#0d1629]/80 border border-slate-700/60 hover:border-slate-600 text-slate-300 hover:text-white transition-all"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#080d19] animate-pulse" />
          )}
        </button>

        {/* Context Help Button */}
        <button
          onClick={onOpenHelp}
          className="p-2 rounded-full bg-[#0d1629]/80 border border-slate-700/60 hover:border-slate-600 text-slate-300 hover:text-white transition-all"
          title="Application Guide"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* User Profile Avatar & Menu */}
        <div className="relative">
          <div
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center space-x-2.5 cursor-pointer pl-1 pr-2 py-1 rounded-full hover:bg-slate-800/40 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-rose-600 to-red-600 border border-rose-400/40 flex items-center justify-center text-xs font-bold text-white shadow-[0_0_10px_rgba(225,29,72,0.4)]">
              PT
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-white leading-tight">Piyush Tandale</span>
              <span className="text-[10px] text-slate-400 leading-tight">Revenue Operations</span>
            </div>
          </div>

          {/* Profile Dropdown */}
          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-2 shadow-2xl shadow-[0_0_20px_rgba(6,182,212,0.15)] z-50">
              <div className="px-3 py-2 border-b border-slate-800">
                <p className="text-xs font-bold text-white">Piyush Tandale</p>
                <p className="text-[10px] text-slate-400">admin@saas-assurance.io</p>
                <span className="inline-block mt-1 px-1.5 py-0.2 text-[9px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-500/30 rounded">
                  Admin Role
                </span>
              </div>
              <div className="py-1 space-y-0.5 text-xs">
                <button
                  onClick={() => setProfileDropdownOpen(false)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-2"
                >
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Account Profile</span>
                </button>
                <button
                  onClick={() => setProfileDropdownOpen(false)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white flex items-center space-x-2"
                >
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span>Role Permissions</span>
                </button>
                <div className="border-t border-slate-800 my-1" />
                <button
                  onClick={() => {
                    localStorage.removeItem('token');
                    window.location.reload();
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-950/30 flex items-center space-x-2"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>Secure Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Global Export Action Button */}
        <button
          onClick={onExportReport}
          className="btn-3d flex items-center space-x-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-medium shadow-[0_0_15px_rgba(225,29,72,0.4)] hover:shadow-[0_0_20px_rgba(225,29,72,0.6)] border border-rose-400/40"
        >
          <Download className="w-3.5 h-3.5 text-white" />
          <span>Export Report</span>
        </button>
      </div>
    </header>
  );
};
