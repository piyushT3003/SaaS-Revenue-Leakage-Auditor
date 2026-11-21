import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { AlertTriangle, BarChart3, Cloud, Coins, CreditCard, Download, Expand, Info, Layers, MoreHorizontal, RotateCcw, Send, Sparkles, Target, Users, Zap } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AnimatedValue, Basis, Button, CATEGORY_COLOR, CategoryPill, ChartTip, Delta, Empty, ErrorBox, Modal, Panel, Pill, Sparkline, Spinner, Stagger, StaggerItem } from '@/components/ui'
import { FlipCard } from '@/components/FlipCard'
import { GetStarted } from './GetStarted'
import { PageTitle } from '@/layouts/AppLayout'
import type { RevenueHealth } from '@/layouts/Sidebar'
import { api, type Paged } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { inr, inrCompact, pct, toNumber } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'
import { useCan3D } from '@/lib/webgl'

const Donut3D = lazy(() => import('@/components/three/Donut3D'))

export interface Metric { key: string; label: string; value: string | number | null; unit: string; formula: string; period: string; basis: string; as_of: string; delta: { type: 'pct' | 'pp'; value: string | null } | null; details: Record<string, unknown> }
interface Summary { metrics: Record<string, Metric>; revenue_health: RevenueHealth; as_of: string }
interface TrendMonth { month: string; label: string; billed: string; expected: string | null; invoiced: string | null; leakage: string | null; mrr: string; outstanding: string; active_customers: number; margin_pct: string | null }
interface ExSummary { total: number; by_category: { category: string; label: string; count: number; exposure: string; share_pct: number | null }[] }
interface ExceptionRow { id: number; exception_code: string; category: string; category_label: string; customer: { id: number; name: string } | null; title: string; financial_impact: string; status: string; severity: string }
interface Profitability { segments: { segment: string; label: string; count: number; share_pct: string | null }[]; customers: number }

const KPI: { key: string; icon: typeof Layers; color: string; spark: (t: TrendMonth) => number; link: string; red?: boolean; invert?: boolean }[] = [
  { key: 'mrr', icon: Layers, color: '#4c8dff', spark: (t) => toNumber(t.mrr), link: '/unit-economics' },
  { key: 'revenue_leakage', icon: AlertTriangle, color: '#ef2b45', spark: (t) => toNumber(t.leakage), link: '/exceptions', red: true, invert: true },
  { key: 'outstanding', icon: CreditCard, color: '#4c8dff', spark: (t) => toNumber(t.outstanding), link: '/billing', invert: true },
  { key: 'active_customers', icon: Users, color: '#4c8dff', spark: (t) => t.active_customers, link: '/customers' },
  { key: 'contribution_margin', icon: Coins, color: '#ef2b45', spark: (t) => toNumber(t.margin_pct), link: '/unit-economics' },
]
const TITLES: Record<string, string> = { mrr: 'Total Revenue (MRR)', revenue_leakage: 'Revenue Leakage', outstanding: 'Outstanding Payments', active_customers: 'Active Customers', contribution_margin: 'Contribution Margin' }

export default function OverviewPage() {
  const { period } = usePeriod()
  const { can } = useAuth()
  const nav = useNavigate()
  const p = periodParams(period)
  const summary = useQuery({ queryKey: ['metrics-summary', period], queryFn: () => api.get<Summary>('/metrics/summary', p) })
  const trend = useQuery({ queryKey: ['trend', period.end], queryFn: () => api.get<{ months: TrendMonth[]; basis: string }>('/overview/trend', { end: period.end, months: 6 }) })
  const ex = useQuery({ queryKey: ['exceptions-summary', period], queryFn: () => api.get<ExSummary>('/exceptions/summary', p) })
  const prof = useQuery({ queryKey: ['profitability', period], queryFn: () => api.get<Profitability>('/overview/profitability', p) })
  const [exportOpen, setExportOpen] = useState(false)
  const [defn, setDefn] = useState<Metric | null>(null)
  const [flip, setFlip] = useState<string | null>(null)
  const months = trend.data?.months ?? []

  return (
    <div>
      <PageTitle first="Executive" accent="Overview" subtitle="Contract-to-Cash, Revenue Leakage & Customer Unit Economics"
        actions={can('export') && <Button variant="red" className="px-6 py-3 text-[16px]" onClick={() => setExportOpen(true)}><Download size={20} />Export Report</Button>} />
      <GetStarted />
      {summary.error && <ErrorBox error={summary.error} />}
      {summary.data && !summary.data.revenue_health.period_audit_available && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-4 py-2 text-sm text-[#fcd34d]">
          <Info size={16} /> No completed audit exists for {period.label}. Leakage and reconciliation figures will appear after you run one on the Reconciliation page.
        </div>
      )}
      {summary.data?.revenue_health.freshness.status === 'STALE' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-4 py-2 text-sm text-[#fcd34d]"><Info size={16} />{summary.data.revenue_health.freshness.basis}.</div>
      )}

      <Stagger className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {KPI.map((k) => {
          const m = summary.data?.metrics[k.key]
          const v = m?.value === null || m?.value === undefined ? null : Number(m.value)
          return (
            <StaggerItem key={k.key}>
              <FlipCard flipped={flip === k.key} front={
              <Panel tilt red={k.red} as="div" className="h-full px-4 pb-2 pt-3.5">
                <button className="absolute right-2 top-2 z-10 rounded p-1 text-ink-faint hover:text-ink" aria-label={`How ${TITLES[k.key]} is calculated`} aria-pressed={flip === k.key} onClick={() => m && setFlip(k.key)}><Info size={14} /></button>
                <div role="link" tabIndex={0} onClick={() => nav(k.link)} onKeyDown={(e) => e.key === 'Enter' && nav(k.link)} className="cursor-pointer" title="Open detailed analysis">
                  <div className="flex items-start gap-3">
                    <k.icon size={34} strokeWidth={1.6} style={{ color: k.red ? '#ff4d63' : k.key === 'contribution_margin' ? '#f5a524' : '#4c8dff' }} />
                    <div className="min-w-0">
                      <div className="text-[15px] text-ink">{TITLES[k.key]}</div>
                      <div className="depth-text mt-0.5 text-[27px] font-bold leading-tight tracking-tight">
                        {m ? <AnimatedValue value={v} format={(n) => m.unit === 'CURRENCY' ? inr(n, { decimals: 0 }) : m.unit === 'PERCENT' ? `${n.toFixed(1)}%` : Math.round(n).toLocaleString('en-IN')} /> : '…'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 pl-[2px]">{m && (m.delta ? <Delta value={m.delta.value} type={m.delta.type} invert={k.invert} /> : <span className="text-xs text-ink-faint">{m.value === null ? 'run an audit for this period' : 'no comparison'}</span>)}</div>
                  <Sparkline id={k.key} data={months.map(k.spark)} color={k.color} />
                </div>
              </Panel>} back={
              <Panel red={k.red} as="div" className="flex h-full flex-col px-4 py-3 text-[12px] leading-snug">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink">{TITLES[k.key]}</span>
                  <button className="rounded p-1 text-ink-faint hover:text-ink" aria-label={`Flip ${TITLES[k.key]} back`} onClick={() => setFlip(null)}><RotateCcw size={13} /></button>
                </div>
                {m && <dl className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                  <div><dt className="text-[10.5px] uppercase tracking-wider text-ink-faint">Formula</dt><dd className="line-clamp-3 text-ink">{m.formula}</dd></div>
                  <div><dt className="text-[10.5px] uppercase tracking-wider text-ink-faint">Source</dt><dd className="line-clamp-2 text-ink-muted">{m.basis}</dd></div>
                  <div className="text-ink-faint">{m.period} · as of {m.as_of}</div>
                </dl>}
                <button className="mt-1 self-start text-[11.5px] text-accent-blueSoft hover:underline" onClick={() => m && setDefn(m)}>Full definition</button>
              </Panel>} />
            </StaggerItem>
          )
        })}
      </Stagger>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
        <TrendPanel months={months} loading={trend.isLoading} basis={trend.data?.basis} />
        <ExceptionsDonut data={ex.data} onSelect={(c) => nav(`/exceptions?category=${c}`)} />
        <ProfitabilityPanel data={prof.data} />
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <HighImpact />
        <AssistantCard />
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <Modal open={!!defn} onClose={() => setDefn(null)} title={defn?.label ?? ''}>
        {defn && <dl className="space-y-3 text-sm">
          <div><dt className="text-ink-muted">Formula</dt><dd>{defn.formula}</dd></div>
          <div><dt className="text-ink-muted">Period</dt><dd>{defn.period}</dd></div>
          <div><dt className="text-ink-muted">Basis</dt><dd>{defn.basis}</dd></div>
          <div><dt className="text-ink-muted">As of</dt><dd>{defn.as_of}</dd></div>
        </dl>}
      </Modal>
    </div>
  )
}

function PanelHead({ title, icon, right }: { title: string; icon?: ReactNode; right?: ReactNode }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2.5 whitespace-nowrap text-[19px] font-semibold">{icon}{title}</h2>{right}</div>
}

function TrendPanel({ months, loading, basis }: { months: TrendMonth[]; loading: boolean; basis?: string }) {
  const [big, setBig] = useState(false)
  const rows = months.map((m) => ({ label: m.label, billed: toNumber(m.invoiced ?? m.billed), expected: m.expected === null ? null : toNumber(m.expected), leakage: m.leakage === null ? null : toNumber(m.leakage) }))
  const chart = (h: number) => (
    <ResponsiveContainer width="100%" height={h}>
      <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={4}>
        <defs>
          <linearGradient id="gBilled" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b86ff" /><stop offset="1" stopColor="#123a9c" /></linearGradient>
          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a74ff" stopOpacity={0.9} /><stop offset="1" stopColor="#0d2a74" stopOpacity={0.9} /></linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(120,150,255,0.12)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 13 }} />
        <YAxis yAxisId="l" tickFormatter={inrCompact} tickLine={false} axisLine={false} width={58} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="r" orientation="right" tickFormatter={inrCompact} tickLine={false} axisLine={false} width={50} tick={{ fontSize: 12 }} />
        <Tooltip content={<ChartTip fmt={(v) => inr(v)} />} cursor={{ fill: 'rgba(76,141,255,0.06)' }} />
        <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: 13 }} />
        <Bar yAxisId="l" dataKey="billed" name="Billed Revenue" fill="url(#gBilled)" radius={[3, 3, 0, 0]} maxBarSize={26} />
        <Bar yAxisId="l" dataKey="expected" name="Expected Revenue" fill="url(#gExp)" radius={[3, 3, 0, 0]} maxBarSize={26} />
        <Line yAxisId="r" dataKey="leakage" name="Revenue Leakage" stroke="#ef2b45" strokeWidth={2.5} dot={{ r: 4, fill: '#ef2b45', stroke: '#fff', strokeWidth: 1 }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
  return (
    <Panel className="md:col-span-2 xl:col-span-5 p-4">
      <PanelHead title="Revenue Trend & Leakage" icon={<BarChart3 className="text-accent-red" size={24} />}
        right={<button className="rounded-md border border-panel-border p-1.5 text-ink-muted hover:text-ink" onClick={() => setBig(true)} aria-label="Expand chart"><Expand size={16} /></button>} />
      {loading ? <Spinner /> : chart(212)}
      <Modal open={big} onClose={() => setBig(false)} title="Revenue Trend & Leakage" wide>{chart(420)}{basis && <div className="mt-3"><Basis>{basis}</Basis></div>}</Modal>
    </Panel>
  )
}

function ExceptionsDonut({ data, onSelect }: { data?: ExSummary; onSelect: (c: string) => void }) {
  const cats = (data?.by_category ?? []).filter((c) => c.count > 0)
  const top = [...cats].sort((a, b) => b.count - a.count)
  const shown = top.slice(0, 5)
  const others = top.slice(5)
  const legend = [...shown.map((c) => ({ key: c.category, label: c.label, count: c.count, color: CATEGORY_COLOR[c.category] })),
    ...(others.length ? [{ key: 'OTHERS', label: 'Others', count: others.reduce((s, c) => s + c.count, 0), color: '#818cf8' }] : [])]
  const total = data?.total ?? 0
  const can3D = useCan3D()
  const [hover, setHover] = useState<string | null>(null)
  const hot = legend.find((l) => l.key === hover)
  return (
    <Panel className="xl:col-span-4 p-4">
      <PanelHead title="Billing Exceptions by Type" />
      {!data ? <Spinner /> : total === 0 ? <Empty title="No exceptions in this period" hint="Run an audit to detect billing discrepancies." /> : (
        <div className="flex items-center gap-4">
          <div className="relative h-[200px] w-[200px] shrink-0">
            {can3D ? (
              <Suspense fallback={null}>
                <Donut3D slices={legend} hovered={hover} onHover={setHover} onSelect={(k) => k !== 'OTHERS' && onSelect(k)} className="!absolute !inset-[-14px] !h-[228px] !w-[228px]" />
              </Suspense>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={legend} dataKey="count" nameKey="label" innerRadius={62} outerRadius={92} paddingAngle={1.5} stroke="none"
                    onClick={(d) => d.key !== 'OTHERS' && onSelect(d.key as string)} className="cursor-pointer">
                    {legend.map((l) => <Cell key={l.key} fill={l.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTip fmt={(v) => `${v} exceptions`} />} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              {hot ? <><span className="text-3xl font-bold" style={{ color: hot.color }}>{hot.count}</span><span className="max-w-[96px] text-[12px] leading-tight text-ink-muted">{hot.label}</span></>
                : <><span className="text-4xl font-bold">{total}</span><span className="text-sm text-ink-muted">Exceptions</span></>}
            </div>
          </div>
          <ul className="flex-1 space-y-2.5 text-[14px]">
            {legend.map((l) => (
              <li key={l.key}><button className={cn('flex w-full items-center gap-2.5 text-left hover:text-white', hover === l.key && 'text-white')} onMouseEnter={() => setHover(l.key)} onMouseLeave={() => setHover(null)} onClick={() => l.key !== 'OTHERS' && onSelect(l.key)}>
                <span className="h-3 w-3 rounded-full" style={{ background: l.color }} /><span className="flex-1 text-ink">{l.label}</span>
                <span className="text-ink">{((l.count * 100) / total).toFixed(1)}%</span></button></li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function ProfitabilityPanel({ data }: { data?: Profitability }) {
  const colors: Record<string, string> = { PROFITABLE: '#22c55e', AT_RISK: '#f5a524', UNPROFITABLE: '#ef2b45' }
  const pills: Record<string, string> = { PROFITABLE: 'bg-accent-green/20 text-[#4ade80] ring-accent-green/40', AT_RISK: 'bg-accent-amber/20 text-[#fbbf24] ring-accent-amber/40', UNPROFITABLE: 'bg-accent-red/25 text-[#ff8796] ring-accent-red/50' }
  const nav = useNavigate()
  return (
    <Panel className="xl:col-span-3 p-4">
      <PanelHead title="Customer Profitability" />
      {!data ? <Spinner /> : (
        <>
          <ul className="space-y-1">
            {data.segments.map((s) => (
              <li key={s.segment}>
                <button onClick={() => nav(`/unit-economics?profitability=${s.segment}`)} className="flex w-full items-center gap-2.5 border-b border-panel-line py-3 text-left text-[14.5px] last:border-0 hover:text-white">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[s.segment] }} />
                  <span className="flex-1">{s.label}</span>
                  <span className={cn('chip min-w-[44px] justify-center rounded-md ring-1 font-semibold', pills[s.segment])}>{s.count}</span>
                  <span className="w-14 text-right">{pct(s.share_pct)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex h-4 overflow-hidden rounded-full">
            {data.segments.map((s) => <motion.div key={s.segment} initial={{ width: 0 }} animate={{ width: `${toNumber(s.share_pct)}%` }} transition={{ duration: 1, ease: 'easeOut' }} style={{ background: colors[s.segment] }} />)}
          </div>
          <div className="mt-3"><Basis>Contribution margin ≥ 15% profitable, 0–15% at-risk, below 0% unprofitable</Basis></div>
        </>
      )}
    </Panel>
  )
}

const CHIPS = [
  { key: 'ALL', label: 'All' }, { key: 'UNDERBILLING', label: 'Underbilling' }, { key: 'OVERBILLING', label: 'Overbilling' },
  { key: 'MISSING_CHARGE', label: 'Missing' }, { key: 'OTHERS', label: 'Others' },
]
const ICONS = [Cloud, Zap, Layers, Target]

function HighImpact() {
  const { period } = usePeriod()
  const nav = useNavigate()
  const [chip, setChip] = useState('ALL')
  const ex = useQuery({ queryKey: ['exceptions-summary', period], queryFn: () => api.get<ExSummary>('/exceptions/summary', periodParams(period)) })
  const named = ['UNDERBILLING', 'OVERBILLING', 'MISSING_CHARGE']
  const category = chip === 'ALL' ? undefined : chip === 'OTHERS'
    ? ['OVERBILLING', 'DUPLICATE_INVOICE', 'DISCOUNT_DRIFT', 'PRICING_MISMATCH', 'UNBILLED_USAGE', 'PAYMENT_DISCREPANCY'].filter((c) => !named.includes(c)).join(',') : chip
  const list = useQuery({ queryKey: ['hi-exceptions', period, chip], queryFn: () => api.get<Paged<ExceptionRow>>('/exceptions', { ...periodParams(period), category, sort: '-impact', page_size: 5 }) })
  const count = (k: string) => {
    const cats = ex.data?.by_category ?? []
    if (k === 'ALL') return ex.data?.total ?? 0
    if (k === 'OTHERS') return cats.filter((c) => !named.includes(c.category)).reduce((s, c) => s + c.count, 0)
    return cats.find((c) => c.category === k)?.count ?? 0
  }
  return (
    <Panel className="xl:col-span-8 p-4">
      <PanelHead title="Recent High-Impact Exceptions" icon={<Layers className="text-accent-red" size={24} />}
        right={<div className="flex gap-2">{CHIPS.map((c) => (
          <button key={c.key} onClick={() => setChip(c.key)} className={cn('chip whitespace-nowrap px-3 py-1 text-[12.5px] ring-1', chip === c.key ? 'bg-accent-red text-white ring-accent-red shadow-red' : 'text-ink ring-panel-border hover:ring-accent-blueSoft')}>{c.label} ({count(c.key)})</button>
        ))}</div>} />
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5 bg-white/[0.02]"><th>Customer</th><th>Issue Type</th><th>Description</th><th className="text-right">Financial Impact</th><th>Status</th><th>Action</th><th className="sr-only">More</th></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={7}><Spinner /></td></tr>}
            {list.data?.items.length === 0 && <tr><td colSpan={7}><Empty title="No exceptions for this filter" /></td></tr>}
            {list.data?.items.map((e, i) => {
              const Icon = ICONS[i % ICONS.length]
              return (
                <tr key={e.id} className="row-hover border-b border-panel-line last:border-0 [&>td]:px-3 [&>td]:py-2">
                  <td className="whitespace-nowrap"><span className="flex items-center gap-3"><Icon size={22} className={i % 2 ? 'text-[#fbbf24]' : 'text-accent-blueSoft'} />{e.customer?.name ?? '—'}</span></td>
                  <td><CategoryPill value={e.category} label={e.category_label.replace(/s$/, '')} /></td>
                  <td className="max-w-[300px] truncate text-ink" title={e.title}>{e.title}</td>
                  <td className="text-right font-semibold">{inr(e.financial_impact)}</td>
                  <td><Pill value={e.status} /></td>
                  <td><button onClick={() => nav(`/exceptions?id=${e.id}`)} className={cn('rounded-lg border px-3 py-1 text-[13px] transition', e.status === 'RESOLVED' ? 'border-panel-border text-ink hover:bg-white/5' : 'border-accent-red/70 text-ink hover:bg-accent-red/15')}>{e.status === 'RESOLVED' ? 'View Details' : 'Investigate'}</button></td>
                  <td><button onClick={() => nav(`/exceptions?id=${e.id}`)} aria-label={`More actions for ${e.exception_code}`} className="text-ink-muted hover:text-ink"><MoreHorizontal size={18} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function AssistantCard() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const prompts = [
    { icon: BarChart3, text: 'Why is revenue leakage up this month?' },
    { icon: Users, text: 'Show top 5 underbilled customers' },
    { icon: Target, text: 'Which customers have negative contribution margins?' },
  ]
  const ask = (text: string) => text.trim() && nav(`/ai?q=${encodeURIComponent(text.trim())}`)
  return (
    <Panel red className="xl:col-span-4 flex flex-col p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-[19px] font-semibold"><Sparkles className="text-accent-red" size={24} />AI Investigation Assistant</h2>
        <span className="chip bg-accent-red/20 text-[#ff8796] ring-1 ring-accent-red/50">Beta</span>
      </div>
      <p className="mb-3 text-[14px] text-ink">Ask questions about revenue, billing, customers or anomalies in natural language.</p>
      <div className="space-y-2">
        {prompts.map((pr) => (
          <motion.button key={pr.text} whileHover={{ x: 3 }} onClick={() => ask(pr.text)} className="flex w-full items-center gap-3 rounded-lg border border-panel-border bg-space-900/60 px-3 py-2.5 text-left text-[14px] hover:border-accent-blueSoft/60">
            <pr.icon size={18} className="text-accent-red" />{pr.text}
          </motion.button>
        ))}
      </div>
      <form className="mt-auto pt-3" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
        <div className="flex items-center gap-2 rounded-xl border border-accent-red/70 bg-space-900/70 px-4 py-2.5 shadow-red">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Anything..." className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink" aria-label="Ask the AI assistant" />
          <button type="submit" aria-label="Send question" className="text-ink hover:text-accent-red"><Send size={20} /></button>
        </div>
      </form>
    </Panel>
  )
}

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { period } = usePeriod()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const download = async (fmt: 'pdf' | 'xlsx') => {
    setBusy(fmt); setErr('')
    try {
      const res = await fetch(api.url('/reports/executive', { ...periodParams(period), fmt }), { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `executive_report_${period.start}_${period.end}.${fmt}`
      a.click()
      URL.revokeObjectURL(a.href)
      onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Export failed') } finally { setBusy(null) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Export executive report">
      <p className="mb-4 text-sm text-ink-muted">Generates a report for <b className="text-ink">{period.label}</b> with KPI definitions, all exceptions and the lowest-contribution customers, using the latest completed audit.</p>
      {err && <p className="mb-3 text-sm text-[#ff8796]">{err}</p>}
      <div className="flex gap-3">
        <Button variant="red" loading={busy === 'pdf'} onClick={() => download('pdf')}><Download size={16} />PDF</Button>
        <Button loading={busy === 'xlsx'} onClick={() => download('xlsx')}><Download size={16} />Excel (XLSX)</Button>
      </div>
    </Modal>
  )
}
