import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Network, Search, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatedValue, Basis, Button, CategoryPill, Drawer, Empty, ErrorBox, Pager, Panel, Pill, Select, Spinner, Stagger, StaggerItem } from '@/components/ui'
import { PageTitle } from '@/layouts/AppLayout'
import { api, type Paged } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { date, dateTime, inr, titleCase } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'
import { AdvancedActions } from './AdvancedActions'
import { EvidenceGraphModal } from '@/components/EvidenceGraph'

export interface ExceptionRow {
  id: number; exception_code: string; category: string; category_label: string; customer: { id: number; code: string; name: string } | null
  period_start: string; financial_impact: string; severity: string; status: string; owner: { id: number; name: string } | null; title: string; detected_at: string
}
interface Detail extends ExceptionRow {
  explanation: string; calculation: Record<string, unknown>; resolution_reason: string; counts_toward_leakage: boolean
  first_detected_in: { id: string; run_code: string }; last_seen_in: { id: string; run_code: string } | null; obligation_key: string | null
  evidence: { id: number; type: string; table: string; record_id: string; summary: string; snapshot: Record<string, unknown> }[]
  notes: { id: number; author: string; body: string; created_at: string }[]
  history: { from: string; to: string; by: string | null; reason: string; at: string }[]
}
interface Summary { total: number; open: number; in_progress: number; resolved: number; dismissed: number; financial_exposure: string; unique_leakage_exposure: string; exposure_basis: string; by_category: { category: string; label: string; count: number }[] }

const CATS = ['UNDERBILLING', 'OVERBILLING', 'MISSING_CHARGE', 'DUPLICATE_INVOICE', 'DISCOUNT_DRIFT', 'PRICING_MISMATCH', 'UNBILLED_USAGE', 'PAYMENT_DISCREPANCY']

export default function ExceptionsPage() {
  const { period } = usePeriod()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(params.get('category') ?? '')
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [severity, setSeverity] = useState('')
  const [owner, setOwner] = useState('')
  const [sort, setSort] = useState('-impact')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const openId = params.get('id')
  useEffect(() => setPage(1), [search, category, status, severity, owner, sort, period])
  const filters = { ...periodParams(period), search, category, status, severity, owner_id: owner, sort }
  const summary = useQuery({ queryKey: ['exceptions-summary', period], queryFn: () => api.get<Summary>('/exceptions/summary', periodParams(period)) })
  const list = useQuery({ queryKey: ['exceptions', filters, page], queryFn: () => api.get<Paged<ExceptionRow>>('/exceptions', { ...filters, page, page_size: 25 }) })
  const assignees = useQuery({ queryKey: ['assignees'], queryFn: () => api.get<{ id: number; name: string; role: string }[]>('/exceptions/assignees/list') })
  const s = summary.data
  const cards = [
    { label: 'Total Exceptions', value: s?.total, cls: 'text-white' },
    { label: 'Open', value: s?.open, cls: 'text-accent-red', filter: 'OPEN' },
    { label: 'In Progress', value: s?.in_progress, cls: 'text-accent-amber', filter: 'IN_PROGRESS' },
    { label: 'Resolved', value: s?.resolved, cls: 'text-accent-green', filter: 'RESOLVED' },
  ]
  const exportCsv = async () => {
    const all: ExceptionRow[] = []
    for (let p = 1; p <= 20; p++) {
      const r = await api.get<Paged<ExceptionRow>>('/exceptions', { ...filters, page: p, page_size: 200 })
      all.push(...r.items)
      if (p >= r.pages) break
    }
    const rows = [['Exception ID', 'Customer', 'Category', 'Billing period', 'Impact (INR)', 'Severity', 'Status', 'Owner', 'Description'],
      ...all.map((e) => [e.exception_code, e.customer?.name ?? '', e.category_label, e.period_start, e.financial_impact, e.severity, e.status, e.owner?.name ?? '', e.title])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `exceptions_${period.start}_${period.end}.csv`
    a.click()
  }
  return (
    <div>
      <PageTitle first="Exception" accent="Management" subtitle="Detect, analyze and resolve billing & revenue discrepancies"
        actions={<><AdvancedActions selected={[...selected]} /><Button variant="red" onClick={exportCsv}><Download size={16} />Export</Button></>} />
      <Stagger className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c) => (
          <StaggerItem key={c.label}>
            <Panel tilt as="button" onClick={() => setStatus(c.filter ?? '')} className={cn('w-full p-4 text-center', status === (c.filter ?? '') && 'ring-1 ring-accent-red/60')}>
              <div className="text-[15px] text-ink">{c.label}</div>
              <div className={cn('mt-1 text-[34px] font-bold', c.cls)}>{c.value === undefined ? '…' : <AnimatedValue value={c.value} format={(n) => Math.round(n).toString()} />}</div>
            </Panel>
          </StaggerItem>
        ))}
        <StaggerItem>
          <Panel tilt red as="div" className="p-4 text-center">
            <div className="text-[15px] text-ink">Financial Exposure</div>
            <div className="mt-1 text-[28px] font-bold">{s ? inr(s.financial_exposure) : '…'}</div>
            <div className="text-[11px] text-ink-muted">unique leakage {s ? inr(s.unique_leakage_exposure) : '…'}</div>
          </Panel>
        </StaggerItem>
      </Stagger>

      <Panel className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-panel-line p-3">
          <div className="relative w-72"><Search size={15} className="absolute left-3 top-2.5 text-ink-faint" />
            <input className="input py-1.5 pl-9 text-[13px]" placeholder="Search by customer, ID, description…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search exceptions" /></div>
          <Select label="Issue type" value={category} onChange={setCategory} options={[{ value: '', label: 'All Issue Types' }, ...CATS.map((c) => ({ value: c, label: titleCase(c) }))]} />
          <Select label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All Status' }, ...['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].map((c) => ({ value: c, label: titleCase(c) }))]} />
          <Select label="Severity" value={severity} onChange={setSeverity} options={[{ value: '', label: 'All Severity' }, ...['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((c) => ({ value: c, label: titleCase(c) }))]} />
          <Select label="Owner" value={owner} onChange={setOwner} options={[{ value: '', label: 'All Owners' }, ...(assignees.data ?? []).map((a) => ({ value: String(a.id), label: a.name }))]} />
          <Select label="Sort" value={sort} onChange={setSort} options={[{ value: '-impact', label: 'Highest impact' }, { value: '-severity', label: 'Severity' }, { value: '-detected', label: 'Newest' }, { value: 'customer', label: 'Customer A–Z' }]} />
          <span className="ml-auto text-xs text-ink-muted">{period.label}</span>
        </div>
        {list.error && <ErrorBox error={list.error} />}
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5">
              <th><input type="checkbox" aria-label="Select all on page" checked={!!list.data?.items.length && list.data.items.every((e) => selected.has(e.id))}
                onChange={(ev) => setSelected(ev.target.checked ? new Set([...selected, ...(list.data?.items.map((e) => e.id) ?? [])]) : new Set())} /></th>
              <th>Exception ID</th><th>Customer</th><th>Issue Type</th><th>Billing Period</th><th className="text-right">Financial Impact</th><th>Severity</th><th>Status</th><th>Owner</th><th>Action</th></tr></thead>
            <tbody>
              {list.isLoading && <tr><td colSpan={10}><Spinner /></td></tr>}
              {list.data?.items.length === 0 && <tr><td colSpan={10}><Empty title="No exceptions match these filters" hint="Run an audit on the Reconciliation page to detect discrepancies for this period." /></td></tr>}
              {list.data?.items.map((e) => (
                <tr key={e.id} className="row-hover border-b border-panel-line [&>td]:px-3 [&>td]:py-2.5">
                  <td><input type="checkbox" aria-label={`Select ${e.exception_code}`} checked={selected.has(e.id)} onChange={() => { const n = new Set(selected); n.has(e.id) ? n.delete(e.id) : n.add(e.id); setSelected(n) }} /></td>
                  <td className="font-medium">{e.exception_code}</td>
                  <td>{e.customer?.name ?? '—'}</td>
                  <td><CategoryPill value={e.category} label={e.category_label} /></td>
                  <td className="whitespace-nowrap text-ink-muted">{date(e.period_start)}</td>
                  <td className="text-right font-semibold">{inr(e.financial_impact)}</td>
                  <td><Pill value={e.severity} /></td>
                  <td><Pill value={e.status} /></td>
                  <td className="text-ink-muted">{e.owner?.name ?? 'Unassigned'}</td>
                  <td><button className="chip bg-[#3b2ea8]/70 px-3 py-1 text-white ring-1 ring-[#6d5df5]/60 hover:brightness-125" onClick={() => setParams({ id: String(e.id) })}>Investigate</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data && <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
        {s && <div className="border-t border-panel-line px-4 py-2"><Basis>{s.exposure_basis}</Basis></div>}
      </Panel>
      <ExceptionDrawer id={openId ? Number(openId) : null} onClose={() => { params.delete('id'); setParams(params) }} assignees={assignees.data ?? []} />
    </div>
  )
}

export function ExceptionDrawer({ id, onClose, assignees }: { id: number | null; onClose: () => void; assignees: { id: number; name: string }[] }) {
  const qc = useQueryClient()
  const { can } = useAuth()
  const d = useQuery({ queryKey: ['exception', id], queryFn: () => api.get<Detail>(`/exceptions/${id}`), enabled: id !== null })
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState('')
  const [err, setErr] = useState('')
  const refresh = () => { qc.invalidateQueries({ queryKey: ['exception', id] }); qc.invalidateQueries({ queryKey: ['exceptions'] }); qc.invalidateQueries({ queryKey: ['exceptions-summary'] }) }
  const run = (fn: () => Promise<unknown>) => async () => { setErr(''); try { await fn(); refresh() } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } }
  const addNote = useMutation({ mutationFn: run(async () => { await api.post(`/exceptions/${id}/notes`, { body: note }); setNote('') }) })
  const assign = useMutation({ mutationFn: (uid: string) => run(() => api.post(`/exceptions/${id}/assign`, { user_id: uid ? Number(uid) : null }))() })
  const status = useMutation({ mutationFn: run(async () => { await api.post(`/exceptions/${id}/status`, { status: target, reason }); setTarget(''); setReason('') }) })
  const e = d.data
  const writable = can('exception:write')
  const [graph, setGraph] = useState(false)
  return (
    <Drawer open={id !== null} onClose={onClose} width="max-w-3xl" title={e ? <span className="flex items-center gap-3">{e.exception_code}<CategoryPill value={e.category} label={e.category_label} /><Pill value={e.status} /></span> : 'Exception'}>
      {d.isLoading && <Spinner />}
      {d.error && <ErrorBox error={d.error} />}
      {e && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold">{e.title}</h3>
            <p className="mt-1 text-sm text-ink-muted">{e.explanation}</p>
            <dl className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div><dt className="text-xs text-ink-muted">Customer</dt><dd>{e.customer?.name ?? '—'}</dd></div>
              <div><dt className="text-xs text-ink-muted">Financial impact</dt><dd className="font-semibold">{inr(e.financial_impact)}</dd></div>
              <div><dt className="text-xs text-ink-muted">Severity</dt><dd><Pill value={e.severity} /></dd></div>
              <div><dt className="text-xs text-ink-muted">Counts toward leakage</dt><dd>{e.counts_toward_leakage ? 'Yes' : 'No'}</dd></div>
              <div><dt className="text-xs text-ink-muted">Billing period</dt><dd>{date(e.period_start)}</dd></div>
              <div><dt className="text-xs text-ink-muted">First detected</dt><dd>{e.first_detected_in.run_code}</dd></div>
              <div><dt className="text-xs text-ink-muted">Last seen</dt><dd>{e.last_seen_in?.run_code ?? '—'}</dd></div>
              <div><dt className="text-xs text-ink-muted">Owner</dt><dd>{e.owner?.name ?? 'Unassigned'}</dd></div>
            </dl>
            {e.obligation_key && <p className="mt-2 font-mono text-[11px] text-ink-faint">Obligation {e.obligation_key}</p>}
            <Button className="mt-3" onClick={() => setGraph(true)}><Network size={15} />Trace evidence graph</Button>
          </div>

          <section>
            <h4 className="mb-2 text-sm font-semibold">Calculation</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              {Object.entries(e.calculation).filter(([k, v]) => v !== null && typeof v !== 'object' && !['rule', 'reconciliation_result_id'].includes(k)).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-space-900/60 px-3 py-2"><div className="text-[11px] text-ink-muted">{titleCase(k)}</div><div className="font-medium">{/amount|expected$|invoiced$|variance|price|allocated|unallocated|outstanding|total|credits/.test(k) && !Number.isNaN(Number(v)) ? inr(String(v), { decimals: 2 }) : String(v)}</div></div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold">Source evidence ({e.evidence.length})</h4>
            <ul className="space-y-1.5">
              {e.evidence.map((ev) => (
                <li key={ev.id} className="rounded-lg border border-panel-line bg-space-900/50 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2"><span className="chip bg-accent-blue/15 text-[10px] uppercase text-accent-blueSoft">{ev.type.replace(/_/g, ' ')}</span><span className="text-[11px] text-ink-faint">{ev.table} #{ev.record_id}</span></div>
                  <div className="mt-1">{ev.summary}</div>
                </li>
              ))}
            </ul>
          </section>

          {err && <ErrorBox error={new Error(err)} />}
          {writable && (
            <section className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><UserPlus size={15} />Assign investigator</h4>
                <Select label="Assignee" value={String(e.owner?.id ?? '')} onChange={(v) => assign.mutate(v)} className="w-full"
                  options={[{ value: '', label: 'Unassigned' }, ...assignees.map((a) => ({ value: String(a.id), label: a.name }))]} />
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Change status</h4>
                <div className="flex gap-2">
                  <Select label="New status" value={target} onChange={setTarget} className="flex-1"
                    options={[{ value: '', label: 'Select…' }, ...['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].filter((s) => s !== e.status).map((s) => ({ value: s, label: titleCase(s) }))]} />
                  <Button variant="red" disabled={!target || ((target === 'RESOLVED' || target === 'DISMISSED') && reason.trim().length < 10)} loading={status.isPending} onClick={() => status.mutate()}>Apply</Button>
                </div>
                {(target === 'RESOLVED' || target === 'DISMISSED') && (
                  <textarea className="input mt-2" rows={2} placeholder="Resolution reason (required, min. 10 characters)" value={reason} onChange={(ev) => setReason(ev.target.value)} aria-label="Resolution reason" />
                )}
              </div>
            </section>
          )}

          <section>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText size={15} />Investigation notes</h4>
            <ul className="space-y-2">
              {e.notes.map((n) => <li key={n.id} className="rounded-lg bg-space-900/60 p-3 text-sm"><div className="mb-1 text-[11px] text-ink-muted">{n.author} · {dateTime(n.created_at)}</div>{n.body}</li>)}
              {!e.notes.length && <li className="text-sm text-ink-muted">No notes yet.</li>}
            </ul>
            {writable && (
              <div className="mt-2 flex gap-2">
                <textarea className="input" rows={2} placeholder="Add a timestamped note…" value={note} onChange={(ev) => setNote(ev.target.value)} aria-label="New note" />
                <Button onClick={() => addNote.mutate()} disabled={note.trim().length < 2} loading={addNote.isPending}>Add note</Button>
              </div>
            )}
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold">Status history</h4>
            <ol className="space-y-1 text-sm">
              {e.history.map((h, i) => <li key={i} className="text-ink-muted"><span className="text-ink">{h.from ? `${titleCase(h.from)} → ` : ''}{titleCase(h.to)}</span> · {h.by ?? 'system'} · {dateTime(h.at)}{h.reason && <> — <i>{h.reason}</i></>}</li>)}
            </ol>
          </section>
        </div>
      )}
      <EvidenceGraphModal open={graph} onClose={() => setGraph(false)} query={id ? { exception_id: id } : null} />
    </Drawer>
  )
}
