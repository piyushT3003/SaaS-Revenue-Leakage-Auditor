import React, { useEffect, useState, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  formatAsCurrency?: boolean;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  durationMs?: number;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  formatAsCurrency = false,
  prefix = '',
  suffix = '',
  decimals,
  durationMs = 800,
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState<number>(value);
  const prevValueRef = useRef<number>(value);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    prevValueRef.current = value;

    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      ((typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('saas_reduced_motion') === 'true'));

    if (reducedMotion) {
      setDisplayValue(endValue);
      return;
    }

    let startTime: number | null = null;
    let animId: number;

    const easeOutExpo = (t: number): number => {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    };

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / durationMs, 1);
      const easedProgress = easeOutExpo(progress);

      const current = startValue + (endValue - startValue) * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [value, durationMs]);

  const formatted = formatAsCurrency
    ? Math.round(displayValue).toLocaleString('en-IN')
    : decimals !== undefined
    ? displayValue.toFixed(decimals)
    : displayValue % 1 === 0
    ? displayValue.toLocaleString('en-IN')
    : displayValue.toFixed(1);

  return (
    <span className={`inline-block tabular-nums font-bold ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};
