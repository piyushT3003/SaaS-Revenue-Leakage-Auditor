import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, CheckCircle2, BookOpen } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageName: string;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, pageName }) => {
  const helpContent: Record<string, { title: string; purpose: string; rules: string[]; tips: string }> = {
    overview: {
      title: 'Executive Overview Guide',
      purpose: 'Provides executive leadership with real-time intelligence across MRR, qualifying revenue leakage, collections, and customer profitability.',
      rules: [
        'Revenue Leakage calculates non-duplicated underbilling exposures from contracts vs invoices.',
        'Revenue Health is an explainable composite score: 35% reconciliation rate, 30% low leakage, 20% collections, 15% data quality.',
        'Clicking any top KPI card drills down into its dedicated analytical page.'
      ],
      tips: 'Use the top date selector to toggle between billing cycles (e.g. October vs September).'
    },
    reconciliation: {
      title: 'Revenue Reconciliation Guide',
      purpose: 'Automated 4-tier engine reconciling active customer contracts, metered usage, invoices, and payments.',
      rules: [
        'Contract vs Usage: Compares contractual allowances with measured product consumption.',
        'Usage vs Invoice: Matches billable units against generated invoice line charges.',
        'Invoice vs Payments: Reconciles collectible balances against bank payments & credit memos.',
        'Reconcile Button: Triggers on-demand reconciliation run and updates audit history.'
      ],
      tips: 'Tolerance of ₹1.00 is applied for fractional rounding differences.'
    },
    exceptions: {
      title: 'Exception Management Guide',
      purpose: 'Investigates and resolves detected financial discrepancies across 8 distinct categories.',
      rules: [
        '8 Categories: Underbilling, Overbilling, Missing Charges, Duplicate Invoices, Discount Drift, Pricing Mismatch, Unbilled Usage, Payment Discrepancies.',
        'Resolving an exception requires a mandatory business justification reason and preserves historical audit trails.',
        'Severity is automatically assigned: Critical (≥₹1L), High (≥₹50k), Medium (≥₹20k), Low (<₹20k).'
      ],
      tips: 'Click "Investigate" on any exception row to open the complete source record and calculation audit drawer.'
    },
    customers: {
      title: 'Customer Intelligence Guide',
      purpose: 'Delivers a 360-degree commercial and financial profile for every customer account in scope.',
      rules: [
        'Health Score: Derived from payment timeliness, exception history, and usage velocity.',
        'Profile Tabs: Retrieve live contracts, active subscriptions, usage history, invoices, payments, and unit economics.'
      ],
      tips: 'Select multiple customers to perform direct profitability and contract comparison.'
    },
    billing: {
      title: 'Billing & Payments Guide',
      purpose: 'Manages invoices, accounts receivable collections, payment allocations, and credit memos.',
      rules: [
        'Draft Invoices: Generated from validated billable usage and active contract versions.',
        'PDF Export: Generates compliant tax invoices with line item breakdowns and bank instructions.',
        'Ageing Analysis: Categorizes receivables by Net-30 due dates (Current, 1-30, 31-60, 61-90, 90+ days).'
      ],
      tips: 'Payments can be recorded and allocated to specific open invoice balances.'
    },
    'unit-economics': {
      title: 'Customer Unit Economics Guide',
      purpose: 'Analyzes customer, product, and segment profitability using verified direct cost allocations.',
      rules: [
        'Contribution Margin % = (Net Revenue - Direct Service Costs) / Net Revenue * 100.',
        'Direct Costs include measured compute/infrastructure telemetry, dedicated support hours, and 3rd party licenses.',
        'Accounts are classified: Profitable (margin ≥20%), At-Risk (0–20%), Unprofitable (<0%).'
      ],
      tips: 'Review the documented allocation methodology in the top right to verify telemetry attribution rules.'
    },
    ai: {
      title: 'AI Investigation Assistant Guide',
      purpose: 'Provides natural-language access to actual database records using read-only analytical tools.',
      rules: [
        'All answers are strictly grounded in live relational database records.',
        'Uses parameterized query tools with strict table allowlists and limits—never executes blind arbitrary SQL.',
        'Provides supporting evidence, affected customer lists, and downloadable investigation reports.'
      ],
      tips: 'Click on any of the suggested question chips to run verified audit queries instantly.'
    },
    data: {
      title: 'Data Management Guide',
      purpose: 'Handles financial dataset ingestion, column mapping, file validation, and sync health.',
      rules: [
        'Supports CSV and XLSX upload with schema validation, type checks, and referential integrity verification.',
        'Import Preview displays accepted vs rejected rows before any database writes occur.',
        'Safe Rollback allows reverting imported batches with full audit logging.'
      ],
      tips: 'Download the sample CSV file to verify expected column headers and formatting.'
    },
    settings: {
      title: 'System Settings Guide',
      purpose: 'Configures workspace preferences, role-based access control, alert thresholds, and security.',
      rules: [
        'RBAC: Admin (full write/manage), Analyst (investigate & resolve), Viewer (read-only).',
        'AI Configuration: Securely persists Google Gemini API credentials in backend environment variables.',
        'Audit Logs: Preserves immutable records of all user actions and configuration changes.'
      ],
      tips: 'Enable reduced motion preference for smooth accessibility transitions.'
    }
  };

  const current = helpContent[pageName.toLowerCase()] || helpContent.overview;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-lg bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl shadow-[0_0_30px_rgba(6,182,212,0.15)] z-10"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">{current.title}</h3>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Purpose</h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{current.purpose}</p>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Operating Rules</h4>
                <ul className="mt-2 space-y-2">
                  {current.rules.map((rule, idx) => (
                    <li key={idx} className="flex items-start text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mr-2 mt-0.5" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20">
                <span className="text-[11px] font-semibold text-cyan-400 block mb-0.5">Pro Tip</span>
                <p className="text-xs text-slate-300 leading-relaxed">{current.tips}</p>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-medium text-white bg-slate-800 hover:bg-slate-700"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
