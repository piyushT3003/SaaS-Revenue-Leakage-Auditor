import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Beaker, Play, CheckCircle2, AlertTriangle, XCircle,
  FileCode, Check, ShieldCheck, ChevronRight
} from 'lucide-react';
import { api } from '../../services/api';

interface BillingRulesLabModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BillingRulesLabModal: React.FC<BillingRulesLabModalProps> = ({
  isOpen,
  onClose
}) => {
  const [proposals, setProposals] = useState<any[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<any | null>(null);
  const [testing, setTesting] = useState(false);
  const [ruleTitle, setRuleTitle] = useState('API Calls Tier 2 Allowance Expansion');
  const [description, setDescription] = useState('Increase Tier 1 threshold from 50k to 60k and reduce overage rate to $0.045');
  const [testPeriod, setTestPeriod] = useState('2026-10');
  const [tierThreshold, setTierThreshold] = useState(60000);
  const [overageRate, setOverageRate] = useState(0.045);
  const [baseDiscount, setBaseDiscount] = useState(5.0);

  useEffect(() => {
    if (isOpen) {
      loadProposals();
    }
  }, [isOpen]);

  const loadProposals = async () => {
    try {
      const list = await api.getBillingRuleProposals();
      setProposals(list);
      if (list.length > 0) {
        const full = await api.getBillingRuleProposal(list[0].id);
        setSelectedProposal(full);
      }
    } catch (err) {
      console.error('Failed to load proposals', err);
    }
  };

  const handleRunRegressionTest = async () => {
    setTesting(true);
    try {
      const res = await api.testBillingRuleProposal({
        title: ruleTitle,
        description,
        test_period: testPeriod,
        proposed_rule: {
          tier_threshold_units: tierThreshold,
          overage_rate: overageRate,
          base_fee_discount_pct: baseDiscount
        }
      });
      setSelectedProposal(res);
      await loadProposals();
    } catch (err) {
      console.error('Regression test failed', err);
    } finally {
      setTesting(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedProposal) return;
    try {
      await api.reviewBillingRuleProposal(selectedProposal.id, 'Approved', 'Verified through automated regression lab.');
      const updated = await api.getBillingRuleProposal(selectedProposal.id);
      setSelectedProposal(updated);
      await loadProposals();
    } catch (err) {
      console.error('Review failed', err);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-6xl h-[88vh] bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Beaker className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white tracking-wide">
                    Billing Rules Regression Testing Lab
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Pre-Deployment Sandbox
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Simulate and assert contract pricing rules against historical datasets with pass/fail validation
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Layout */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Proposal Configuration */}
            <div className="w-80 md:w-96 p-6 border-r border-slate-800 flex flex-col overflow-y-auto bg-slate-950/30 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Rule Title
                </label>
                <input
                  type="text"
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Audit Test Period
                </label>
                <select
                  value={testPeriod}
                  onChange={(e) => setTestPeriod(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-white"
                >
                  <option value="2026-10">October 2026 (2026-10)</option>
                  <option value="2026-09">September 2026 (2026-09)</option>
                  <option value="2026-08">August 2026 (2026-08)</option>
                </select>
              </div>

              {/* Proposed parameters */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block">
                  Proposed Rule Parameters
                </span>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">
                    Tier 1 Included Units ({tierThreshold.toLocaleString()})
                  </label>
                  <input
                    type="range"
                    min="30000"
                    max="100000"
                    step="5000"
                    value={tierThreshold}
                    onChange={(e) => setTierThreshold(parseInt(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">
                    Overage Unit Rate (₹{overageRate.toFixed(3)})
                  </label>
                  <input
                    type="range"
                    min="0.02"
                    max="0.08"
                    step="0.005"
                    value={overageRate}
                    onChange={(e) => setOverageRate(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">
                    Base Fee Concession Discount ({baseDiscount}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={baseDiscount}
                    onChange={(e) => setBaseDiscount(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-2">
                <button
                  onClick={handleRunRegressionTest}
                  disabled={testing}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{testing ? 'Executing Regression Suite...' : 'Run Regression Test'}</span>
                </button>

                {selectedProposal && selectedProposal.status !== 'Approved' && (
                  <button
                    onClick={handleApprove}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve Rule for Deployment</span>
                  </button>
                )}
              </div>

              {/* History list */}
              {proposals.length > 0 && (
                <div className="pt-3 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Proposals Log
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {proposals.map(p => (
                      <div
                        key={p.id}
                        onClick={async () => {
                          const full = await api.getBillingRuleProposal(p.id);
                          setSelectedProposal(full);
                        }}
                        className="p-2 rounded bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 cursor-pointer flex justify-between items-center text-xs"
                      >
                        <span className="text-slate-200 truncate">{p.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                          p.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Regression Output Canvas */}
            <div className="flex-1 p-6 flex flex-col overflow-y-auto bg-slate-950/20 space-y-6">
              {selectedProposal ? (
                <>
                  {/* Results Metrics */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Test Cases Evaluated</span>
                      <div className="text-xl font-bold text-white mt-1">
                        {selectedProposal.test_customers_count} Accounts
                      </div>
                      <span className="text-[10px] text-slate-500">Historical validation dataset</span>
                    </div>

                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Passed Asserts</span>
                      <div className="text-xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span>{selectedProposal.tests_passed}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">Within expected tolerances</span>
                    </div>

                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Warnings / Volatility</span>
                      <div className="text-xl font-bold text-amber-400 mt-1 flex items-center gap-1.5">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        <span>{selectedProposal.tests_warning}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">&gt;20% deviation</span>
                    </div>

                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400">Net Portfolio Shift</span>
                      <div className={`text-xl font-bold mt-1 ${
                        selectedProposal.net_financial_difference >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {selectedProposal.net_financial_difference >= 0 ? '+' : ''}₹{selectedProposal.net_financial_difference.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-slate-500">Total simulated variance</span>
                    </div>
                  </div>

                  {/* Customer line-by-line regression results */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                    <div className="px-4 py-3 border-b border-slate-800 font-semibold text-xs text-slate-200">
                      Regression Test Outcomes by Customer ({selectedProposal.detailed_results?.length || 0})
                    </div>
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                          <tr>
                            <th className="px-4 py-2.5">Customer</th>
                            <th className="px-4 py-2.5">Usage</th>
                            <th className="px-4 py-2.5">Baseline</th>
                            <th className="px-4 py-2.5">Proposed</th>
                            <th className="px-4 py-2.5">Net Diff</th>
                            <th className="px-4 py-2.5">Result</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {selectedProposal.detailed_results?.map((r: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-850/40">
                              <td className="px-4 py-2.5 font-medium text-white">{r.customer_name}</td>
                              <td className="px-4 py-2.5 font-mono text-slate-400">{r.usage_units.toLocaleString()}</td>
                              <td className="px-4 py-2.5 font-mono text-slate-300">₹{r.baseline_charge.toLocaleString()}</td>
                              <td className="px-4 py-2.5 font-mono text-indigo-400">₹{r.proposed_charge.toLocaleString()}</td>
                              <td className="px-4 py-2.5 font-mono text-slate-200">
                                {r.net_difference >= 0 ? '+' : ''}₹{r.net_difference.toLocaleString()} ({r.pct_change}%)
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.status === 'Passed'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : r.status === 'Warning'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <Beaker className="w-12 h-12 text-slate-600 mb-2" />
                  <span>Configure rule parameters and run regression testing</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
