import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/** Global analytical period (the header date selector). Default: the most recent complete month
 *  that has data — the demo dataset ends in October 2026. */
export interface Period { start: string; end: string; label: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function monthPeriod(year: number, month: number): Period {
  const s = new Date(year, month, 1)
  const e = new Date(year, month + 1, 0)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return { start: iso(s), end: iso(e), label: `${fmt(s)} – ${fmt(e)}` }
}
export function customPeriod(start: string, end: string): Period {
  const fmt = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}

const Ctx = createContext<{ period: Period; setPeriod: (p: Period) => void } | null>(null)

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<Period>(() => {
    try {
      const saved = sessionStorage.getItem('sra.period')
      if (saved) return JSON.parse(saved) as Period
    } catch { /* storage unavailable */ }
    return monthPeriod(2026, 9)
  })
  const value = useMemo(() => ({
    period,
    setPeriod: (p: Period) => {
      setPeriod(p)
      try { sessionStorage.setItem('sra.period', JSON.stringify(p)) } catch { /* ignore */ }
    },
  }), [period])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePeriod() {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePeriod outside PeriodProvider')
  return c
}
/** Query params helper for period-scoped endpoints. */
export const periodParams = (p: Period) => ({ period_start: p.start, period_end: p.end })
