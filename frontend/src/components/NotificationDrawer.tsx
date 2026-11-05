import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { api } from '../services/api';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: 'Critical' | 'Warning' | 'Info';
  entity_type?: string;
  entity_id?: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onRefresh: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onRefresh,
}) => {
  const navigate = useNavigate();

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      try {
        await api.markNotificationRead(notif.id);
        onRefresh();
      } catch (err) {
        console.error(err);
      }
    }

    if (notif.entity_type === 'Exception' && notif.entity_id) {
      navigate(`/exceptions?id=${notif.entity_id}`);
      onClose();
    } else if (notif.entity_type === 'Reconciliation') {
      navigate('/reconciliation');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%', opacity: 0.8 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-screen max-w-md bg-[#0a0f1d] border-l border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col relative z-10"
            >
              {/* Drawer Header */}
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Application Notifications</h2>
              <p className="text-xs text-slate-400 mt-0.5">Real-time revenue discrepancy & system alerts</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Bar */}
          <div className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {notifications.filter(n => !n.is_read).length} unread alerts
            </span>
            <button
              onClick={handleMarkAllRead}
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
            >
              Mark all as read
            </button>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No active notifications
              </div>
            ) : (
              notifications.map((n) => {
                const isCritical = n.severity === 'Critical';
                const isWarning = n.severity === 'Warning';
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      !n.is_read
                        ? isCritical
                          ? 'bg-rose-950/20 border-rose-500/40'
                          : isWarning
                          ? 'bg-amber-950/20 border-amber-500/40'
                          : 'bg-cyan-950/20 border-cyan-500/40'
                        : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        {isCritical && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                        {isWarning && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                        {!isCritical && !isWarning && <Info className="w-4 h-4 text-cyan-400 shrink-0" />}
                        <h4 className={`text-xs font-semibold ${!n.is_read ? 'text-white' : 'text-slate-300'}`}>
                          {n.title}
                        </h4>
                      </div>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{n.message}</p>
                    <div className="flex items-center justify-between mt-3 text-[10px] text-slate-500">
                      <span>{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {n.entity_id && (
                        <span className="text-cyan-400 hover:underline flex items-center space-x-1">
                          <span>Inspect Record</span>
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </div>
      )}
    </AnimatePresence>
  );
};
