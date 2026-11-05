import React, { useState, useEffect } from 'react';
import {
  Settings, Users, ShieldAlert, Sparkles, Eye, EyeOff, Save,
  CheckCircle2, AlertTriangle, RefreshCw, Plus, Clock, Key,
  Sliders, ShieldCheck, UserCheck, Monitor, HelpCircle
} from 'lucide-react';
import { api } from '../../services/api';
import { PageTransition } from '../../components/3d/PageTransition';
import { Interactive3DCard } from '../../components/3d/Interactive3DCard';
import { MagneticButton } from '../../components/3d/MagneticButton';
import { StaggeredContainer } from '../../components/3d/StaggeredContainer';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'rbac' | 'thresholds' | 'ai' | 'accessibility' | 'audit'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Settings State
  const [settingsData, setSettingsData] = useState<any>({
    company_name: 'SaaS Assurance Corp',
    currency_symbol: '₹',
    financial_year_start: 'April',
    indian_number_format: true,
    underbilling_threshold: 5000,
    overbilling_threshold: 5000,
    pricing_mismatch_pct: 5.0,
    critical_exposure_threshold: 100000,
    gemini_model: 'gemini-1.5-pro',
    gemini_api_key_configured: false
  });

  // Users State
  const [users, setUsers] = useState<any[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: '',
    email: '',
    role: 'Financial Analyst',
    password: ''
  });

  // AI Key state
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: ''
  });

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Accessibility State
  const [reducedMotion, setReducedMotion] = useState(() => {
    return localStorage.getItem('saas_reduced_motion') === 'true';
  });
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('saas_high_contrast') === 'true';
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [sRes, uRes, aRes] = await Promise.all([
        api.getSettings(),
        api.getUsers(),
        api.getAuditLogs()
      ]);
      if (sRes) setSettingsData(sRes);
      if (uRes) setUsers(uRes);
      if (aRes) setAuditLogs(aRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const payload = { ...settingsData };
      if (geminiKeyInput.trim()) {
        payload.gemini_api_key = geminiKeyInput.trim();
      }
      await api.updateSettings(payload);
      setSaveSuccess(true);
      setGeminiKeyInput('');
      await loadSettings();
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.full_name || !newUser.email || !newUser.password) {
      alert('Please fill out all user fields');
      return;
    }
    try {
      await api.createUser(newUser);
      setShowAddUserModal(false);
      setNewUser({ full_name: '', email: '', role: 'Financial Analyst', password: '' });
      const uRes = await api.getUsers();
      setUsers(uRes);
    } catch (err: any) {
      alert(err.message || 'Failed to create user');
    }
  };

  const handleTestAI = async () => {
    const keyToTest = geminiKeyInput.trim() || 'configured';
    setAiTestResult({ status: 'testing', message: 'Pinging Google Gemini API endpoint...' });
    try {
      const res = await api.testAIConnection(keyToTest);
      if (res.status === 'success') {
        setAiTestResult({ status: 'success', message: res.message });
      } else {
        setAiTestResult({ status: 'error', message: res.message || 'Test failed' });
      }
    } catch (err: any) {
      setAiTestResult({ status: 'error', message: err.message || 'Network error pinging AI endpoint' });
    }
  };

  const toggleReducedMotion = (val: boolean) => {
    setReducedMotion(val);
    localStorage.setItem('saas_reduced_motion', String(val));
    if (val) {
      document.documentElement.classList.add('reduce-motion');
    } else {
      document.documentElement.classList.remove('reduce-motion');
    }
  };

  const toggleHighContrast = (val: boolean) => {
    setHighContrast(val);
    localStorage.setItem('saas_high_contrast', String(val));
    if (val) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  };

  if (loading && !users.length) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-80 bg-slate-800/60 rounded-xl" />
        <div className="h-96 bg-slate-800/40 rounded-2xl border border-slate-700/40" />
      </div>
    );
  }

  return (
    <PageTransition className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 volumetric-glow">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>System</span>
            <span className="text-cyan-400">Settings</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Application preferences, role-based access control, anomaly sensitivity, AI integration &amp; audit trails
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {saveSuccess && (
            <div className="flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/50 px-3 py-1.5 rounded-xl hologram-glow animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Settings Saved</span>
            </div>
          )}
          <MagneticButton
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 transition-all shadow-sm"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save Configuration</span>
          </MagneticButton>
        </div>
      </div>

      {/* HORIZONTAL TAB SELECTOR */}
      <div className="flex items-center space-x-1 border-b border-slate-800 overflow-x-auto pb-1">
        {[
          { id: 'general', label: 'General & Currency', icon: Sliders },
          { id: 'rbac', label: 'Users & RBAC', icon: Users },
          { id: 'thresholds', label: 'Leakage Thresholds', icon: ShieldAlert },
          { id: 'ai', label: 'AI & Gemini API', icon: Sparkles },
          { id: 'accessibility', label: 'Accessibility & Display', icon: Monitor },
          { id: 'audit', label: 'Audit Trail', icon: Clock }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap btn-3d ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT 1: GENERAL & CURRENCY */}
      {activeTab === 'general' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 max-w-3xl">
          <div>
            <h2 className="text-sm font-bold text-white mb-1">Company &amp; Financial Year Parameters</h2>
            <p className="text-xs text-slate-400">Configure core fiscal calendars and accounting representation conventions</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Organization Name</label>
              <input
                type="text"
                value={settingsData.company_name || ''}
                onChange={(e) => setSettingsData({ ...settingsData, company_name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Financial Year Start</label>
              <select
                value={settingsData.financial_year_start || 'April'}
                onChange={(e) => setSettingsData({ ...settingsData, financial_year_start: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="April">April 1st (Indian / UK Fiscal Standard)</option>
                <option value="January">January 1st (Calendar Year)</option>
                <option value="July">July 1st (Australian Standard)</option>
                <option value="October">October 1st (US Federal Standard)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Currency Symbol</label>
              <input
                type="text"
                value={settingsData.currency_symbol || '₹'}
                onChange={(e) => setSettingsData({ ...settingsData, currency_symbol: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 mt-5">
              <div>
                <span className="text-xs font-semibold text-white block">Indian Numbering System</span>
                <span className="text-[10px] text-slate-400">Display Lakhs (₹1,00,000) &amp; Crores (₹1,00,00,000)</span>
              </div>
              <input
                type="checkbox"
                checked={settingsData.indian_number_format !== false}
                onChange={(e) => setSettingsData({ ...settingsData, indian_number_format: e.target.checked })}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: RBAC & SYSTEM USERS */}
      {activeTab === 'rbac' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white mb-1">Role-Based Access Control (RBAC)</h2>
              <p className="text-xs text-slate-400">Manage organizational members, permission sets, and auditor privileges</p>
            </div>

            <button
              onClick={() => setShowAddUserModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors btn-3d"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Member</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-[11px] text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id} className="table-row-hover hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-white flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-[10px] font-bold flex items-center justify-center">
                        {u.full_name?.slice(0, 2).toUpperCase()}
                      </div>
                      <span>{u.full_name}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{u.email}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.role === 'Admin' ? 'bg-purple-950/40 text-purple-300 border border-purple-800/40' :
                        u.role === 'Auditor' ? 'bg-cyan-950/40 text-cyan-400 border border-cyan-800/40' :
                        'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-emerald-400 text-[11px] font-medium flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Active</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px] font-mono">{u.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: REVENUE LEAKAGE THRESHOLDS */}
      {activeTab === 'thresholds' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 max-w-3xl">
          <div>
            <h2 className="text-sm font-bold text-white mb-1">Financial Anomaly Detection Sensitivity</h2>
            <p className="text-xs text-slate-400">Calibrate variance tolerances before an automated exception ticket is generated</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Interactive3DCard className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <label className="text-xs font-semibold text-white block mb-1">Underbilling Sensitivity Threshold (₹)</label>
                <p className="text-[10px] text-slate-400 mb-2">Discrepancies exceeding this amount automatically open high-priority exceptions</p>
                <input
                  type="number"
                  value={settingsData.underbilling_threshold || 5000}
                  onChange={(e) => setSettingsData({ ...settingsData, underbilling_threshold: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </Interactive3DCard>

              <Interactive3DCard className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <label className="text-xs font-semibold text-white block mb-1">Overbilling Tolerance Threshold (₹)</label>
                <p className="text-[10px] text-slate-400 mb-2">Triggers billing discrepancy alerts to avoid customer churn and disputes</p>
                <input
                  type="number"
                  value={settingsData.overbilling_threshold || 5000}
                  onChange={(e) => setSettingsData({ ...settingsData, overbilling_threshold: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </Interactive3DCard>

              <Interactive3DCard className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <label className="text-xs font-semibold text-white block mb-1">Pricing Mismatch Tolerance (%)</label>
                <p className="text-[10px] text-slate-400 mb-2">Percentage difference between contract price schedule and invoiced line items</p>
                <input
                  type="number"
                  step="0.1"
                  value={settingsData.pricing_mismatch_pct || 5.0}
                  onChange={(e) => setSettingsData({ ...settingsData, pricing_mismatch_pct: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </Interactive3DCard>

              <Interactive3DCard className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <label className="text-xs font-semibold text-white block mb-1">Critical Severity Exposure Limit (₹)</label>
                <p className="text-[10px] text-slate-400 mb-2">Exceptions above this threshold escalate to C-suite executive dashboard alerts</p>
                <input
                  type="number"
                  value={settingsData.critical_exposure_threshold || 100000}
                  onChange={(e) => setSettingsData({ ...settingsData, critical_exposure_threshold: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </Interactive3DCard>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: AI & GEMINI API INTEGRATION */}
      {activeTab === 'ai' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 max-w-3xl">
          <div>
            <h2 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Google Gemini AI Engine Integration</span>
            </h2>
            <p className="text-xs text-slate-400">
              Configure LLM inference for natural-language root cause explanations and investigation summaries
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Active AI Model</label>
              <select
                value={settingsData.gemini_model || 'gemini-1.5-pro'}
                onChange={(e) => setSettingsData({ ...settingsData, gemini_model: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Recommended: Complex financial reasoning &amp; multi-source auditing)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Ultra-low latency inference)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Gemini API Key
                {settingsData.gemini_api_key_configured && (
                  <span className="text-[10px] text-emerald-400 ml-2 font-normal">✓ Key configured in environment</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder={settingsData.gemini_api_key_configured ? '••••••••••••••••••••••••' : 'Enter AIzaSy... API key'}
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-20 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                API keys are stored encrypted. The AI assistant uses controlled, read-only analytical queries and never executes arbitrary SQL.
              </p>
            </div>

            <div className="pt-2 flex items-center space-x-3">
              <button
                type="button"
                onClick={handleTestAI}
                disabled={aiTestResult.status === 'testing'}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-cyan-400 bg-cyan-950/50 border border-cyan-800/50 hover:bg-cyan-900/50 transition-colors flex items-center space-x-1.5 btn-3d"
              >
                {aiTestResult.status === 'testing' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Testing Connection...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Test API Connectivity</span>
                  </>
                )}
              </button>

              {aiTestResult.status === 'success' && (
                <span className="text-xs text-emerald-400 flex items-center space-x-1 animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{aiTestResult.message}</span>
                </span>
              )}
              {aiTestResult.status === 'error' && (
                <span className="text-xs text-rose-400 flex items-center space-x-1 animate-in fade-in">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{aiTestResult.message}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: ACCESSIBILITY & DISPLAY */}
      {activeTab === 'accessibility' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 max-w-2xl">
          <div>
            <h2 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
              <Monitor className="w-4 h-4 text-cyan-400" />
              <span>Accessibility &amp; Display Preferences</span>
            </h2>
            <p className="text-xs text-slate-400">
              Customize motion, animations, and high-contrast border styling
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div>
                <span className="text-xs font-semibold text-white block">Reduced Motion</span>
                <span className="text-[11px] text-slate-400">
                  Minimizes 3D perspective shifts, floating effects, and page transitions for vestibular comfort
                </span>
              </div>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => toggleReducedMotion(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div>
                <span className="text-xs font-semibold text-white block">High Contrast Borders</span>
                <span className="text-[11px] text-slate-400">
                  Increases opacity of glassmorphic card edges and chart gridlines for visual clarity
                </span>
              </div>
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => toggleHighContrast(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 6: AUDIT TRAIL LOGS */}
      {activeTab === 'audit' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Immutable System Audit Trail</span>
            </h2>
            <p className="text-xs text-slate-400">
              Complete chronological record of all financial investigations, status updates, batch imports, and manual adjustments
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-[11px] text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity Type</th>
                  <th className="py-2.5 px-3">Entity ID</th>
                  <th className="py-2.5 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="table-row-hover hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-[11px] text-slate-400 font-mono">
                      {log.created_at?.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-white">{log.user_id}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950/40 text-cyan-300 border border-cyan-800/40">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{log.entity_type}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-cyan-400">{log.entity_id}</td>
                    <td className="py-2.5 px-3 text-slate-300 truncate max-w-xs">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel max-w-md w-full p-6 rounded-2xl border border-cyan-500/30 relative">
            <h3 className="text-base font-bold text-white mb-1">Add System User</h3>
            <p className="text-xs text-slate-400 mb-4">Grant access to financial analytics and auditing tools</p>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Role &amp; Permissions</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Admin">Admin (Full administrative &amp; configuration access)</option>
                  <option value="Financial Analyst">Financial Analyst (Reconciliation, metrics &amp; unit economics)</option>
                  <option value="Auditor">Auditor (Read-only exception &amp; compliance review)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800 transition-colors btn-3d"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors btn-3d"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageTransition>
  );
};
