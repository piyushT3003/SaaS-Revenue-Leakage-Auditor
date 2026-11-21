import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Basis, CategoryPill, ChartTip, Empty, ErrorBox, Panel, Pill, Spinner, Tabs } from '@/components/ui'
import { api } from '@/lib/api'
import { date, inr, inrCompact, num, pct, titleCase, toNumber } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'
import type { CustomerRow } from './CustomersPage'

interface Profile {
  customer: CustomerRow & { onboarded_on: string }
  contracts: { id: number; number: string; start_date: string; end_date: string | null; billing_frequency: string; status: string; payment_terms_days: number; currency: string
    versions: { id: number; version: number; effective_from: string; effective_to: string | null; change_reason: string; current: boolean
      rules: { id: number; rule_key: string; rule_version: number; product: string; charge_type: string; model: string; unit_price: string; included_units: string; discount_pct: string; tiers: { up_to: string | null; unit_price: string }[] }[] }[] }[]
  subscriptions: { id: number; code: string; product: string; charge_model: string; plan: string; quantity: string; status: string; start_date: string; end_date: string | null; billing_frequency: string }[]
  usage: { month: string; product: string; unit: string; used: string; included: string; excess: string }[]
  invoices: { id: number; number: string; issue_date: string; due_date: string; status: string; total: string; outstanding: string | null }[]
  payments: { id: number; number: string; received_on: string; amount: string; method: string; reference: string; verification_status: string; allocated: string }[]
  credits: { id: number; number: string; type: string; amount: string; status: string; reason: string }[]
  exceptions: { id: number; code: string; category: string; title: string; impact: string; severity: string; status: string; period_start: string }[]
  profitability: { period: { net_revenue: string; direct_cost: string; contribution: string; margin_pct: string | null; segment: string; cost_breakdown: Record<string, string> } | null
    monthly: { month: string; revenue: string; cost: string; contribution: string; margin_pct: string | null }[] }
}
type T = 'overview' | 'contracts' | 'subscriptions' | 'usage' | 'billing' | 'payments' | 'exceptions' | 'profitability'

export default function CustomerProfile() {
  const { id } = useParams()
  const { period } = usePeriod()
  const nav = useNavigate()
  const [tab, setTab] = useState<T>('overview')
  const q = useQuery({ queryKey: ['customer', id, period], queryFn: () => api.get<Profile>(`/customers/${id}`, periodParams(period)) })
  if (q.isLoading) return <Spinner />
  if (q.error || !q.data) return <ErrorBox error={q.error} />
  const d = q.data
  const c = d.customer
  const tabs: { key: T; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'contracts', label: 'Contracts', count: d.contracts.length }, { key: 'subscriptions', label: 'Subscriptions', count: d.subscriptions.length },
    { key: 'usage', label: 'Usage' }, { key: 'billing', label: 'Billing', count: d.invoices.length }, { key: 'payments', label: 'Payments', count: d.payments.length },
    { key: 'exceptions', label: 'Exceptions', count: d.exceptions.length }, { key: 'profitability', label: 'Profitability' },
  ]
  const kv = (l: string, v: React.ReactNode) => <div className="rounded-lg bg-space-900/60 p-3"><div className="text-xs text-ink-muted">{l}</div><div className="mt-0.5 text-lg font-semibold">{v}</div></div>
  return (
    <div>
      <Link to="/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft size={15} />Customer Intelligence</Link>
      <div className="mb-4 flex items-end justify-between">
        <div><h1 className="text-3xl font-bold">{c.name}</h1><p className="text-ink-muted">{c.code} · {titleCase(c.segment)} · {c.industry} · {c.region} · owner {c.account_owner}</p></div>
        <div className="flex gap-2"><Pill value={c.status} /><Pill value={c.profitability} />{c.at_risk && <Pill value="OVERDUE" label="At risk" />}</div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} className="mb-4" />
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{kv('MRR', inr(c.mrr))}{kv('Net revenue (period)', inr(c.net_revenue))}{kv('Contribution', inr(c.contribution))}{kv('Margin', pct(c.margin_pct))}{kv('Outstanding', inr(c.outstanding))}{kv('Open exceptions', c.open_exceptions)}</div>
          <Panel className="p-4"><h3 className="panel-title mb-2">Subscription health</h3>
            <ul className="space-y-1 text-sm">{d.subscriptions.map((s) => <li key={s.id} className="flex justify-between border-b border-panel-line py-1.5"><span>{s.product} <span className="text-ink-faint">· {s.plan}</span></span><span className="flex items-center gap-3"><span className="text-ink-muted">qty {num(s.quantity)} · {titleCase(s.billing_frequency)}</span><Pill value={s.status} /></span></li>)}</ul>
            {c.risk_reasons.length > 0 && <p className="mt-3 text-sm text-[#fbbf24]">Risk signals: {c.risk_reasons.join('; ')}</p>}
            {c.expansion_opportunity && <p className="mt-1 text-sm text-accent-cyan">Expansion signal: {c.expansion_reason}</p>}
          </Panel>
        </div>
      )}
      {tab === 'contracts' && d.contracts.map((k) => (
        <Panel key={k.id} className="mb-3 p-4">
          <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{k.number}</h3><span className="text-sm text-ink-muted">{date(k.start_date)} – {k.end_date ? date(k.end_date) : 'open'} · {titleCase(k.billing_frequency)} · net {k.payment_terms_days} days · {k.currency} <Pill value={k.status} /></span></div>
          {k.versions.map((v) => (
            <div key={v.id} className="mb-2 rounded-lg border border-panel-line p-3">
              <div className="mb-1 flex items-center gap-2 text-sm"><b>Version {v.version}</b>{v.current && <Pill value="ACTIVE" label="current" />}<span className="text-ink-muted">{date(v.effective_from)} – {v.effective_to ? date(v.effective_to) : 'open'} · {v.change_reason}</span></div>
              <table className="w-full text-[13px]"><thead><tr className="table-head [&>th]:px-2 [&>th]:py-1"><th>Rule</th><th>Product</th><th>Charge</th><th>Model</th><th className="text-right">Unit price</th><th className="text-right">Included</th><th className="text-right">Discount</th></tr></thead>
                <tbody>{v.rules.map((r) => <tr key={r.id} className="border-b border-panel-line [&>td]:px-2 [&>td]:py-1"><td className="font-mono text-[11px]">{r.rule_key} v{r.rule_version}</td><td>{r.product}</td><td>{titleCase(r.charge_type)}</td><td>{titleCase(r.model)}{r.tiers.length > 0 && <span className="text-[11px] text-ink-faint"> ({r.tiers.map((t) => `${t.up_to ?? '∞'}@${t.unit_price}`).join(', ')})</span>}</td><td className="text-right">{inr(r.unit_price, { decimals: 2 })}</td><td className="text-right">{num(r.included_units)}</td><td className="text-right">{pct(r.discount_pct, 1)}</td></tr>)}</tbody></table>
            </div>
          ))}
        </Panel>
      ))}
      {tab === 'subscriptions' && <Panel><table className="w-full text-[13.5px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>Code</th><th>Product</th><th>Plan</th><th className="text-right">Qty</th><th>Billing</th><th>Start</th><th>End</th><th>Status</th></tr></thead>
        <tbody>{d.subscriptions.map((s) => <tr key={s.id} className="border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td className="font-mono text-xs">{s.code}</td><td>{s.product}</td><td>{s.plan}</td><td className="text-right">{num(s.quantity)}</td><td>{titleCase(s.billing_frequency)}</td><td>{date(s.start_date)}</td><td>{s.end_date ? date(s.end_date) : '—'}</td><td><Pill value={s.status} /></td></tr>)}</tbody></table></Panel>}
      {tab === 'usage' && (d.usage.length === 0 ? <Empty title="No metered products" /> :
        <Panel className="p-4"><ResponsiveContainer width="100%" height={300}><BarChart data={d.usage.map((u) => ({ label: `${new Date(u.month).toLocaleDateString('en-US', { month: 'short' })} · ${u.product}`, used: toNumber(u.used), included: toNumber(u.included), excess: toNumber(u.excess) }))}>
          <CartesianGrid stroke="rgba(120,150,255,0.12)" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} height={60} /><YAxis tick={{ fontSize: 11 }} /><Tooltip content={<ChartTip fmt={(v) => num(v)} />} /><Legend />
          <Bar dataKey="included" name="Included allowance" fill="#2f7bff" /><Bar dataKey="used" name="Actual consumption" fill="#22d3ee" /><Bar dataKey="excess" name="Excess (billable)" fill="#ef2b45" /></BarChart></ResponsiveContainer>
          <Basis>Consumption from valid usage events by local day (tenant timezone); allowance from the contract version in force for each month.</Basis></Panel>)}
      {tab === 'billing' && <Panel><table className="w-full text-[13.5px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>Invoice</th><th>Issued</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Outstanding</th><th>Status</th></tr></thead>
        <tbody>{d.invoices.map((i) => <tr key={i.id} className="row-hover cursor-pointer border-b border-panel-line [&>td]:px-3 [&>td]:py-2" onClick={() => nav(`/billing?invoice=${i.id}`)}><td>{i.number}</td><td>{date(i.issue_date)}</td><td>{date(i.due_date)}</td><td className="text-right">{inr(i.total)}</td><td className="text-right">{inr(i.outstanding)}</td><td><Pill value={i.status} /></td></tr>)}</tbody></table></Panel>}
      {tab === 'payments' && <Panel><table className="w-full text-[13.5px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>Payment</th><th>Received</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th className="text-right">Allocated</th><th>Verification</th></tr></thead>
        <tbody>{d.payments.map((p) => <tr key={p.id} className="border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td>{p.number}</td><td>{date(p.received_on)}</td><td>{titleCase(p.method)}</td><td className="font-mono text-xs">{p.reference}</td><td className="text-right">{inr(p.amount)}</td><td className="text-right">{inr(p.allocated)}</td><td><Pill value={p.verification_status} /></td></tr>)}</tbody></table>
        {d.credits.length > 0 && <div className="p-3 text-sm"><b>Credits & adjustments:</b> {d.credits.map((x) => `${x.number} ${titleCase(x.type)} ${inr(x.amount)} (${x.status.toLowerCase()})`).join(' · ')}</div>}</Panel>}
      {tab === 'exceptions' && (d.exceptions.length === 0 ? <Empty title="No exceptions for this customer" /> :
        <Panel><table className="w-full text-[13.5px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>ID</th><th>Category</th><th>Description</th><th>Period</th><th className="text-right">Impact</th><th>Status</th></tr></thead>
          <tbody>{d.exceptions.map((e) => <tr key={e.id} className="row-hover cursor-pointer border-b border-panel-line [&>td]:px-3 [&>td]:py-2" onClick={() => nav(`/exceptions?id=${e.id}`)}><td>{e.code}</td><td><CategoryPill value={e.category} /></td><td>{e.title}</td><td>{date(e.period_start)}</td><td className="text-right">{inr(e.impact)}</td><td><Pill value={e.status} /></td></tr>)}</tbody></table></Panel>)}
      {tab === 'profitability' && (
        <div className="space-y-4">
          {d.profitability.period && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{kv('Net revenue', inr(d.profitability.period.net_revenue))}{kv('Direct cost', inr(d.profitability.period.direct_cost))}{kv('Contribution', inr(d.profitability.period.contribution))}{kv('Margin', pct(d.profitability.period.margin_pct))}</div>}
          <Panel className="p-4"><h3 className="panel-title mb-2">Revenue, cost and contribution (6 months)</h3>
            <ResponsiveContainer width="100%" height={260}><BarChart data={d.profitability.monthly.map((m) => ({ label: new Date(m.month).toLocaleDateString('en-US', { month: 'short' }), revenue: toNumber(m.revenue), cost: toNumber(m.cost), contribution: toNumber(m.contribution) }))}>
              <CartesianGrid stroke="rgba(120,150,255,0.12)" vertical={false} /><XAxis dataKey="label" /><YAxis tickFormatter={inrCompact} /><Tooltip content={<ChartTip fmt={(v) => inr(v)} />} /><Legend />
              <Bar dataKey="revenue" name="Net revenue" fill="#2f7bff" radius={[3, 3, 0, 0]} /><Bar dataKey="cost" name="Direct cost" fill="#ef2b45" radius={[3, 3, 0, 0]} /><Bar dataKey="contribution" name="Contribution" fill="#22c55e" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
          {d.profitability.period && <Panel className="p-4"><h3 className="panel-title mb-2">Cost breakdown (period)</h3><ul className="text-sm">{Object.entries(d.profitability.period.cost_breakdown).map(([k, v]) => <li key={k} className="flex justify-between border-b border-panel-line py-1.5"><span>{titleCase(k)}</span><span>{inr(v)}</span></li>)}</ul>
            <div className="mt-2"><Basis>Customer-specific costs are direct; product cost pools are allocated by usage, seats or revenue share. See Unit Economics → Cost breakdown for methodology.</Basis></div></Panel>}
        </div>
      )}
    </div>
  )
}
