import React, { useState } from 'react';
import { Calendar, X, Check } from 'lucide-react';

interface DateRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRange: { label: string; start: string; end: string };
  onApplyRange: (range: { label: string; start: string; end: string }) => void;
}

export const DateRangeModal: React.FC<DateRangeModalProps> = ({
  isOpen,
  onClose,
  currentRange,
  onApplyRange,
}) => {
  const [selectedPreset, setSelectedPreset] = useState(currentRange.label);
  const [customStart, setCustomStart] = useState(currentRange.start);
  const [customEnd, setCustomEnd] = useState(currentRange.end);

  const presets = [
    { label: 'Oct 1, 2026 – Oct 31, 2026', start: '2026-10-01', end: '2026-10-31' },
    { label: 'Sep 1, 2026 – Sep 30, 2026', start: '2026-09-01', end: '2026-09-30' },
    { label: 'Q3 2026 (Jul 1 – Sep 30)', start: '2026-07-01', end: '2026-09-30' },
    { label: 'YTD 2026 (Jan 1 – Oct 31)', start: '2026-01-01', end: '2026-10-31' },
    { label: 'Full Year 2026', start: '2026-01-01', end: '2026-12-31' }
  ];

  const handleApply = () => {
    if (selectedPreset === 'Custom') {
      onApplyRange({
        label: `${customStart} – ${customEnd}`,
        start: customStart,
        end: customEnd
      });
    } else {
      const p = presets.find(x => x.label === selectedPreset);
      if (p) onApplyRange(p);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#0d1629] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl shadow-[0_0_30px_rgba(6,182,212,0.15)]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Select Reporting Period</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets List */}
        <div className="py-4 space-y-2">
          {presets.map((p) => {
            const isSelected = selectedPreset === p.label;
            return (
              <button
                key={p.label}
                onClick={() => setSelectedPreset(p.label)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-950/70 to-blue-950/70 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-300 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <span>{p.label}</span>
                {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
              </button>
            );
          })}
        </div>

        {/* Custom Range option */}
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Custom Date Range</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">Start Date</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => {
                  setCustomStart(e.target.value);
                  setSelectedPreset('Custom');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">End Date</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => {
                  setCustomEnd(e.target.value);
                  setSelectedPreset('Custom');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
          >
            Apply Period
          </button>
        </div>
      </div>
    </div>
  );
};
