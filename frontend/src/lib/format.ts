/** Formatting helpers. Values come from the API as decimal strings; we only format, never recompute KPIs. */
export type Num = string | number | null | undefined

const toNum = (v: Num) => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : Number(v))

/** Indian digit grouping: ₹1,24,80,000 */
export function inr(v: Num, opts: { decimals?: number; sign?: boolean } = {}): string {
  const n = toNum(v)
  if (n === null || Number.isNaN(n)) return '—'
  const d = opts.decimals ?? (Math.abs(n) % 1 === 0 || Math.abs(n) >= 1000 ? 0 : 2)
  const s = new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(n))
  const sign = n < 0 ? '-' : opts.sign && n > 0 ? '+' : ''
  return `${sign}₹${s}`
}

/** Compact: ₹1.25Cr / ₹8.8L / ₹45K — for chart axes only. */
export function inrCompact(v: Num): string {
  const n = toNum(v)
  if (n === null) return '—'
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(0)}K`
  return `${sign}₹${a.toFixed(0)}`
}

export const num = (v: Num, d = 0) => {
  const n = toNum(v)
  return n === null ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n)
}
export const pct = (v: Num, d = 1) => { const n = toNum(v); return n === null ? '—' : `${n.toFixed(d)}%` }
export const toNumber = (v: Num) => toNum(v) ?? 0

export function date(v?: string | null, withYear = true) {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}
export function dateTime(v?: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const SPECIAL: Record<string, string> = { SMB: 'SMB', MID_MARKET: 'Mid-Market', UPI: 'UPI', AT_RISK: 'At-Risk' }
export const titleCase = (s?: string | null) => SPECIAL[s ?? ''] ?? (s ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
export function relative(v?: string | null) {
  if (!v) return ''
  const s = (Date.now() - new Date(v).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
