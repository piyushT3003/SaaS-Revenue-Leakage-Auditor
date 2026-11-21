import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AnimatedValue, Basis, ChartTip, Pager, Panel, Pill, Select, Spinner, Stagger, StaggerItem, Tabs } from '@/components/ui'
import { PageTitle } from '@/layouts/AppLayout'
import { api, type Paged } from '@/lib/api'
import { cn } from '@/lib/cn'
import { inr, inrCompact, pct, titleCase, toNumber } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'
import { WhatIfLauncher } from './WhatIfLauncher'

interface Summary { avg_revenue_per_customer: string; avg_cost_per_customer: string; contribution_per_customer: string; contribution_margin: string | null; net_revenue: string; direct_cost: string; contribution: string; customers: number; segments: { segment: string; count: number; share_pct: string | null }[]; metric: { basis: string; details: { unallocated_pool_costs: string } } }
interface Row { customer_id: number; customer_name: string; customer_code: string; customer_segment: string; net_revenue: string; direct_cost: string; contribution: string; margin_pct: string | null; segment: string; rank: number }
type T = 'customers' | 'products' | 'segments' | 'costs'

export default function UnitEconomicsPage() {
  const { period } = usePeriod()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [tab, setTab] = useState<T>('customers')
  const [prof, setProf] = useState(params.get('profitability') ?? '')
  const [seg, setSeg] = useState('')
  const [sort, setSort] = useState('-contribution')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [prof, seg, sort, period])
  const p = periodParams(period)
  const s = useQuery({ queryKey: ['ue-summary', period], queryFn: () => api.get<Summary>('/unit-economics/summary', p) })
  const trend = useQuery({ queryKey: ['ue-trend', period.end], queryFn: () => api.get<{ label: string; revenue: string; cost: string; contribution: string; margin_pct: string | null }[]>('/unit-economics/trend', { end: period.end, months: 6 }) })
  const rows = useQuery({ queryKey: ['ue-rows', period, prof, seg, sort, page], queryFn: () => api.get<Paged<Row>>('/unit-economics/customers', { ...p, profitability: prof, segment: seg, sort, page, page_size: 12 }), enabled: tab === 'customers' })
  const products = useQuery({ queryKey: ['ue-products', period], queryFn: () => api.get<{ products: { name: string; revenue: string; direct_cost: string; contribution: string; margin_pct: string | null }[]; basis: string }>('/unit-economics/products', p), enabled: tab === 'products' })
  const segments = useQuery({ queryKey: ['ue-segments', period], queryFn: () => api.get<{ segment: string; revenue: string; cost: string; contribution: string; margin_pct: string | null; customers: number }[]>('/unit-economics/segments', p), enabled: tab === 'segments' })
  const costs = useQuery({ queryKey: ['ue-costs', period], queryFn: () => api.get<{ pools: { product: string; cost_type: string; allocation_basis: string; customer_specific: boolean; amount: string; rows: number }[]; methodology: string[] }>('/unit-economics/cost-breakdown', p), enabled: tab === 'costs' })
  const d = s.data
  const kpis = [
    { label: 'Avg. Revenue / Customer', value: d?.avg_revenue_per_customer, money: true },
    { label: 'Avg. Cost / Customer', value: d?.avg_cost_per_customer, money: true },
    { label: 'Contribution / Customer', value: d?.contribution_per_customer, money: true },
    { label: 'Margin', value: d?.contribution_margin, pct: true },
  ]
  const segColors: Record<string, string> = { PROFITABLE: '#22c55e', AT_RISK: '#f5a524', UNPROFITABLE: '#ef2b45' }
  return (
    <div>
      <PageTitle first="Customer Unit" accent="Economics" subtitle="Revenue, cost and profitability at customer and cohort level" actions={<WhatIfLauncher />} />
      <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <StaggerItem key={k.label}><Panel tilt as="div" className="p-4 text-center"><div className="text-[15px] text-ink">{k.label}</div>
            <div className="mt-1 text-[28px] font-bold">{k.value === undefined ? '…' : <AnimatedValue value={k.value === null ? null : Number(k.value)} format={(n) => k.pct ? `${n.toFixed(1)}%` : inr(n, { decimals: 0 })} />}</div></Panel></StaggerItem>
        ))}
      </Stagger>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-8 p-4">
          <h2 className="panel-title mb-2 text-[17px]">Revenue vs Cost (Monthly)</h2>
          {trend.data ? (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={trend.data.map((t) => ({ label: t.label, revenue: toNumber(t.revenue), cost: toNumber(t.cost), margin: t.margin_pct === null ? null : toNumber(t.margin_pct) }))}>
                <CartesianGrid stroke="rgba(120,150,255,0.12)" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tickFormatter={inrCompact} tickLine={false} axisLine={false} width={60} /><YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<ChartTip fmt={(v) => (v < 100 ? `${v.toFixed(1)}%` : inr(v))} />} /><Legend iconType="circle" />
                <Bar yAxisId="l" dataKey="revenue" name="Net revenue" fill="#2f7bff" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar yAxisId="l" dataKey="cost" name="Direct cost" fill="#ef2b45" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line yAxisId="r" dataKey="margin" name="Contribution margin %" stroke="#f5a524" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <Spinner />}
        </Panel>
        <Panel className="lg:col-span-4 p-4">
          <h2 className="panel-title mb-3 text-[17px]">Customer Profitability</h2>
          <ul className="space-y-3">{d?.segments.map((sg) => (
            <li key={sg.segment}><button className={cn('flex w-full items-center gap-3 rounded-lg p-2 text-left text-[15px] hover:bg-white/5', prof === sg.segment && 'bg-white/5 ring-1 ring-panel-border')} onClick={() => { setTab('customers'); setProf(prof === sg.segment ? '' : sg.segment) }}>
              <span className="h-3 w-3 rounded-full" style={{ background: segColors[sg.segment] }} /><span className="flex-1">{titleCase(sg.segment)}</span>
              <span className="chip min-w-[48px] justify-center font-semibold ring-1" style={{ color: segColors[sg.segment], borderColor: segColors[sg.segment], background: `${segColors[sg.segment]}22` }}>{sg.count}</span><span className="w-16 text-right text-ink-muted">({pct(sg.share_pct)})</span></button></li>
          ))}</ul>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full">{d?.segments.map((sg) => <motion.div key={sg.segment} initial={{ width: 0 }} animate={{ width: `${toNumber(sg.share_pct)}%` }} transition={{ duration: 1 }} style={{ background: segColors[sg.segment] }} />)}</div>
          {d && <div className="mt-3 space-y-1"><Basis>{d.metric.basis}</Basis><Basis>Unallocated pool costs this period: {inr(d.metric.details.unallocated_pool_costs)}</Basis></div>}
        </Panel>
      </div>

      <Panel className="mt-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-panel-line p-3">
          <Tabs value={tab} onChange={setTab} tabs={[{ key: 'customers', label: 'Customer Rankings' }, { key: 'products', label: 'Product Profitability' }, { key: 'segments', label: 'Segment Profitability' }, { key: 'costs', label: 'Cost Breakdown' }]} />
          {tab === 'customers' && <div className="ml-auto flex gap-2">
            <Select label="Profitability" value={prof} onChange={setProf} options={[{ value: '', label: 'All' }, { value: 'PROFITABLE', label: 'Profitable' }, { value: 'AT_RISK', label: 'At-risk' }, { value: 'UNPROFITABLE', label: 'Unprofitable' }]} />
            <Select label="Segment" value={seg} onChange={setSeg} options={[{ value: '', label: 'All segments' }, { value: 'ENTERPRISE', label: 'Enterprise' }, { value: 'MID_MARKET', label: 'Mid-Market' }, { value: 'SMB', label: 'SMB' }]} />
            <Select label="Sort" value={sort} onChange={setSort} options={[{ value: '-contribution', label: 'Contribution ↓' }, { value: 'contribution', label: 'Contribution ↑' }, { value: 'margin_pct', label: 'Margin ↑' }, { value: '-margin_pct', label: 'Margin ↓' }, { value: '-net_revenue', label: 'Revenue ↓' }, { value: '-direct_cost', label: 'Cost ↓' }]} />
          </div>}
        </div>
        {tab === 'customers' && <>
          <table className="w-full text-[13.5px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5"><th>#</th><th>Customer</th><th>Segment</th><th className="text-right">Net revenue</th><th className="text-right">Direct cost</th><th className="text-right">Contribution</th><th className="text-right">Margin</th><th>Profitability</th></tr></thead>
            <tbody>{rows.data?.items.map((r) => (
              <tr key={r.customer_id} className="row-hover cursor-pointer border-b border-panel-line [&>td]:px-3 [&>td]:py-2" onClick={() => nav(`/customers/${r.customer_id}?tab=profitability`)}>
                <td className="text-ink-faint">{r.rank}</td><td>{r.customer_name}</td><td>{titleCase(r.customer_segment)}</td><td className="text-right">{inr(r.net_revenue)}</td><td className="text-right">{inr(r.direct_cost)}</td>
                <td className={cn('text-right font-semibold', Number(r.contribution) < 0 && 'text-[#ff6b7d]')}>{inr(r.contribution)}</td><td className="text-right">{pct(r.margin_pct)}</td><td><Pill value={r.segment} /></td></tr>))}</tbody></table>
          {rows.data && <Pager page={rows.data.page} pages={rows.data.pages} total={rows.data.total} onPage={setPage} />}
        </>}
        {tab === 'products' && products.data && <div className="p-4">
          <ResponsiveContainer width="100%" height={260}><BarChart data={products.data.products.map((x) => ({ name: x.name, revenue: toNumber(x.revenue), cost: toNumber(x.direct_cost), contribution: toNumber(x.contribution) }))}>
            <CartesianGrid stroke="rgba(120,150,255,0.12)" vertical={false} /><XAxis dataKey="name" /><YAxis tickFormatter={inrCompact} /><Tooltip content={<ChartTip fmt={(v) => inr(v)} />} /><Legend />
            <Bar dataKey="revenue" name="Revenue" fill="#2f7bff" /><Bar dataKey="cost" name="Direct cost" fill="#ef2b45" /><Bar dataKey="contribution" name="Contribution">{products.data.products.map((x) => <Cell key={x.name} fill={Number(x.contribution) >= 0 ? '#22c55e' : '#ef2b45'} />)}</Bar></BarChart></ResponsiveContainer>
          <table className="mt-2 w-full text-sm"><tbody>{products.data.products.map((x) => <tr key={x.name} className="border-b border-panel-line [&>td]:px-2 [&>td]:py-1.5"><td>{x.name}</td><td className="text-right">{inr(x.revenue)}</td><td className="text-right">{inr(x.direct_cost)}</td><td className="text-right">{inr(x.contribution)}</td><td className="text-right">{pct(x.margin_pct)}</td></tr>)}</tbody></table>
          <div className="mt-2"><Basis>{products.data.basis}</Basis></div></div>}
        {tab === 'segments' && segments.data && <table className="w-full text-sm"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>Segment</th><th className="text-right">Customers</th><th className="text-right">Revenue</th><th className="text-right">Direct cost</th><th className="text-right">Contribution</th><th className="text-right">Margin</th></tr></thead>
          <tbody>{segments.data.map((x) => <tr key={x.segment} className="border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td>{titleCase(x.segment)}</td><td className="text-right">{x.customers}</td><td className="text-right">{inr(x.revenue)}</td><td className="text-right">{inr(x.cost)}</td><td className="text-right">{inr(x.contribution)}</td><td className="text-right">{pct(x.margin_pct)}</td></tr>)}</tbody></table>}
        {tab === 'costs' && costs.data && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
          <table className="sm:col-span-2 w-full text-sm"><thead><tr className="table-head [&>th]:px-2 [&>th]:py-2"><th>Product</th><th>Cost type</th><th>Allocation basis</th><th className="text-right">Rows</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{costs.data.pools.map((x, i) => <tr key={i} className="border-b border-panel-line [&>td]:px-2 [&>td]:py-1.5"><td>{x.product}</td><td>{titleCase(x.cost_type)}</td><td>{x.customer_specific ? 'Direct (customer-specific)' : titleCase(x.allocation_basis)}</td><td className="text-right">{x.rows}</td><td className="text-right">{inr(x.amount)}</td></tr>)}</tbody></table>
          <div><h3 className="mb-2 font-semibold">Allocation methodology</h3><ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">{costs.data.methodology.map((m) => <li key={m}>{m}</li>)}</ol></div></div>}
        {((tab === 'products' && products.isLoading) || (tab === 'segments' && segments.isLoading) || (tab === 'costs' && costs.isLoading)) && <Spinner />}
      </Panel>
    </div>
  )
}
