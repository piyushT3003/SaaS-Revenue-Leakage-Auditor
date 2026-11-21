import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Copy, Download, FlaskConical, Play, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Basis, Button, ChartTip, Empty, ErrorBox, Modal, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { dateTime, inr, inrCompact, pct, toNumber } from '@/lib/format'
import { usePeriod } from '@/lib/period'

type Pct = Record<string, number>
interface Assumptions { price_change_pct?: Pct; discount_pct?: Pct; included_units_change_pct?: Pct; quantity_change_pct?: Pct; cost_change_pct?: Pct }
interface Summ { revenue: string; direct_cost: string; contribution: string; margin_pct: string | null; segments?: Record<string, number> }
interface Out {
  hypothetical: true; basis: string; baseline: Summ; projected: Summ; delta: { revenue: string; contribution: string; margin_pp: string | null }
  segment_moves: Record<string, number>
  per_customer: { customer_id: number; customer: string; base_revenue: string; projected_revenue: string; revenue_change: string; base_margin_pct: string | null; projected_margin_pct: string | null; base_segment: string; projected_segment: string }[]
}
interface Scenario { id: number; name: string; description: string; assumptions: Assumptions; period_start: string; period_end: string; updated_at: string; duplicated_from_id: number | null; last_result: { computed_at: string } | null }

const COST_TYPES = ['COMPUTE', 'INFRASTRUCTURE', 'SUPPORT', 'PAYMENT_PROCESSING', 'THIRD_PARTY']
const LEVERS: { key: keyof Assumptions; label: string; hint: string; min: number; max: number; scope: 'product' | 'cost' }[] = [
  { key: 'price_change_pct', label: 'List price change', hint: '% change to unit prices and tier prices', min: -50, max: 100, scope: 'product' },
  { key: 'discount_pct', label: 'Discount override', hint: 'Discount % applied instead of the contracted one', min: 0, max: 100, scope: 'product' },
  { key: 'included_units_change_pct', label: 'Included units change', hint: '% change to usage allowances', min: -100, max: 200, scope: 'product' },
  { key: 'quantity_change_pct', label: 'Seat / quantity change', hint: '% change to subscribed quantity', min: -100, max: 200, scope: 'product' },
  { key: 'cost_change_pct', label: 'Cost change', hint: '% change to allocated direct cost', min: -100, max: 200, scope: 'cost' },
]

function clean(a: Assumptions): Assumptions {
  const out: Assumptions = {}
  for (const [k, v] of Object.entries(a) as [keyof Assumptions, Pct][]) {
    const kept = Object.fromEntries(Object.entries(v ?? {}).filter(([, n]) => n !== undefined && !Number.isNaN(n) && (k === 'discount_pct' || n !== 0)))
    if (Object.keys(kept).length) out[k] = kept
  }
  return out
}

/** What-If Revenue Simulator. Every figure is hypothetical, recalculated by the same financial engine. */
export function WhatIfLauncher() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="red" onClick={() => setOpen(true)}><FlaskConical size={16} />What-If Simulator</Button>
      <Modal open={open} onClose={() => setOpen(false)} wide title={<span className="flex items-center gap-2"><FlaskConical size={17} className="text-accent-red" />What-If Revenue Simulator <span className="chip bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40">Hypothetical</span></span>}>
        {open && <Simulator />}
      </Modal>
    </>
  )
}

function Simulator() {
  const { can } = useAuth()
  const { period } = usePeriod()
  const qc = useQueryClient()
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api.get<{ products: { id: number; product_code: string; name: string }[] }>('/metrics/reference') })
  const list = useQuery({ queryKey: ['scenarios'], queryFn: () => api.get<Scenario[]>('/simulations') })
  const [current, setCurrent] = useState<Scenario | null>(null)
  const [name, setName] = useState('New scenario')
  const [a, setA] = useState<Assumptions>({})
  const [target, setTarget] = useState('')
  useEffect(() => { if (!target && ref.data?.products[0]) setTarget(ref.data.products[0].product_code) }, [ref.data, target])
  const body = { name, description: '', assumptions: clean(a), period_start: current?.period_start ?? period.start, period_end: current?.period_end ?? period.end }
  const preview = useMutation({ mutationFn: () => api.post<Out>('/simulations/preview', body) })
  const save = useMutation({
    mutationFn: () => (current ? api.put<Scenario>(`/simulations/${current.id}`, body) : api.post<Scenario>('/simulations', body)),
    onSuccess: (s) => { setCurrent(s); qc.invalidateQueries({ queryKey: ['scenarios'] }) },
  })
  const runSaved = useMutation({ mutationFn: (id: number) => api.post<Out>(`/simulations/${id}/run`), onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }) })
  const dup = useMutation({ mutationFn: (id: number) => api.post<Scenario>(`/simulations/${id}/duplicate`), onSuccess: (s) => { load(s); qc.invalidateQueries({ queryKey: ['scenarios'] }) } })
  const del = useMutation({ mutationFn: (id: number) => api.del(`/simulations/${id}`), onSuccess: () => { setCurrent(null); qc.invalidateQueries({ queryKey: ['scenarios'] }) } })
  const load = (s: Scenario) => { setCurrent(s); setName(s.name); setA(s.assumptions ?? {}); preview.reset(); runSaved.reset() }
  const out = runSaved.data ?? preview.data
  const err = preview.error || save.error || runSaved.error || dup.error

  const setLever = (k: keyof Assumptions, scopeKey: string, v: number) => setA((p) => ({ ...p, [k]: { ...(p[k] ?? {}), [scopeKey]: v } }))
  const chart = useMemo(() => out ? [
    { name: 'Revenue', Baseline: toNumber(out.baseline.revenue), Projected: toNumber(out.projected.revenue) },
    { name: 'Direct cost', Baseline: toNumber(out.baseline.direct_cost), Projected: toNumber(out.projected.direct_cost) },
    { name: 'Contribution', Baseline: toNumber(out.baseline.contribution), Projected: toNumber(out.projected.contribution) },
  ] : [], [out])

  return (
    <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wider text-ink-muted">Saved scenarios</span>
          <button className="text-xs text-accent-blueSoft" onClick={() => { setCurrent(null); setName('New scenario'); setA({}); preview.reset(); runSaved.reset() }}>+ New</button></div>
        {list.isLoading && <Spinner />}
        {list.data?.length === 0 && <p className="text-xs text-ink-faint">None yet.</p>}
        {list.data?.map((s) => (
          <button key={s.id} onClick={() => load(s)} className={cn('w-full rounded-lg border px-3 py-2 text-left text-sm transition', current?.id === s.id ? 'border-accent-red/60 bg-accent-red/10' : 'border-panel-line hover:bg-white/5')}>
            <div className="truncate font-medium">{s.name}</div><div className="text-[11px] text-ink-faint">{s.last_result ? `Run ${dateTime(s.last_result.computed_at)}` : 'Not run'}</div>
          </button>
        ))}
      </aside>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-xs" aria-label="Scenario name" value={name} onChange={(e) => setName(e.target.value)} />
          <span className="text-xs text-ink-muted">Base period {body.period_start} → {body.period_end}</span>
          <div className="flex-1" />
          <label className="text-xs text-ink-muted">Product
            <select className="input ml-2 w-auto py-1 text-[13px]" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Product for levers">
              {ref.data?.products.map((p) => <option key={p.id} value={p.product_code} className="bg-space-900">{p.name}</option>)}
            </select></label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {LEVERS.map((l) => l.scope === 'product' ? (
            <Lever key={l.key} label={l.label} hint={`${l.hint} · ${target}`} min={l.min} max={l.max} value={a[l.key]?.[target]} onChange={(v) => setLever(l.key, target, v)} unit={l.key === 'discount_pct' ? '%' : '% Δ'} />
          ) : (
            <div key={l.key} className="panel p-3 md:col-span-2">
              <div className="mb-2 text-sm font-semibold">{l.label}<span className="ml-2 text-[11px] font-normal text-ink-muted">{l.hint}</span></div>
              <div className="grid gap-2 md:grid-cols-5">
                {COST_TYPES.map((ct) => (
                  <label key={ct} className="text-[11px] text-ink-muted">{ct.replace('_', ' ').toLowerCase()}
                    <input type="number" className="input mt-1 py-1 text-[13px]" min={l.min} max={l.max} value={a.cost_change_pct?.[ct] ?? 0} onChange={(e) => setLever('cost_change_pct', ct, Number(e.target.value))} /></label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {Object.keys(clean(a)).length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {Object.entries(clean(a)).flatMap(([k, v]) => Object.entries(v as Pct).map(([s, n]) => <span key={k + s} className="chip bg-white/5 ring-1 ring-panel-line">{k.replace(/_pct|_/g, ' ').trim()} · {s}: {n}%</span>))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="red" loading={preview.isPending} onClick={() => { runSaved.reset(); preview.mutate() }}><Play size={15} />Simulate</Button>
          {can('simulation:write') && <Button loading={save.isPending} onClick={() => save.mutate()}><Save size={15} />{current ? 'Save changes' : 'Save scenario'}</Button>}
          {current && can('simulation:write') && <>
            <Button loading={runSaved.isPending} onClick={() => runSaved.mutate(current.id)}>Run & store result</Button>
            <Button onClick={() => dup.mutate(current.id)}><Copy size={15} />Duplicate</Button>
            {current.last_result && <a className="btn-ghost" href={`/api/v1/simulations/${current.id}/export`}><Download size={15} />Export</a>}
            <Button onClick={() => del.mutate(current.id)} aria-label="Delete scenario"><Trash2 size={15} /></Button>
          </>}
        </div>
        {err && <ErrorBox error={err} />}
        {(preview.isPending || runSaved.isPending) && <Spinner label="Recalculating expected charges…" />}
        {out && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Delta label="Revenue" base={out.baseline.revenue} proj={out.projected.revenue} d={out.delta.revenue} />
              <Delta label="Contribution" base={out.baseline.contribution} proj={out.projected.contribution} d={out.delta.contribution} />
              <div className="panel p-3"><div className="text-[11px] text-ink-muted">Margin</div><div className="text-lg font-semibold">{pct(out.projected.margin_pct)}</div>
                <div className={cn('text-xs', toNumber(out.delta.margin_pp) >= 0 ? 'text-emerald-300' : 'text-[#ff6b7d]')}>{out.delta.margin_pp === null ? '—' : `${toNumber(out.delta.margin_pp) >= 0 ? '+' : ''}${toNumber(out.delta.margin_pp).toFixed(2)} pp`} vs {pct(out.baseline.margin_pct)}</div></div>
              <div className="panel p-3"><div className="text-[11px] text-ink-muted">Segment moves</div>
                {Object.keys(out.segment_moves).length ? Object.entries(out.segment_moves).map(([k, v]) => <div key={k} className="text-xs"><b>{v}</b> {k.replace(/_/g, ' ').toLowerCase()}</div>) : <div className="text-xs text-ink-faint">No customer changes segment</div>}</div>
            </div>
            <div className="panel p-3">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chart} barGap={6}>
                  <CartesianGrid stroke="rgba(120,150,255,0.12)" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={inrCompact} tickLine={false} axisLine={false} width={64} />
                  <Tooltip content={<ChartTip fmt={(v) => inr(v)} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} /><Legend iconType="circle" />
                  <Bar dataKey="Baseline" fill="#4c8dff" radius={[6, 6, 0, 0]} /><Bar dataKey="Projected" fill="#ef2b45" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="panel overflow-hidden">
              <div className="px-4 pt-3 text-sm font-semibold">Most affected customers</div>
              {out.per_customer.filter((r) => toNumber(r.revenue_change) !== 0).length === 0 ? <Empty title="No customer revenue changes under these assumptions" /> : (
                <table className="table-dark w-full text-sm"><thead><tr><th>Customer</th><th className="text-right">Baseline</th><th className="text-right">Projected</th><th className="text-right">Change</th><th>Margin</th></tr></thead>
                  <tbody>{[...out.per_customer].sort((x, y) => Math.abs(toNumber(y.revenue_change)) - Math.abs(toNumber(x.revenue_change))).slice(0, 10).map((r) => (
                    <tr key={r.customer_id}><td>{r.customer}</td><td className="text-right">{inr(r.base_revenue)}</td><td className="text-right">{inr(r.projected_revenue)}</td>
                      <td className={cn('text-right font-medium', toNumber(r.revenue_change) >= 0 ? 'text-emerald-300' : 'text-[#ff6b7d]')}>{inr(r.revenue_change, { sign: true })}</td>
                      <td className="text-xs text-ink-muted">{pct(r.base_margin_pct)} → {pct(r.projected_margin_pct)}</td></tr>
                  ))}</tbody></table>
              )}
            </div>
            <Basis>{out.basis}</Basis>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function Lever({ label, hint, min, max, value, onChange, unit }: { label: string; hint: string; min: number; max: number; value?: number; onChange: (v: number) => void; unit: string }) {
  const v = value ?? 0
  return (
    <div className="panel p-3">
      <div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{label}</span>
        <span className="flex items-center gap-1"><input type="number" aria-label={label} className="input w-20 py-0.5 text-right text-[13px]" min={min} max={max} value={v} onChange={(e) => onChange(Number(e.target.value))} /><span className="text-xs text-ink-muted">{unit}</span></span></div>
      <input type="range" aria-label={`${label} slider`} min={min} max={max} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#ef2b45]" />
      <div className="text-[11px] text-ink-faint">{hint}</div>
    </div>
  )
}

function Delta({ label, base, proj, d }: { label: string; base: string; proj: string; d: string }) {
  const n = toNumber(d)
  return (
    <div className="panel p-3"><div className="text-[11px] text-ink-muted">{label}</div><div className="text-lg font-semibold">{inr(proj, { decimals: 0 })}</div>
      <div className={cn('text-xs', n >= 0 ? 'text-emerald-300' : 'text-[#ff6b7d]')}>{inr(d, { sign: true, decimals: 0 })} vs {inr(base, { decimals: 0 })}</div></div>
  )
}
