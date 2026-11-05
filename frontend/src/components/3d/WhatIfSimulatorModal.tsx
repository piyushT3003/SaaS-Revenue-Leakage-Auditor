import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sliders, TrendingUp, DollarSign, Percent, Shield,
  Save, Play, CheckCircle2, ChevronRight, BarChart3, Bookmark
} from 'lucide-react';
import { api } from '../../services/api';

interface WhatIfSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatIfSimulatorModal: React.FC<WhatIfSimulatorModalProps> = ({
  isOpen,
  onClose
}) => {
  const [scenarioName, setScenarioName] = useState('Pricing Optimization Simulation');
  const [baselinePeriod, setBaselinePeriod] = useState('2026-10');
  const [targetType, setTargetType] = useState('All');
  const [overageMultiplier, setOverageMultiplier] = useState(1.10); // +10%
  const [baseFeeMultiplier, setBaseFeeMultiplier] = useState(1.05); // +5%
  const [tierShiftPct, setTierShiftPct] = useState(0); // 0%
  const [discountCap, setDiscountCap] = useState<number | undefined>(undefined);

  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadSavedScenarios();
      runSimulation();
    }
  }, [isOpen]);

  const loadSavedScenarios = async () => {
    try {
      const list = await api.getWhatIfScenarios();
      setSavedScenarios(list);
    } catch (err) {
      console.error('Failed to load scenarios', err);
    }
  };

  const runSimulation = async (save = false) => {
    setSimulating(true);
    try {
      const res = await api.runWhatIfSimulation({
        name: scenarioName,
        baseline_period: baselinePeriod,
        target_type: targetType,
        overage_rate_multiplier: overageMultiplier,
        base_fee_multiplier: baseFeeMultiplier,
        tier_threshold_adjustment_pct: tierShiftPct,
        discount_cap_percent: discountCap,
        save
      });
      setSimulationResult(res);
      if (save) {
        await loadSavedScenarios();
      }
    } catch (err) {
      console.error('Simulation error', err);
    } finally {
      setSimulating(false);
    }
  };

  const loadScenario = (s: any) => {
    setScenarioName(s.name);
    setBaselinePeriod(s.baseline_period || '2026-10');
    setTargetType(s.target_type || 'All');
    setOverageMultiplier(s.parameters.overage_rate_multiplier || 1.0);
    setBaseFeeMultiplier(s.parameters.base_fee_multiplier || 1.0);
    setTierShiftPct(s.parameters.tier_threshold_adjustment_pct || 0);
    setDiscountCap(s.parameters.discount_cap_percent);
    setSimulationResult(s);
  };

  if (!isOpen) return null;

  const results = simulationResult?.results;

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
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white tracking-wide">
                    What-If Revenue Recovery Simulator
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Non-Mutating Sandbox
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Model financial delta, overage yield, and margin impacts before enacting pricing adjustments
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
            {/* Left Control Sliders */}
            <div className="w-80 md:w-96 p-6 border-r border-slate-800 flex flex-col overflow-y-auto bg-slate-950/30 space-y-5">
              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                  Scenario Label
                </label>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Sliders */}
              <div className="space-y-4 pt-2 border-t border-slate-800">
                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">Overage Rate Multiplier</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {((overageMultiplier - 1) * 100).toFixed(0)}% ({overageMultiplier.toFixed(2)}x)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.70"
                    max="1.50"
                    step="0.05"
                    value={overageMultiplier}
                    onChange={(e) => setOverageMultiplier(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">Base Subscription Fee Shift</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {((baseFeeMultiplier - 1) * 100).toFixed(0)}% ({baseFeeMultiplier.toFixed(2)}x)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.80"
                    max="1.30"
                    step="0.05"
                    value={baseFeeMultiplier}
                    onChange={(e) => setBaseFeeMultiplier(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">Tier Allowance Boundary Shift</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {tierShiftPct > 0 ? '+' : ''}{tierShiftPct}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-20"
                    max="30"
                    step="5"
                    value={tierShiftPct}
                    onChange={(e) => setTierShiftPct(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-300 font-medium">Discount Ceiling Cap</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {discountCap !== undefined ? `${discountCap}%` : 'Uncapped'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDiscountCap(discountCap === undefined ? 15 : undefined)}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        discountCap === undefined ? 'bg-slate-800 text-slate-400' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {discountCap === undefined ? 'Enable Cap' : 'Cap at 15%'}
                    </button>
                    {discountCap !== undefined && (
                      <input
                        type="range"
                        min="5"
                        max="25"
                        step="5"
                        value={discountCap}
                        onChange={(e) => setDiscountCap(parseInt(e.target.value))}
                        className="flex-1 accent-emerald-500 cursor-pointer"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <button
                  onClick={() => runSimulation(false)}
                  disabled={simulating}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{simulating ? 'Calculating...' : 'Recalculate Model'}</span>
                </button>
                <button
                  onClick={() => runSimulation(true)}
                  disabled={simulating}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Scenario for Board Pack</span>
                </button>
              </div>

              {/* Saved Scenarios List */}
              {savedScenarios.length > 0 && (
                <div className="pt-3 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Saved Scenarios</span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {savedScenarios.map(s => (
                      <div
                        key={s.id}
                        onClick={() => loadScenario(s)}
                        className="p-2 rounded bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 cursor-pointer flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-200 font-medium truncate">{s.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Simulation Results & Visualizations */}
            <div className="flex-1 p-6 flex flex-col overflow-y-auto bg-slate-950/20 space-y-6">
              {results ? (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md">
                      <span className="text-xs text-slate-400">Baseline Revenue</span>
                      <div className="text-lg font-bold text-white mt-1">
                        ₹{results.baseline_total_revenue.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-slate-500">Period {baselinePeriod}</span>
                    </div>

                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md">
                      <span className="text-xs text-slate-400">Projected Simulated</span>
                      <div className="text-lg font-bold text-emerald-400 mt-1">
                        ₹{results.simulated_total_revenue.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-emerald-400/80">
                        {results.pct_change > 0 ? '+' : ''}{results.pct_change}% shift
                      </span>
                    </div>

                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md">
                      <span className="text-xs text-slate-400">Net Delta Recovery</span>
                      <div className="text-lg font-bold text-emerald-300 mt-1">
                        {results.net_revenue_delta >= 0 ? '+' : ''}₹{results.net_revenue_delta.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {results.customers_impacted} accounts affected
                      </span>
                    </div>

                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md">
                      <span className="text-xs text-slate-400">Annualized Run-Rate (ARR)</span>
                      <div className="text-lg font-bold text-blue-400 mt-1">
                        ₹{results.projected_annualized_run_rate.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-blue-400/80">Projected portfolio total</span>
                    </div>
                  </div>

                  {/* Tier Distribution Cards */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                      Segment & Customer Tier Impact Breakdown
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      {results.tier_breakdown?.map((tier: any) => (
                        <div
                          key={tier.tier}
                          className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-white text-sm">{tier.tier}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                {tier.customers_count} accounts
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-2 space-y-1">
                              <div className="flex justify-between">
                                <span>Baseline:</span>
                                <span className="font-mono text-slate-300">₹{tier.baseline_revenue.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Simulated:</span>
                                <span className="font-mono text-emerald-400">₹{tier.simulated_revenue.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center">
                            <span className="text-xs text-slate-400">Net Delta:</span>
                            <span className={`font-mono text-xs font-bold ${
                              tier.net_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {tier.net_delta >= 0 ? '+' : ''}₹{tier.net_delta.toLocaleString()} ({tier.pct_change}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Customer Breakdown Table */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 font-semibold text-xs text-slate-200">
                      Top Impacted Accounts (Simulated Variance)
                    </div>
                    <div className="overflow-x-auto max-h-56">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                          <tr>
                            <th className="px-4 py-2">Customer Account</th>
                            <th className="px-4 py-2">Segment</th>
                            <th className="px-4 py-2">Baseline</th>
                            <th className="px-4 py-2">Simulated</th>
                            <th className="px-4 py-2">Delta</th>
                            <th className="px-4 py-2">Shift %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {results.customer_breakdown?.map((cust: any) => (
                            <tr key={cust.customer_id} className="hover:bg-slate-800/40">
                              <td className="px-4 py-2 font-medium text-white">{cust.customer_name}</td>
                              <td className="px-4 py-2 text-slate-400">{cust.segment}</td>
                              <td className="px-4 py-2 font-mono text-slate-300">₹{cust.baseline_revenue.toLocaleString()}</td>
                              <td className="px-4 py-2 font-mono text-emerald-400">₹{cust.simulated_revenue.toLocaleString()}</td>
                              <td className="px-4 py-2 font-mono text-emerald-300 font-medium">
                                {cust.net_delta >= 0 ? '+' : ''}₹{cust.net_delta.toLocaleString()}
                              </td>
                              <td className="px-4 py-2 font-mono text-slate-400">{cust.pct_change}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <BarChart3 className="w-12 h-12 text-slate-600 mb-2" />
                  <span>Adjust parameters on the left to simulate revenue changes</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
