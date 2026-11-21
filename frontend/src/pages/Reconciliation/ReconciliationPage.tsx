import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, GitCompare, History, Info, Play, Search, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatedValue, Basis, Button, Drawer, Empty, ErrorBox, Modal, Pager, Panel, Pill, Select, Spinner, Stagger, StaggerItem, Tabs } from '@/components/ui'
import { PageTitle } from '@/layouts/AppLayout'
import { api, type Paged } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { date, dateTime, inr, num, pct, titleCase } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'
import { FlowPanel } from './FlowPanel'
import { RunTools } from './RunTools'

export interface AuditRun {
  id: string; run_code: string; run_type: string; status: string; period_start: string; period_end: string; as_of_date: string
  expected_total: string; invoiced_total: string; variance_total: string; underbilled_total: string; overbilled_total: string
  reconciliation_rate: string | null; is_stale?: boolean; completed_at: string | null; created_at: string; error_message: string
  scope: { customer_ids: number[]; product_ids: number[] }; replay_of_run_id: string | null
  summary: { matched_records?: number; unmatched_records?: number; obligations_in_scope?: number; excluded_obligations?: number; unmatched_invoice_lines?: number; status_counts?: Record<string, number>; exceptions?: { created: number; refreshed: number; by_category: Record<string, number> }; payments?: Record<string, unknown> }
  readiness: Readiness
}
interface Readiness { status: string; obligations: number; excluded_obligations: number; customers_in_scope: number; checks: { code: string; severity: string; title: string; message: string; count: number; affected_customers?: { id: number; code: string; name: string }[] }[] }
interface Result {
  id: number; obligation_key: string | null; customer: { id: number; code: string; name: string }; product: { code: string | null; name: string | null }
  charge_type: string; period_start: string; status: string; expected_amount: string; invoiced_amount: string; variance: string
  expected_quantity: string | null; invoiced_quantity: string | null; expected_unit_price: string | null; invoiced_unit_price: string | null
  match_method: string; match_confidence: string; explanation: string; subscription_code: string | null; invoice_numbers: string[]
}
interface Reference { customers: { id: number; customer_code: string; name: string }[]; products: { id: number; product_code: string; name: string }[] }

type Tab = 'full' | 'contract-usage' | 'usage-invoice' | 'payments'

export default function ReconciliationPage() {
  const { period } = usePeriod()
  const { can } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [customer, setCustomer] = useState('')
  const [product, setProduct] = useState('')
  const [tab, setTab] = useState<Tab>('full')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [runErr, setRunErr] = useState('')
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api.get<Reference>('/metrics/reference') })
  const scope = { customer_ids: customer || undefined, product_ids: product || undefined }
  const readiness = useQuery({ queryKey: ['readiness', period, customer, product], queryFn: () => api.get<Readiness>('/audits/readiness', { ...periodParams(period), ...scope }) })
  const runs = useQuery({
    queryKey: ['runs', period.start], queryFn: () => api.get<Paged<AuditRun>>('/audits', { period_start: period.start, page_size: 50 }),
    refetchInterval: (q) => (q.state.data?.items.some((r) => ['QUEUED', 'RUNNING'].includes(r.status)) ? 1500 : false),
  })
  const runId = params.get('run') ?? runs.data?.items.find((r) => r.period_end === period.end && r.run_type !== 'REPLAY' && ['COMPLETED', 'COMPLETED_WITH_EXCLUSIONS'].includes(r.status))?.id
    ?? runs.data?.items[0]?.id
  const run = runs.data?.items.find((r) => r.id === runId)
  useEffect(() => setPage(1), [tab, statusFilter, search, runId])
  const results = useQuery({
    queryKey: ['results', runId, tab, statusFilter, search, page, customer, product],
    queryFn: () => api.get<Paged<Result>>(`/audits/${runId}/results`, { tab: tab === 'payments' ? 'full' : tab, status: statusFilter, search, page, page_size: 20, customer_id: customer, product_id: product }),
    enabled: !!runId && tab !== 'payments' && !!run && ['COMPLETED', 'COMPLETED_WITH_EXCLUSIONS'].includes(run.status),
  })
  const start = useMutation({
    mutationFn: () => api.post<AuditRun & { reused: boolean }>('/audits', { period_start: period.start, period_end: period.end, customer_ids: customer ? [Number(customer)] : null, product_ids: product ? [Number(product)] : null }),
    onMutate: () => setRunErr(''),
    onSuccess: (r) => { params.set('run', r.id); setParams(params); qc.invalidateQueries({ queryKey: ['runs'] }); qc.invalidateQueries({ queryKey: ['metrics-summary'] }); qc.invalidateQueries({ queryKey: ['exceptions-summary'] }) },
    onError: (e) => setRunErr(e instanceof Error ? e.message : 'Audit failed to start'),
  })
  const busy = run && ['QUEUED', 'RUNNING'].includes(run.status)
  useEffect(() => { if (run && !busy) { qc.invalidateQueries({ queryKey: ['metrics-summary'] }); qc.invalidateQueries({ queryKey: ['exceptions-summary'] }); qc.invalidateQueries({ queryKey: ['onboarding'] }) } }, [run?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = run?.summary
  const cards = [
    { label: 'Expected Charges', value: run?.expected_total, money: true },
    { label: 'Invoiced Amount', value: run?.invoiced_total, money: true },
    { label: 'Variance', value: run?.variance_total, money: true, red: true },
    { label: 'Reconciliation Rate', value: run?.reconciliation_rate, pct: true },
    { label: 'Matched Records', value: s?.matched_records },
    { label: 'Unmatched Records', value: s?.unmatched_records, red: true },
  ]
  return (
    <div>
      <PageTitle first="Revenue" accent="Reconciliation" subtitle="Compare contract, usage and invoiced amounts"
        actions={<>
          <RunTools run={run} />
          <Button onClick={() => setHistoryOpen(true)}><History size={16} />Audit History</Button>
          <Button onClick={() => setCompareOpen(true)} disabled={(runs.data?.items.length ?? 0) < 2}><GitCompare size={16} />Compare Runs</Button>
        </>} />
      <Panel className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Select label="Customer scope" value={customer} onChange={setCustomer} options={[{ value: '', label: 'All Customers' }, ...(ref.data?.customers ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} className="max-w-[230px]" />
        <Select label="Product scope" value={product} onChange={setProduct} options={[{ value: '', label: 'All Products' }, ...(ref.data?.products ?? []).map((p) => ({ value: String(p.id), label: p.name }))]} />
        <span className="rounded-lg border border-panel-border px-3 py-1.5 text-[13px] text-ink-muted">{period.label}</span>
        <span className="text-[13px] text-ink-muted">Audit: {run ? <><b className="text-ink">{run.run_code}</b> <Pill value={run.status} />{run.is_stale && <Pill value="MEDIUM" label="stale" className="ml-1" />}</> : 'none yet'}</span>
        <div className="flex-1" />
        {can('audit:run') && <Button variant="red" onClick={() => start.mutate()} loading={start.isPending || !!busy}><Play size={15} />{busy ? 'Running…' : 'Run Audit'}</Button>}
      </Panel>
      {runErr && <ErrorBox error={new Error(runErr)} />}
      {run?.status === 'FAILED' && <ErrorBox error={new Error(`Audit failed: ${run.error_message}`)} />}

      <ReadinessPanel data={readiness.data} loading={readiness.isLoading} />

      <Stagger className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map((c) => (
          <StaggerItem key={c.label}>
            <Panel tilt as="div" red={c.red && !!c.value && Number(c.value) !== 0} className="p-3.5 text-center">
              <div className="text-[13px] text-ink">{c.label}</div>
              <div className="mt-1 text-[22px] font-bold">
                {c.value === undefined || c.value === null ? '—' : <AnimatedValue value={Number(c.value)} format={(n) => c.money ? inr(n, { decimals: 0 }) : c.pct ? `${n.toFixed(2)}%` : Math.round(n).toLocaleString('en-IN')} />}
              </div>
            </Panel>
          </StaggerItem>
        ))}
      </Stagger>

      {run && <FlowPanel run={run} />}

      <Panel className="mt-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-panel-line p-3">
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'full', label: 'Reconciliation Details' }, { key: 'contract-usage', label: 'Contract vs Usage' }, { key: 'usage-invoice', label: 'Usage vs Invoice' }, { key: 'payments', label: 'Invoice vs Payments' }]} />
          <div className="flex-1" />
          {tab !== 'payments' && <>
            <div className="relative w-60"><Search size={14} className="absolute left-3 top-2.5 text-ink-faint" /><input className="input py-1.5 pl-8 text-[13px]" placeholder="Customer or obligation…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search results" /></div>
            <Select label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'All statuses' }, ...['MATCHED', 'PARTIALLY_MATCHED', 'UNDERBILLED', 'OVERBILLED', 'MISSING_CHARGE', 'PENDING_REVIEW', 'EXCLUDED'].map((v) => ({ value: v, label: `${titleCase(v)}${s?.status_counts?.[v] ? ` (${s.status_counts[v]})` : ''}` }))]} />
          </>}
        </div>
        {!run && !runs.isLoading && <Empty title="No audit has been run for this period" hint="Check data readiness above, then click Run Audit." />}
        {busy && <Spinner label={`Audit ${run?.run_code} is ${run?.status.toLowerCase()} — reconstructing expected charges and matching invoices…`} />}
        {tab === 'payments' && run && !busy ? <PaymentsTab runId={run.id} /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5"><th>Customer</th><th>Product / Charge</th><th>Period</th>
                  {tab === 'contract-usage' ? <><th className="text-right">Billable usage</th><th className="text-right">Contract value</th></> : <th className="text-right">Contract Value</th>}
                  <th className="text-right">Invoiced</th><th className="text-right">Variance</th><th>Status</th><th>Match</th></tr></thead>
                <tbody>
                  {results.isLoading && <tr><td colSpan={9}><Spinner /></td></tr>}
                  {results.data?.items.length === 0 && <tr><td colSpan={9}><Empty title="No records for this filter" /></td></tr>}
                  {results.data?.items.map((r) => (
                    <tr key={r.id} className="row-hover cursor-pointer border-b border-panel-line [&>td]:px-3 [&>td]:py-2" onClick={() => setDetail(r.id)}>
                      <td><div className="font-medium">{r.customer.name}</div><div className="text-[11px] text-ink-faint">{r.subscription_code ?? r.invoice_numbers.join(', ')}</div></td>
                      <td>{r.product.name ?? '—'} <span className="text-ink-faint">· {titleCase(r.charge_type)}</span></td>
                      <td className="whitespace-nowrap text-ink-muted">{date(r.period_start)}</td>
                      {tab === 'contract-usage' && <td className="text-right">{num(r.expected_quantity, 2)}</td>}
                      <td className="text-right">{inr(r.expected_amount)}</td>
                      <td className="text-right">{inr(r.invoiced_amount)}</td>
                      <td className={cn('text-right font-semibold', Number(r.variance) < 0 ? 'text-[#ff6b7d]' : Number(r.variance) > 0 ? 'text-[#fbbf24]' : 'text-ink-muted')}>{inr(r.variance, { sign: true })}</td>
                      <td><Pill value={r.status} /></td>
                      <td className="text-[11px] text-ink-muted">{titleCase(r.match_method) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.data && <Pager page={results.data.page} pages={results.data.pages} total={results.data.total} onPage={setPage} />}
          </>
        )}
        {run && <div className="border-t border-panel-line px-4 py-2"><Basis>Variance = invoiced − expected at billing-obligation grain (negative = underbilled). Audit {run.run_code} · engine as of {run.as_of_date} · {run.summary.excluded_obligations ?? 0} obligation(s) excluded with reasons.</Basis></div>}
      </Panel>

      <ResultDetail runId={runId} resultId={detail} onClose={() => setDetail(null)} />
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} runs={runs.data?.items ?? []} onPick={(id) => { params.set('run', id); setParams(params); setHistoryOpen(false) }} current={runId} />
      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} runs={runs.data?.items ?? []} />
    </div>
  )
}

function ReadinessPanel({ data, loading }: { data?: Readiness; loading: boolean }) {
  const [open, setOpen] = useState(false)
  if (loading || !data) return <Panel className="p-3"><Spinner label="Checking data readiness…" /></Panel>
  const icon = (sev: string) => sev === 'OK' ? <CheckCircle2 size={16} className="text-accent-green" /> : sev === 'ERROR' ? <XCircle size={16} className="text-accent-red" /> : sev === 'WARNING' ? <AlertTriangle size={16} className="text-accent-amber" /> : <Info size={16} className="text-accent-blueSoft" />
  return (
    <Panel className="p-3">
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-sm font-semibold">Data Readiness</span>
        <Pill value={data.status === 'READY' ? 'COMPLETED' : data.status === 'INCOMPLETE' ? 'FAILED' : 'COMPLETED_WITH_EXCLUSIONS'} label={titleCase(data.status)} />
        <span className="text-xs text-ink-muted">{data.obligations} billing obligations · {data.customers_in_scope} customers · {data.excluded_obligations} will be excluded with a reason</span>
        <span className="ml-auto text-xs text-accent-blueSoft">{open ? 'Hide checks' : 'Show checks'}</span>
      </button>
      {open && (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {data.checks.map((c) => (
            <li key={c.code} className="flex gap-2 rounded-lg bg-space-900/60 p-2.5 text-[13px]">
              {icon(c.severity)}
              <div><div className="font-medium">{c.title}</div><div className="text-xs text-ink-muted">{c.message}</div>
                {c.affected_customers?.length ? <div className="mt-1 text-[11px] text-ink-faint">e.g. {c.affected_customers.map((a) => a.name).join(', ')}</div> : null}</div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

interface PayRec { id: number; record_type: string; status: string; issue_code: string; customer: { name: string | null }; invoice_number: string | null; payment_number: string | null; invoice_total: string | null; credits_applied: string | null; payments_allocated: string | null; outstanding: string | null; payment_amount: string | null; unallocated_amount: string | null; ageing_bucket: string; explanation: string }
function PaymentsTab({ runId }: { runId: string }) {
  const [type, setType] = useState<'INVOICE' | 'PAYMENT'>('INVOICE')
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['payrec', runId, type, page], queryFn: () => api.get<Paged<PayRec>>(`/audits/${runId}/payments`, { record_type: type, page, page_size: 20 }) })
  return (
    <div>
      <div className="flex gap-2 p-3"><Tabs value={type} onChange={(t) => { setType(t); setPage(1) }} tabs={[{ key: 'INVOICE', label: 'Invoice balances' }, { key: 'PAYMENT', label: 'Payment allocations' }]} /></div>
      <table className="w-full text-[13px]">
        <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2">{type === 'INVOICE'
          ? <><th>Invoice</th><th>Customer</th><th className="text-right">Total</th><th className="text-right">Credits</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th><th>Ageing</th><th>Status</th></>
          : <><th>Payment</th><th>Customer</th><th className="text-right">Amount</th><th className="text-right">Allocated</th><th className="text-right">Unallocated</th><th>Status</th><th>Explanation</th></>}</tr></thead>
        <tbody>
          {q.data?.items.map((r) => type === 'INVOICE' ? (
            <tr key={r.id} className="row-hover border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td>{r.invoice_number}</td><td>{r.customer.name}</td><td className="text-right">{inr(r.invoice_total)}</td><td className="text-right">{inr(r.credits_applied)}</td><td className="text-right">{inr(r.payments_allocated)}</td><td className="text-right font-semibold">{inr(r.outstanding)}</td><td>{r.ageing_bucket || '—'}</td><td><Pill value={r.status} /></td></tr>
          ) : (
            <tr key={r.id} className="row-hover border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td>{r.payment_number}</td><td>{r.customer.name ?? 'Unidentified'}</td><td className="text-right">{inr(r.payment_amount)}</td><td className="text-right">{inr(r.payments_allocated)}</td><td className="text-right">{inr(r.unallocated_amount)}</td><td><Pill value={r.status === 'DISCREPANCY' ? 'FAILED' : r.status} label={titleCase(r.status)} /></td><td className="max-w-md text-xs text-ink-muted">{r.explanation}</td></tr>
          ))}
        </tbody>
      </table>
      {q.data && <Pager page={q.data.page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
      <div className="px-4 pb-2"><Basis>Payment reconciliation runs independently of billing reconciliation. Overdue balances are reported by ageing bucket and are not treated as discrepancies. Payments are UNVERIFIED unless bank-confirmed.</Basis></div>
    </div>
  )
}

interface ResultDetailData {
  result: Record<string, string | null> & { status: string; explanation: string }
  customer: { name: string; code: string }
  obligation: { key: string; charge_type: string; period_start: string; period_end: string; subscription_code: string; quantity: string; billing_frequency: string } | null
  components: { seq: number; type: string; segment_start: string; segment_end: string; quantity: string; unit_price: string; amount: string; formula: string; inputs: Record<string, unknown> }[]
  expected_total: string
  invoice_lines: { id: number; invoice_number: string; line_number: number; description: string; quantity: string; unit_price: string; discount_pct: string; line_amount: string; billing_obligation_ref: string | null; source_batch_id: number | null; source_row_number: number | null }[]
  audit: { run_code: string; engine_version: string }
}
function ResultDetail({ runId, resultId, onClose }: { runId?: string; resultId: number | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['result', runId, resultId], queryFn: () => api.get<ResultDetailData>(`/audits/${runId}/results/${resultId}`), enabled: !!runId && resultId !== null })
  const d = q.data
  return (
    <Modal open={resultId !== null} onClose={onClose} wide title={d ? <span className="flex items-center gap-3">{d.customer.name}<Pill value={d.result.status} /></span> : 'Calculation detail'}>
      {q.isLoading && <Spinner />}
      {d && (
        <div className="space-y-5 text-sm">
          <p className="text-ink-muted">{d.result.explanation}</p>
          {d.obligation && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><div className="text-xs text-ink-muted">Obligation</div><div className="font-mono text-xs">{d.obligation.key}</div></div>
            <div><div className="text-xs text-ink-muted">Subscription</div>{d.obligation.subscription_code} · qty {num(d.obligation.quantity)}</div>
            <div><div className="text-xs text-ink-muted">Billing period</div>{date(d.obligation.period_start)} – {date(d.obligation.period_end)} ({titleCase(d.obligation.billing_frequency)})</div>
            <div><div className="text-xs text-ink-muted">Audit</div>{d.audit.run_code} · engine {d.audit.engine_version}</div>
          </div>}
          <div>
            <h4 className="mb-2 font-semibold">Expected charge calculation</h4>
            <table className="w-full"><thead><tr className="table-head [&>th]:px-2 [&>th]:py-1.5"><th>#</th><th>Component</th><th>Segment</th><th>Formula</th><th>Version / rule</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{d.components.map((c) => <tr key={c.seq} className="border-b border-panel-line [&>td]:px-2 [&>td]:py-1.5"><td>{c.seq}</td><td>{titleCase(c.type)}</td><td className="whitespace-nowrap">{date(c.segment_start, false)}–{date(c.segment_end, false)}</td><td className="font-mono text-xs">{c.formula}</td><td className="text-xs text-ink-muted">v{String(c.inputs.contract_version ?? '—')} · {String(c.inputs.pricing_rule ?? '')}</td><td className="text-right">{inr(c.amount, { decimals: 2 })}</td></tr>)}
                <tr className="font-semibold [&>td]:px-2 [&>td]:py-1.5"><td colSpan={5} className="text-right">Expected total</td><td className="text-right">{inr(d.expected_total, { decimals: 2 })}</td></tr></tbody></table>
          </div>
          <div>
            <h4 className="mb-2 font-semibold">Matched invoice lines</h4>
            {d.invoice_lines.length === 0 ? <p className="text-ink-muted">No invoice charge matched this obligation.</p> : (
              <table className="w-full"><thead><tr className="table-head [&>th]:px-2 [&>th]:py-1.5"><th>Invoice</th><th>Line</th><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Disc %</th><th className="text-right">Amount</th><th>Lineage</th></tr></thead>
                <tbody>{d.invoice_lines.map((l) => <tr key={l.id} className="border-b border-panel-line [&>td]:px-2 [&>td]:py-1.5"><td>{l.invoice_number}</td><td>{l.line_number}</td><td>{l.description}</td><td className="text-right">{num(l.quantity, 2)}</td><td className="text-right">{inr(l.unit_price, { decimals: 2 })}</td><td className="text-right">{num(l.discount_pct, 2)}</td><td className="text-right">{inr(l.line_amount, { decimals: 2 })}</td><td className="text-[11px] text-ink-faint">{l.source_batch_id ? `batch ${l.source_batch_id} row ${l.source_row_number}` : 'in-app'}</td></tr>)}</tbody></table>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function HistoryDrawer({ open, onClose, runs, onPick, current }: { open: boolean; onClose: () => void; runs: AuditRun[]; onPick: (id: string) => void; current?: string }) {
  return (
    <Drawer open={open} onClose={onClose} title="Audit history">
      <ul className="space-y-2">
        {runs.map((r) => (
          <li key={r.id}><button onClick={() => onPick(r.id)} className={cn('panel w-full p-3 text-left text-sm', r.id === current && 'ring-1 ring-accent-red/60')}>
            <div className="flex items-center justify-between"><b>{r.run_code}</b><Pill value={r.status} /></div>
            <div className="mt-1 text-xs text-ink-muted">{date(r.period_start)} – {date(r.period_end)} · as of {date(r.as_of_date)} · {r.run_type}{r.is_stale ? ' · stale' : ''}</div>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs"><span>Expected {inr(r.expected_total)}</span><span>Under {inr(r.underbilled_total)}</span><span>Rate {pct(r.reconciliation_rate, 2)}</span></div>
            <div className="mt-1 text-[11px] text-ink-faint">Completed {dateTime(r.completed_at)}</div>
          </button></li>
        ))}
        {!runs.length && <Empty title="No audits for this period yet" />}
      </ul>
    </Drawer>
  )
}

interface Compare { base: AuditRun; comparison: AuditRun; totals: Record<string, string>; counts: Record<string, number>; resolved: { obligation_key: string; status: string }[]; remaining: { obligation_key: string; status: string; variance: string }[]; newly_detected: { obligation_key: string; status: string; variance: string }[] }
function CompareModal({ open, onClose, runs }: { open: boolean; onClose: () => void; runs: AuditRun[] }) {
  const done = useMemo(() => runs.filter((r) => ['COMPLETED', 'COMPLETED_WITH_EXCLUSIONS'].includes(r.status)), [runs])
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  useEffect(() => { if (done.length >= 2) { setA(done[1].id); setB(done[0].id) } }, [done.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const q = useQuery({ queryKey: ['compare', a, b], queryFn: () => api.get<Compare>(`/audits/${a}/compare/${b}`), enabled: open && !!a && !!b && a !== b })
  const opts = done.map((r) => ({ value: r.id, label: `${r.run_code} · ${date(r.completed_at)}` }))
  return (
    <Modal open={open} onClose={onClose} wide title="Compare audit runs">
      <div className="mb-4 flex items-center gap-3"><Select label="Base run" value={a} onChange={setA} options={opts} /><span>→</span><Select label="Comparison run" value={b} onChange={setB} options={opts} /></div>
      {q.isLoading && <Spinner />}
      {q.data && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[['Resolved', q.data.counts.resolved, 'text-accent-green'], ['Remaining', q.data.counts.remaining, 'text-accent-amber'], ['Newly detected', q.data.counts.newly_detected, 'text-accent-red'], ['Amount changed', q.data.counts.amount_changed, 'text-accent-blueSoft']].map(([l, v, c]) => (
              <Panel key={l as string} as="div" className="p-3 text-center"><div className="text-xs text-ink-muted">{l}</div><div className={cn('text-2xl font-bold', c as string)}>{v}</div></Panel>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">{Object.entries(q.data.totals).map(([k, v]) => <div key={k} className="rounded-lg bg-space-900/60 p-2"><div className="text-ink-muted">{titleCase(k)}</div><div className="text-sm font-semibold">{inr(v, { sign: true })}</div></div>)}</div>
          {(['resolved', 'remaining', 'newly_detected'] as const).map((k) => (
            <div key={k}><h4 className="mb-1 font-semibold">{titleCase(k)} ({q.data[k].length})</h4>
              <div className="max-h-40 overflow-y-auto scroll-thin">{q.data[k].map((r) => <div key={r.obligation_key} className="flex justify-between border-b border-panel-line py-1 text-xs"><span className="font-mono">{r.obligation_key}</span><Pill value={r.status} /></div>)}</div></div>
          ))}
        </div>
      )}
    </Modal>
  )
}
