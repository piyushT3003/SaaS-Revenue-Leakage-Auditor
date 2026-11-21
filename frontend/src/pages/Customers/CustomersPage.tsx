import { useQuery } from '@tanstack/react-query'
import { GitCompare, Rocket, Search, TrendingDown, UserPlus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { AnimatedValue, Basis, Button, ChartTip, Empty, Modal, Pager, Panel, Pill, Select, Spinner } from '@/components/ui'
import { PageTitle } from '@/layouts/AppLayout'
import { CustomerGalaxyPanel } from './CustomerGalaxyPanel'
import { api, type Paged } from '@/lib/api'
import { cn } from '@/lib/cn'
import { inr, pct, titleCase } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'

export interface CustomerRow {
  id: number; code: string; name: string; segment: string; status: string; region: string; industry: string; account_owner: string
  mrr: string; net_revenue: string; direct_cost: string; contribution: string; margin_pct: string | null; profitability: string
  outstanding: string; open_exceptions: number; plans: string[]; at_risk: boolean; risk_reasons: string[]; expansion_opportunity: boolean; expansion_reason: string
}
interface Summary { total_customers: number; new_customers: number; at_risk_customers: number; expansion_opportunities: number; by_segment: { segment: string; count: number; share_pct: string | null }[]; top_by_revenue: { id: number; name: string; net_revenue: string }[]; definitions: Record<string, string> }
const SEG_COLORS: Record<string, string> = { ENTERPRISE: '#ef2b45', MID_MARKET: '#2f7bff', SMB: '#22d3ee' }

export default function CustomersPage() {
  const { period } = usePeriod()
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [plan, setPlan] = useState('')
  const [risk, setRisk] = useState('')
  const [sort, setSort] = useState('-net_revenue')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<number[]>([])
  const [compare, setCompare] = useState(false)
  useEffect(() => setPage(1), [search, segment, status, plan, risk, sort, period])
  const summary = useQuery({ queryKey: ['cust-summary', period], queryFn: () => api.get<Summary>('/customers/summary', periodParams(period)) })
  const list = useQuery({ queryKey: ['customers', period, search, segment, status, plan, risk, sort, page],
    queryFn: () => api.get<Paged<CustomerRow>>('/customers', { ...periodParams(period), search, segment, status, plan, risk: risk || undefined, sort, page, page_size: 15 }) })
  const s = summary.data
  const stat = [
    { label: 'Total Customers', value: s?.total_customers, icon: Users, color: 'text-accent-blueSoft', onClick: () => setRisk('') },
    { label: 'New (This Period)', value: s?.new_customers, icon: UserPlus, color: 'text-accent-cyan' },
    { label: 'At-Risk', value: s?.at_risk_customers, icon: TrendingDown, color: 'text-accent-red', onClick: () => setRisk('true') },
    { label: 'Expansion Opportunity', value: s?.expansion_opportunities, icon: Rocket, color: 'text-accent-amber' },
  ]
  return (
    <div>
      <PageTitle first="Customer" accent="Intelligence" subtitle="Customer health, revenue contribution and subscription insights"
        actions={<Button disabled={picked.length < 2} onClick={() => setCompare(true)}><GitCompare size={16} />Compare ({picked.length})</Button>} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 space-y-3">
          {stat.map((c) => (
            <Panel key={c.label} tilt as="button" onClick={c.onClick} className="flex w-full items-center gap-3 p-3.5">
              <c.icon size={26} className={c.color} />
              <div className="text-left"><div className="text-[13px] text-ink-muted">{c.label}</div><div className={cn('text-2xl font-bold', c.label === 'At-Risk' && 'text-accent-red', c.label.startsWith('Expansion') && 'text-accent-amber')}>{c.value === undefined ? '…' : <AnimatedValue value={c.value} format={(n) => Math.round(n).toString()} />}</div></div>
            </Panel>
          ))}
        </div>
        <Panel className="lg:col-span-4 p-4">
          <h2 className="panel-title mb-2 text-[17px]">Customers by Segment</h2>
          {s ? (
            <div className="flex items-center gap-4">
              <div className="relative h-[210px] w-[210px]">
                <ResponsiveContainer><PieChart><Pie data={s.by_segment.map((b) => ({ ...b, name: titleCase(b.segment) }))} dataKey="count" nameKey="name" innerRadius={64} outerRadius={96} stroke="none" paddingAngle={2} onClick={(d) => setSegment(String((d as unknown as { segment: string }).segment))} className="cursor-pointer">
                  {s.by_segment.map((b) => <Cell key={b.segment} fill={SEG_COLORS[b.segment]} />)}</Pie><Tooltip content={<ChartTip fmt={(v) => `${v} customers`} />} /></PieChart></ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-bold">{s.total_customers}</span><span className="text-xs text-ink-muted">Customers</span></div>
              </div>
              <ul className="space-y-2 text-sm">{s.by_segment.map((b) => <li key={b.segment} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SEG_COLORS[b.segment] }} />{titleCase(b.segment).replace('Mid Market', 'Mid-Market')}<span className="ml-3 text-ink-muted">{pct(b.share_pct, 0)}</span></li>)}</ul>
            </div>
          ) : <Spinner />}
        </Panel>
        <Panel className="lg:col-span-5 p-4">
          <h2 className="panel-title mb-2 text-[17px]">Top Customers by Revenue</h2>
          <ul>{s?.top_by_revenue.map((t, i) => (
            <li key={t.id}><button onClick={() => nav(`/customers/${t.id}`)} className="flex w-full items-center gap-3 border-b border-panel-line py-2.5 text-left text-sm last:border-0 hover:text-white">
              <span className="w-5 text-ink-faint">{i + 1}</span><span className="flex-1">{t.name}</span><span className="chip bg-accent-red/20 font-semibold text-[#ff8796] ring-1 ring-accent-red/40">{inr(t.net_revenue)}</span>
            </button></li>))}</ul>
          {s && <div className="mt-2"><Basis>At-risk: {s.definitions.at_risk}. Expansion: {s.definitions.expansion}.</Basis></div>}
        </Panel>
      </div>

      <CustomerGalaxyPanel />

      <Panel className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-panel-line p-3">
          <div className="relative w-64"><Search size={14} className="absolute left-3 top-2.5 text-ink-faint" /><input className="input py-1.5 pl-8 text-[13px]" placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" /></div>
          <Select label="Segment" value={segment} onChange={setSegment} options={[{ value: '', label: 'All Segments' }, { value: 'ENTERPRISE', label: 'Enterprise' }, { value: 'MID_MARKET', label: 'Mid-Market' }, { value: 'SMB', label: 'SMB' }]} />
          <Select label="Plan" value={plan} onChange={setPlan} options={[{ value: '', label: 'All Plans' }, ...['Platform Core', 'Analytics Add-on', 'Premium Support', 'API Calls', 'Data Storage'].map((p) => ({ value: p, label: p }))]} />
          <Select label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All Status' }, { value: 'ACTIVE', label: 'Active' }, { value: 'CHURNED', label: 'Churned' }]} />
          <Select label="Risk" value={risk} onChange={setRisk} options={[{ value: '', label: 'Any risk' }, { value: 'true', label: 'At-risk only' }, { value: 'false', label: 'Healthy only' }]} />
          <Select label="Sort" value={sort} onChange={setSort} options={[{ value: '-net_revenue', label: 'Revenue ↓' }, { value: '-mrr', label: 'MRR ↓' }, { value: 'margin_pct', label: 'Margin ↑' }, { value: '-outstanding', label: 'Outstanding ↓' }, { value: '-open_exceptions', label: 'Open exceptions ↓' }, { value: 'name', label: 'Name A–Z' }]} />
        </div>
        <table className="w-full text-[13.5px]">
          <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5"><th className="w-8"><span className="sr-only">Compare</span></th><th>Customer</th><th>Segment</th><th className="text-right">MRR</th><th className="text-right">Net revenue</th><th className="text-right">Margin</th><th className="text-right">Outstanding</th><th className="text-center">Open exc.</th><th>Health</th></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={9}><Spinner /></td></tr>}
            {list.data?.items.length === 0 && <tr><td colSpan={9}><Empty title="No customers match" /></td></tr>}
            {list.data?.items.map((c) => (
              <tr key={c.id} className="row-hover cursor-pointer border-b border-panel-line [&>td]:px-3 [&>td]:py-2" onClick={() => nav(`/customers/${c.id}`)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Compare ${c.name}`} checked={picked.includes(c.id)} disabled={!picked.includes(c.id) && picked.length >= 5}
                  onChange={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} /></td>
                <td><div className="font-medium">{c.name}</div><div className="text-[11px] text-ink-faint">{c.code} · {c.region}</div></td>
                <td>{titleCase(c.segment)}</td>
                <td className="text-right">{inr(c.mrr)}</td>
                <td className="text-right">{inr(c.net_revenue)}</td>
                <td className={cn('text-right', Number(c.margin_pct) < 0 && 'text-[#ff6b7d]')}>{pct(c.margin_pct)}</td>
                <td className="text-right">{inr(c.outstanding)}</td>
                <td className="text-center">{c.open_exceptions || '—'}</td>
                <td className="flex flex-wrap gap-1"><Pill value={c.profitability} />{c.at_risk && <Pill value="OVERDUE" label="At risk" />}{c.expansion_opportunity && <Pill value="PARTIAL" label="Expansion" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </Panel>
      <CompareCustomers open={compare} onClose={() => setCompare(false)} ids={picked} />
    </div>
  )
}

function CompareCustomers({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: number[] }) {
  const { period } = usePeriod()
  const q = useQuery({ queryKey: ['cust-compare', ids, period], queryFn: () => api.get<CustomerRow[]>('/customers/compare', { ids: ids.join(','), ...periodParams(period) }), enabled: open && ids.length >= 2 })
  const rows: [string, (c: CustomerRow) => string][] = [
    ['Segment', (c) => titleCase(c.segment)], ['MRR', (c) => inr(c.mrr)], ['Net revenue (period)', (c) => inr(c.net_revenue)],
    ['Direct cost', (c) => inr(c.direct_cost)], ['Contribution', (c) => inr(c.contribution)], ['Contribution margin', (c) => pct(c.margin_pct)],
    ['Profitability', (c) => titleCase(c.profitability)], ['Outstanding', (c) => inr(c.outstanding)], ['Open exceptions', (c) => String(c.open_exceptions)],
    ['Plans', (c) => c.plans.join(', ')], ['Risk signals', (c) => c.risk_reasons.join('; ') || 'none'],
  ]
  return (
    <Modal open={open} onClose={onClose} wide title={`Compare customers · ${period.label}`}>
      {q.isLoading && <Spinner />}
      {q.data && <table className="w-full text-sm"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>Metric</th>{q.data.map((c) => <th key={c.id}>{c.name}</th>)}</tr></thead>
        <tbody>{rows.map(([l, f]) => <tr key={l} className="border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td className="text-ink-muted">{l}</td>{q.data.map((c) => <td key={c.id}>{f(c)}</td>)}</tr>)}</tbody></table>}
    </Modal>
  )
}
