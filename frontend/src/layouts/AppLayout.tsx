import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from '../components/CommandPalette';
import { DateRangeModal } from '../components/DateRangeModal';
import { NotificationDrawer } from '../components/NotificationDrawer';
import { HelpModal } from '../components/HelpModal';
import { api } from '../services/api';

export const AppLayout: React.FC = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  const [dateRange, setDateRange] = useState({
    label: 'Oct 1, 2026 – Oct 31, 2026',
    start: '2026-10-01',
    end: '2026-10-31'
  });

  const [notifications, setNotifications] = useState<any[]>([]);
  const location = useLocation();

  // Load notifications
  const loadNotifications = async () => {
    try {
      const res = await api.getNotifications();
      setNotifications(res.items || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  // Keyboard shortcut Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Determine current page key for Help modal
  const getCurrentPageKey = () => {
    const path = location.pathname.replace('/', '') || 'overview';
    if (path.includes('reconciliation')) return 'reconciliation';
    if (path.includes('exceptions')) return 'exceptions';
    if (path.includes('customers')) return 'customers';
    if (path.includes('billing')) return 'billing';
    if (path.includes('unit-economics')) return 'unit-economics';
    if (path.includes('ai-assistant')) return 'ai';
    if (path.includes('data-management')) return 'data';
    if (path.includes('settings')) return 'settings';
    return 'overview';
  };

  const handleGlobalExport = () => {
    // Triggers direct export download
    window.open(api.exportOverview('pdf'), '_blank');
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col selection:bg-rose-500/30 selection:text-white">
      {/* Fixed Left Sidebar */}
      <Sidebar
        exceptionCount={14}
        revenueHealthScore={92.4}
        revenueHealthTrend="+2.8 pp"
      />

      {/* Fixed Top Header */}
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenDateRange={() => setIsDateRangeOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        onExportReport={handleGlobalExport}
        dateRangeLabel={dateRange.label}
        unreadCount={unreadCount}
      />

      {/* Main Page Scrollable Body */}
      <main className="ml-64 mt-16 p-6 min-h-[calc(100vh-4rem)]">
        <Outlet context={{ dateRange }} />
      </main>

      {/* Global Modals & Drawers */}
      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      <DateRangeModal
        isOpen={isDateRangeOpen}
        onClose={() => setIsDateRangeOpen(false)}
        currentRange={dateRange}
        onApplyRange={setDateRange}
      />

      <NotificationDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onRefresh={loadNotifications}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        pageName={getCurrentPageKey()}
      />
    </div>
  );
};
