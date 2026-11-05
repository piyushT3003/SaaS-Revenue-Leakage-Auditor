import React from 'react';
import { motion } from 'framer-motion';

interface LiquidProgressProps {
  progress: number;
  statusText?: string;
  isProcessing?: boolean;
  className?: string;
}

export const LiquidProgress: React.FC<LiquidProgressProps> = ({
  progress,
  statusText = 'Validating telemetry against schema...',
  isProcessing = true,
  className = '',
}) => {
  const clamped = Math.min(Math.max(progress, 0), 100);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300 flex items-center space-x-2">
          {isProcessing && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />}
          <span>{statusText}</span>
        </span>
        <span className="font-mono font-bold text-cyan-400">{clamped}%</span>
      </div>

      <div className="h-3 w-full bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-slate-700/80 shadow-inner relative">
        <motion.div
          className="h-full rounded-full liquid-shimmer shadow-[0_0_12px_rgba(6,182,212,0.6)] relative"
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* Subtle liquid surface crest glow */}
          <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/60 rounded-full blur-[1px]" />
        </motion.div>
      </div>
    </div>
  );
};
