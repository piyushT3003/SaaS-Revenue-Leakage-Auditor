import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from '../components/CommandPalette';
import { DateRangeModal } from '../components/DateRangeModal';
import { NotificationDrawer } from '../components/NotificationDrawer';
import { HelpModal } from '../components/HelpModal';
import { CinematicBackground } from '../components/3d/CinematicBackground';
import { ScrollProgressIndicator } from '../components/3d/ScrollProgressIndicator';
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
  const [openExceptionsCount, setOpenExceptionsCount] = useState(14);
  const [revenueHealthScore, setRevenueHealthScore] = useState(92.4);
  const location = useLocation();

  // Load layout data
  const loadLayoutData = async () => {
    try {
      const [notifs, excRes, overviewRes] = await Promise.all([
        api.getNotifications(),
        api.getExceptions({ status: 'Open' }),
        api.getOverview('2026-10-01', '2026-10-31')
      ]);
      setNotifications(notifs.items || []);
      if (excRes?.metrics?.open_exceptions !== undefined) {
        setOpenExceptionsCount(excRes.metrics.open_exceptions);
      }
      if (overviewRes?.revenue_health_score !== undefined) {
        setRevenueHealthScore(overviewRes.revenue_health_score);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const ensureAuthenticated = async () => {
      const existingToken = localStorage.getItem('token');
      if (!existingToken) {
        try {
          const authRes = await api.login({
            email: 'admin@saas-assurance.io',
            password: 'Admin@123'
          });
          if (authRes.access_token) {
            localStorage.setItem('token', authRes.access_token);
            localStorage.setItem('user', JSON.stringify(authRes.user));
          }
        } catch (err) {
          console.warn('Authentication session init notice:', err);
        }
      }
      loadLayoutData();
    };

    ensureAuthenticated();
  }, [location.pathname]);

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
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col selection:bg-rose-500/30 selection:text-white relative">
      {/* Cinematic 3D Multi-Layer Starfield & Ambient Parallax */}
      <CinematicBackground />
      <ScrollProgressIndicator />

      {/* Fixed Left Sidebar */}
      <Sidebar
        exceptionCount={openExceptionsCount}
        revenueHealthScore={revenueHealthScore}
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
        onRefresh={loadLayoutData}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        pageName={getCurrentPageKey()}
      />
    </div>
  );
};
