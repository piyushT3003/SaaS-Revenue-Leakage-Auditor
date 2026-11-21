import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FilePlus2, FileText, PlusCircle, Receipt, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatedValue, Basis, Button, Drawer, Empty, Modal, Pager, Panel, Pill, Select, Spinner, Stagger, StaggerItem, Tabs } from '@/components/ui'
import { PageTitle } from '@/layouts/AppLayout'
import { api, type Paged } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { date, inr, num, titleCase } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'

interface Summary { invoiced_amount: { value: string; basis: string }; payments_received: { value: string; basis: string }; outstanding: { value: string; basis: string }; collection_rate: { value: string | null; basis: string; formula: string }; ageing: { bucket: string; amount: string; invoices: number }[]; unallocated_cash: string; as_of: string }
interface InvoiceRow { id: number; number: string; customer: { id: number; name: string }; issue_date: string; due_date: string; status: string; total: string; outstanding: string | null; payment_status: string; ageing_bucket: string; days_past_due: number }
interface PaymentRow { id: number; number: string; customer: string | null; customer_id: number | null; received_on: string; amount: string; method: string; reference: string; allocated: string; unallocated: string; allocation_state: string; source: string; verification_status: string }
interface CreditRow { id: number; number: string; customer: string; invoice: string | null; type: string; amount: string; reason: string; status: string; effective_date: string }
type T = 'invoices' | 'payments' | 'credits'

export default function BillingPage() {
  const { period } = usePeriod()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<T>((params.get('tab') as T) ?? 'invoices')
  const [ageing, setAgeing] = useState('')
  const [draftOpen, setDraftOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const summary = useQuery({ queryKey: ['billing-summary', period], queryFn: () => api.get<Summary>('/billing/summary', periodParams(period)) })
  const s = summary.data
  const cards = [
    { label: 'Invoiced Amount', value: s?.invoiced_amount.value, cls: '' },
    { label: 'Payments Received', value: s?.payments_received.value, cls: '' },
    { label: 'Outstanding', value: s?.outstanding.value, cls: 'red' },
    { label: 'Collection Rate', value: s?.collection_rate.value, pct: true, cls: 'green' },
  ]
  const invoiceId = params.get('invoice')
  return (
    <div>
      <PageTitle first="Billing &" accent="Payments" subtitle="Invoice generation, payment tracking and collections"
        actions={can('finance:correct') && <><Button onClick={() => setDraftOpen(true)}><FilePlus2 size={16} />Draft invoice</Button><Button onClick={() => setPayOpen(true)}><PlusCircle size={16} />Record payment</Button><Button onClick={() => setCreditOpen(true)}><Receipt size={16} />Credit / adjustment</Button></>} />
      <Tabs value={tab} onChange={(t) => { setTab(t); params.set('tab', t); setParams(params) }} className="mb-4"
        tabs={[{ key: 'invoices', label: 'Invoices' }, { key: 'payments', label: 'Payments' }, { key: 'credits', label: 'Credits & Adjustments' }]} />
      <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <StaggerItem key={c.label}>
            <Panel tilt as="div" red={c.cls === 'red'} className={cn('p-4 text-center', c.cls === 'green' && 'border-accent-green/40')}>
              <div className="text-[15px] text-ink">{c.label}</div>
              <div className={cn('mt-1 text-[28px] font-bold', c.cls === 'green' && 'text-[#4ade80]')}>{c.value === undefined ? '…' : <AnimatedValue value={c.value === null ? null : Number(c.value)} format={(n) => c.pct ? `${n.toFixed(1)}%` : inr(n, { decimals: 0 })} />}</div>
            </Panel>
          </StaggerItem>
        ))}
      </Stagger>
      {s && <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-4 px-1">{[s.invoiced_amount.basis, s.payments_received.basis, s.outstanding.basis, s.collection_rate.basis].map((b, i) => <Basis key={i}>{b}</Basis>)}</div>}

      {tab === 'invoices' && (
        <>
          <Panel className="mt-4 p-4">
            <div className="mb-2 flex items-center justify-between"><h3 className="panel-title">Ageing analysis <span className="text-xs font-normal text-ink-muted">as of {date(s?.as_of)} · click a bucket to filter</span></h3>{ageing && <button className="text-xs text-accent-blueSoft" onClick={() => setAgeing('')}>Clear filter</button>}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {s?.ageing.map((a) => (
                <button key={a.bucket} onClick={() => setAgeing(ageing === a.bucket ? '' : a.bucket)} className={cn('rounded-lg border p-3 text-left transition', ageing === a.bucket ? 'border-accent-red bg-accent-red/10' : 'border-panel-border bg-space-900/50 hover:border-accent-blueSoft/60')}>
                  <div className="text-xs text-ink-muted">{a.bucket === 'CURRENT' ? 'Current (not due)' : `${a.bucket} days`}</div>
                  <div className="text-lg font-semibold">{inr(a.amount)}</div><div className="text-[11px] text-ink-faint">{a.invoices} invoices</div>
                </button>
              ))}
            </div>
          </Panel>
          <InvoiceRegister ageing={ageing} onOpen={(id) => { params.set('invoice', String(id)); setParams(params) }} />
        </>
      )}
      {tab === 'payments' && <PaymentRegister unallocatedCash={s?.unallocated_cash} />}
      {tab === 'credits' && <CreditRegister />}
      <InvoiceDrawer id={invoiceId ? Number(invoiceId) : null} onClose={() => { params.delete('invoice'); setParams(params) }} />
      <DraftInvoice open={draftOpen} onClose={() => setDraftOpen(false)} />
      <RecordPayment open={payOpen} onClose={() => setPayOpen(false)} />
      <CreateCredit open={creditOpen} onClose={() => setCreditOpen(false)} />
    </div>
  )
}

function InvoiceRegister({ ageing, onOpen }: { ageing: string; onOpen: (id: number) => void }) {
  const { period } = usePeriod()
  const [search, setSearch] = useState('')
  const [pstatus, setPstatus] = useState('')
  const [scope, setScope] = useState<'period' | 'all'>('period')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [search, pstatus, ageing, scope, period])
  const q = useQuery({ queryKey: ['invoices', period, search, pstatus, ageing, scope, page], queryFn: () => api.get<Paged<InvoiceRow>>('/billing/invoices', {
    search, payment_status: pstatus, ageing, page, page_size: 15, ...(scope === 'period' && !ageing ? periodParams(period) : {}) }) })
  return (
    <Panel className="mt-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-panel-line p-3">
        <div className="relative w-64"><Search size={14} className="absolute left-3 top-2.5 text-ink-faint" /><input className="input py-1.5 pl-8 text-[13px]" placeholder="Invoice # or customer…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search invoices" /></div>
        <Select label="Payment status" value={pstatus} onChange={setPstatus} options={[{ value: '', label: 'All payment statuses' }, ...['PAID', 'PENDING', 'PARTIALLY_PAID', 'OVERDUE', 'CREDITED', 'OVER_APPLIED', 'DRAFT', 'VOID'].map((v) => ({ value: v, label: titleCase(v) }))]} />
        <Select label="Scope" value={scope} onChange={(v) => setScope(v as 'period' | 'all')} options={[{ value: 'period', label: 'Issued in period' }, { value: 'all', label: 'All invoices' }]} />
        {ageing && <Pill value="OVERDUE" label={`Ageing ${ageing}`} />}
      </div>
      <table className="w-full text-[13.5px]">
        <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5"><th>Invoice #</th><th>Customer</th><th className="text-right">Amount</th><th>Issue Date</th><th>Due Date</th><th className="text-right">Outstanding</th><th>Payment Status</th><th className="w-10"><span className="sr-only">PDF</span></th></tr></thead>
        <tbody>
          {q.isLoading && <tr><td colSpan={8}><Spinner /></td></tr>}
          {q.data?.items.length === 0 && <tr><td colSpan={8}><Empty title="No invoices" /></td></tr>}
          {q.data?.items.map((i) => (
            <tr key={i.id} className="row-hover cursor-pointer border-b border-panel-line [&>td]:px-3 [&>td]:py-2" onClick={() => onOpen(i.id)}>
              <td className="font-medium">{i.number}</td><td>{i.customer.name}</td><td className="text-right">{inr(i.total)}</td>
              <td>{date(i.issue_date)}</td><td>{date(i.due_date)}</td><td className="text-right">{inr(i.outstanding)}</td>
              <td><Pill value={i.payment_status} />{i.days_past_due > 0 && <span className="ml-2 text-[11px] text-ink-faint">{i.days_past_due}d</span>}</td>
              <td onClick={(e) => e.stopPropagation()}><a href={api.url(`/billing/invoices/${i.id}/pdf`)} download={`${i.number}.pdf`} aria-label={`Download ${i.number} PDF`} className="text-ink-muted hover:text-ink"><Download size={16} /></a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.data && <Pager page={q.data.page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
    </Panel>
  )
}

interface InvoiceDetail { id: number; number: string; status: string; issue_date: string; due_date: string; subtotal: string; tax: string; total: string; void_reason: string; replaces_invoice_id: number | null
  balance: { outstanding: string; paid: string; credits: string; payment_status: string } | null; customer: { id: number; name: string }
  lines: { id: number; line_number: number; product: string | null; subscription: string | null; charge_type: string; description: string; period_start: string; quantity: string; unit_price: string; discount_pct: string; line_amount: string; billing_obligation_ref: string | null }[]
  allocations: { id: number; payment_number: string; amount: string; allocated_on: string }[]; credits: { id: number; number: string; type: string; amount: string; status: string }[]; source: { batch_id: number | null; row: number | null } }

function InvoiceDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [, setParams] = useSearchParams()
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<InvoiceDetail>(`/billing/invoices/${id}`), enabled: id !== null })
  const [preview, setPreview] = useState(false)
  const [edits, setEdits] = useState<Record<number, { quantity?: string; unit_price?: string; discount_pct?: string }>>({})
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const correct = useMutation({
    mutationFn: () => api.post<InvoiceDetail>(`/billing/invoices/${id}/correct`, { reason, lines: Object.entries(edits).map(([k, v]) => ({ line_id: Number(k), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined)) })) }),
    onSuccess: (r) => { setEdits({}); setReason(''); qc.invalidateQueries(); setParams({ invoice: String(r.id) }) },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Correction failed'),
  })
  const issue = useMutation({ mutationFn: () => api.post(`/billing/invoices/${id}/issue`, {}), onSuccess: () => qc.invalidateQueries(), onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  const d = q.data
  return (
    <Drawer open={id !== null} onClose={onClose} width="max-w-4xl" title={d ? <span className="flex items-center gap-3">{d.number}<Pill value={d.status} />{d.balance && <Pill value={d.balance.payment_status} />}</span> : 'Invoice'}>
      {q.isLoading && <Spinner />}
      {d && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><div className="text-xs text-ink-muted">Customer</div>{d.customer.name}</div><div><div className="text-xs text-ink-muted">Issued / due</div>{date(d.issue_date)} / {date(d.due_date)}</div>
            <div><div className="text-xs text-ink-muted">Total (incl. tax)</div><b>{inr(d.total, { decimals: 2 })}</b></div><div><div className="text-xs text-ink-muted">Outstanding</div><b>{d.balance ? inr(d.balance.outstanding, { decimals: 2 }) : '—'}</b></div>
          </div>
          {d.void_reason && <p className="text-[#fbbf24]">{d.void_reason}</p>}
          {d.replaces_invoice_id && <p className="text-ink-muted">Replacement for invoice #{d.replaces_invoice_id}.</p>}
          <div className="flex gap-2"><Button onClick={() => setPreview(!preview)}><FileText size={15} />{preview ? 'Hide' : 'Preview'} PDF</Button><a className="btn-ghost" href={api.url(`/billing/invoices/${d.id}/pdf`)} download={`${d.number}.pdf`}><Download size={15} />Download PDF</a>
            {d.status === 'DRAFT' && can('finance:approve') && <Button variant="red" loading={issue.isPending} onClick={() => issue.mutate()}>Issue invoice</Button>}</div>
          {preview && <iframe title="Invoice PDF preview" src={api.url(`/billing/invoices/${d.id}/pdf`)} className="h-[480px] w-full rounded-lg border border-panel-border bg-white" />}
          <table className="w-full"><thead><tr className="table-head [&>th]:px-2 [&>th]:py-1.5"><th>#</th><th>Description</th><th>Period</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Disc %</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{d.lines.map((l) => {
              const ed = edits[l.id] ?? {}
              const editable = d.status === 'ISSUED' && can('finance:correct')
              const cell = (k: 'quantity' | 'unit_price' | 'discount_pct', v: string) => editable
                ? <input className="input w-24 py-1 text-right text-xs" aria-label={`${k} line ${l.line_number}`} placeholder={v} value={ed[k] ?? ''} onChange={(e) => setEdits({ ...edits, [l.id]: { ...ed, [k]: e.target.value } })} />
                : (k === 'unit_price' ? inr(v, { decimals: 2 }) : num(v, 2))
              return <tr key={l.id} className="border-b border-panel-line [&>td]:px-2 [&>td]:py-1.5"><td>{l.line_number}</td><td>{l.description}<div className="font-mono text-[10px] text-ink-faint">{l.billing_obligation_ref ?? ''}</div></td><td>{date(l.period_start, false)}</td><td className="text-right">{cell('quantity', l.quantity)}</td><td className="text-right">{cell('unit_price', l.unit_price)}</td><td className="text-right">{cell('discount_pct', l.discount_pct)}</td><td className="text-right">{inr(l.line_amount, { decimals: 2 })}</td></tr>
            })}
              <tr className="[&>td]:px-2 [&>td]:py-1"><td colSpan={6} className="text-right text-ink-muted">Subtotal / tax</td><td className="text-right">{inr(d.subtotal, { decimals: 2 })} / {inr(d.tax, { decimals: 2 })}</td></tr></tbody></table>
          {d.status === 'ISSUED' && can('finance:correct') && Object.keys(edits).length > 0 && (
            <Panel className="p-3"><h4 className="mb-2 font-semibold">Authorised correction</h4>
              <p className="mb-2 text-xs text-ink-muted">The original invoice is voided (never edited) and a replacement is issued; payments move to the replacement. Re-run the audit to verify.</p>
              <textarea className="input" rows={2} placeholder="Reason (required, min. 10 characters)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Correction reason" />
              {err && <p className="mt-2 text-[#ff8796]">{err}</p>}
              <div className="mt-2 flex justify-end gap-2"><Button onClick={() => setEdits({})}>Discard</Button><Button variant="red" disabled={reason.trim().length < 10} loading={correct.isPending} onClick={() => correct.mutate()}>Void &amp; reissue</Button></div></Panel>)}
          <div className="grid grid-cols-2 gap-4">
            <div><h4 className="mb-1 font-semibold">Payment allocations</h4>{d.allocations.length ? d.allocations.map((a) => <div key={a.id} className="flex justify-between border-b border-panel-line py-1"><span>{a.payment_number} · {date(a.allocated_on)}</span><span>{inr(a.amount, { decimals: 2 })}</span></div>) : <p className="text-ink-muted">None</p>}</div>
            <div><h4 className="mb-1 font-semibold">Credits</h4>{d.credits.length ? d.credits.map((c) => <div key={c.id} className="flex justify-between border-b border-panel-line py-1"><span>{c.number} · {titleCase(c.type)} <Pill value={c.status} /></span><span>{inr(c.amount, { decimals: 2 })}</span></div>) : <p className="text-ink-muted">None</p>}</div>
          </div>
          <Basis>Lineage: {d.source.batch_id ? `import batch ${d.source.batch_id}, row ${d.source.row}` : 'created in-app'}</Basis>
        </div>
      )}
    </Drawer>
  )
}

function PaymentRegister({ unallocatedCash }: { unallocatedCash?: string }) {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)
  const [alloc, setAlloc] = useState<PaymentRow | null>(null)
  useEffect(() => setPage(1), [search, state])
  const q = useQuery({ queryKey: ['payments', search, state, page], queryFn: () => api.get<Paged<PaymentRow>>('/billing/payments', { search, allocation: state, page, page_size: 15 }) })
  return (
    <Panel className="mt-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-panel-line p-3">
        <div className="relative w-64"><Search size={14} className="absolute left-3 top-2.5 text-ink-faint" /><input className="input py-1.5 pl-8 text-[13px]" placeholder="Payment #, reference, customer…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search payments" /></div>
        <Select label="Allocation" value={state} onChange={setState} options={[{ value: '', label: 'All' }, { value: 'ALLOCATED', label: 'Fully allocated' }, { value: 'PARTIAL', label: 'Partially allocated' }, { value: 'UNALLOCATED', label: 'Unallocated' }]} />
        <span className="ml-auto text-xs text-ink-muted">Unapplied cash across all payments: <b className="text-ink">{inr(unallocatedCash)}</b></span>
      </div>
      <table className="w-full text-[13.5px]">
        <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5"><th>Payment #</th><th>Customer</th><th>Received</th><th>Method / ref</th><th className="text-right">Amount</th><th className="text-right">Unallocated</th><th>Allocation</th><th>Verification</th><th /></tr></thead>
        <tbody>
          {q.isLoading && <tr><td colSpan={9}><Spinner /></td></tr>}
          {q.data?.items.map((p) => (
            <tr key={p.id} className="row-hover border-b border-panel-line [&>td]:px-3 [&>td]:py-2">
              <td className="font-medium">{p.number}</td><td>{p.customer ?? 'Unidentified'}</td><td>{date(p.received_on)}</td>
              <td className="text-xs text-ink-muted">{titleCase(p.method)}<div className="font-mono">{p.reference}</div></td>
              <td className="text-right">{inr(p.amount)}</td><td className="text-right">{inr(p.unallocated)}</td>
              <td><Pill value={p.allocation_state} /></td><td><Pill value={p.verification_status} /><div className="text-[10px] text-ink-faint">{titleCase(p.source)}</div></td>
              <td>{can('finance:correct') && Number(p.unallocated) > 0 && p.customer_id && <button className="btn-ghost py-1 text-xs" onClick={() => setAlloc(p)}>Allocate</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.data && <Pager page={q.data.page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
      <div className="px-4 pb-2"><Basis>No payment gateway is connected. Payments are imported or entered internally and stay UNVERIFIED until confirmed against a bank statement.</Basis></div>
      <AllocateModal payment={alloc} onClose={() => setAlloc(null)} />
    </Panel>
  )
}

function AllocateModal({ payment, onClose }: { payment: PaymentRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [inv, setInv] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const open = useQuery({ queryKey: ['open-invoices', payment?.customer_id], enabled: !!payment,
    queryFn: () => api.get<Paged<InvoiceRow>>('/billing/invoices', { customer_id: payment!.customer_id!, payment_status: 'PENDING,PARTIALLY_PAID,OVERDUE', page_size: 100 }) })
  const m = useMutation({ mutationFn: () => api.post(`/billing/payments/${payment!.id}/allocate`, { invoice_id: Number(inv), amount }),
    onSuccess: () => { qc.invalidateQueries(); setInv(''); setAmount(''); onClose() }, onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  return (
    <Modal open={!!payment} onClose={onClose} title={`Allocate ${payment?.number ?? ''}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="red" disabled={!inv || !(Number(amount) > 0)} loading={m.isPending} onClick={() => m.mutate()}>Allocate</Button></>}>
      <p className="mb-3 text-sm text-ink-muted">Unallocated: <b className="text-ink">{inr(payment?.unallocated, { decimals: 2 })}</b>. Partial allocations are allowed; you cannot exceed the payment's unallocated amount or the invoice's outstanding balance.</p>
      <label className="label" htmlFor="alloc-inv">Invoice</label>
      <select id="alloc-inv" className="input" value={inv} onChange={(e) => { setInv(e.target.value); const i = open.data?.items.find((x) => String(x.id) === e.target.value); if (i && payment) setAmount(String(Math.min(Number(i.outstanding), Number(payment.unallocated)).toFixed(2))) }}>
        <option value="">Select an open invoice…</option>
        {open.data?.items.map((i) => <option key={i.id} value={i.id}>{i.number} · outstanding {inr(i.outstanding, { decimals: 2 })}</option>)}
      </select>
      <label className="label mt-3" htmlFor="alloc-amt">Amount</label>
      <input id="alloc-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      {err && <p className="mt-2 text-sm text-[#ff8796]">{err}</p>}
    </Modal>
  )
}

function CreditRegister() {
  const { can, me } = useAuth()
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [err, setErr] = useState('')
  const q = useQuery({ queryKey: ['credits', status, page], queryFn: () => api.get<Paged<CreditRow & { requested_by: number | null }>>('/billing/credits', { status, page, page_size: 15 }) })
  const decide = useMutation({ mutationFn: ({ id, decision }: { id: number; decision: string }) => api.post(`/billing/credits/${id}/decision`, { decision }),
    onSuccess: () => qc.invalidateQueries(), onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  return (
    <Panel className="mt-4">
      <div className="flex items-center gap-2 border-b border-panel-line p-3"><Select label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'PENDING', label: 'Pending approval' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }]} />{err && <span className="text-sm text-[#ff8796]">{err}</span>}</div>
      <table className="w-full text-[13.5px]">
        <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5"><th>Number</th><th>Customer</th><th>Invoice</th><th>Type</th><th className="text-right">Amount</th><th>Reason</th><th>Effective</th><th>Status</th><th /></tr></thead>
        <tbody>{q.data?.items.map((c) => (
          <tr key={c.id} className="border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td>{c.number}</td><td>{c.customer}</td><td>{c.invoice ?? '—'}</td><td>{titleCase(c.type)}</td><td className="text-right">{inr(c.amount, { decimals: 2 })}</td><td className="max-w-xs truncate" title={c.reason}>{c.reason}</td><td>{date(c.effective_date)}</td><td><Pill value={c.status} /></td>
            <td>{c.status === 'PENDING' && can('finance:approve') && c.requested_by !== me?.id && <span className="flex gap-1"><button className="btn-ghost py-1 text-xs" onClick={() => decide.mutate({ id: c.id, decision: 'APPROVED' })}>Approve</button><button className="btn-outline-red py-1 text-xs" onClick={() => decide.mutate({ id: c.id, decision: 'REJECTED' })}>Reject</button></span>}</td></tr>
        ))}</tbody>
      </table>
      {q.data?.items.length === 0 && <Empty title="No credits or adjustments" />}
      {q.data && <Pager page={q.data.page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
      <div className="px-4 pb-2"><Basis>Adjustments take effect only after approval by a second authorised person (segregation of duties). Every request and decision is in the audit log.</Basis></div>
    </Panel>
  )
}

function useCustomers() {
  return useQuery({ queryKey: ['reference'], queryFn: () => api.get<{ customers: { id: number; name: string; customer_code: string }[] }>('/metrics/reference') })
}

function DraftInvoice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { period } = usePeriod()
  const qc = useQueryClient()
  const ref = useCustomers()
  const [customer, setCustomer] = useState('')
  const [err, setErr] = useState('')
  const body = { customer_id: Number(customer), ...periodParams(period) }
  const preview = useQuery({ queryKey: ['draft-preview', customer, period], enabled: open && !!customer,
    queryFn: () => api.post<{ eligible: { obligation_key: string; subscription: string; charge_type: string; line_amount: string; formula: string }[]; already_covered: { obligation_key: string; subscription: string; invoices: string[] }[]; excluded: { obligation_key: string; reason: string }[]; subtotal: string }>('/billing/invoices/draft/preview', body) })
  const create = useMutation({ mutationFn: () => api.post<{ id: number }>('/billing/invoices/draft', body), onSuccess: () => { qc.invalidateQueries(); onClose() }, onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  const p = preview.data
  return (
    <Modal open={open} onClose={onClose} wide title={`Generate draft invoice · ${period.label}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="red" disabled={!p?.eligible.length} loading={create.isPending} onClick={() => create.mutate()}>Create draft ({inr(p?.subtotal)})</Button></>}>
      <select className="input mb-4" value={customer} onChange={(e) => setCustomer(e.target.value)} aria-label="Customer"><option value="">Select customer…</option>{ref.data?.customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}</select>
      {preview.isLoading && customer && <Spinner label="Checking invoice coverage…" />}
      {p && (
        <div className="space-y-3 text-sm">
          <div><h4 className="font-semibold">Eligible, not yet invoiced ({p.eligible.length})</h4>{p.eligible.map((e) => <div key={e.obligation_key} className="flex justify-between border-b border-panel-line py-1"><span>{e.subscription} · {titleCase(e.charge_type)}<div className="font-mono text-[10px] text-ink-faint">{e.formula}</div></span><span>{inr(e.line_amount, { decimals: 2 })}</span></div>)}{!p.eligible.length && <p className="text-ink-muted">Nothing left to bill — duplicate billing prevented.</p>}</div>
          <div><h4 className="font-semibold">Already covered ({p.already_covered.length})</h4>{p.already_covered.map((c) => <div key={c.obligation_key} className="text-ink-muted">{c.subscription} · on {c.invoices.join(', ')}</div>)}</div>
          {p.excluded.length > 0 && <div><h4 className="font-semibold">Excluded ({p.excluded.length})</h4>{p.excluded.map((c) => <div key={c.obligation_key} className="text-[#fbbf24]">{c.reason}</div>)}</div>}
        </div>
      )}
      {err && <p className="mt-2 text-sm text-[#ff8796]">{err}</p>}
    </Modal>
  )
}

function RecordPayment({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const ref = useCustomers()
  const [f, setF] = useState({ customer_id: '', received_on: new Date().toISOString().slice(0, 10), amount: '', method: 'BANK_TRANSFER', transaction_reference: '' })
  const [err, setErr] = useState('')
  const m = useMutation({ mutationFn: () => api.post('/billing/payments', { ...f, customer_id: Number(f.customer_id) }), onSuccess: () => { qc.invalidateQueries(); onClose() }, onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  return (
    <Modal open={open} onClose={onClose} title="Record internal payment entry" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="red" loading={m.isPending} disabled={!f.customer_id || !(Number(f.amount) > 0) || f.transaction_reference.length < 3} onClick={() => m.mutate()}>Record payment</Button></>}>
      <p className="mb-3 text-sm text-ink-muted">Records an authorised internal entry (source: manual, status: unverified). It is not a bank confirmation.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label" htmlFor="pc">Customer</label><select id="pc" className="input" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}><option value="">Select…</option>{ref.data?.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label" htmlFor="pd">Received on</label><input id="pd" type="date" className="input" value={f.received_on} onChange={(e) => setF({ ...f, received_on: e.target.value })} /></div>
        <div><label className="label" htmlFor="pa">Amount (INR)</label><input id="pa" className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div><label className="label" htmlFor="pm">Method</label><select id="pm" className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{['BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'CASH'].map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</select></div>
        <div><label className="label" htmlFor="pr">Transaction reference</label><input id="pr" className="input" value={f.transaction_reference} onChange={(e) => setF({ ...f, transaction_reference: e.target.value })} /></div>
      </div>
      {err && <p className="mt-2 text-sm text-[#ff8796]">{err}</p>}
    </Modal>
  )
}

function CreateCredit({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const ref = useCustomers()
  const [f, setF] = useState({ customer_id: '', invoice_id: '', adjustment_type: 'CREDIT_NOTE', amount: '', reason: '', effective_date: new Date().toISOString().slice(0, 10) })
  const [err, setErr] = useState('')
  const invs = useQuery({ queryKey: ['cust-invoices', f.customer_id], enabled: !!f.customer_id, queryFn: () => api.get<Paged<InvoiceRow>>('/billing/invoices', { customer_id: f.customer_id, status: 'ISSUED', page_size: 100 }) })
  const m = useMutation({ mutationFn: () => api.post('/billing/credits', { ...f, customer_id: Number(f.customer_id), invoice_id: f.invoice_id ? Number(f.invoice_id) : null }), onSuccess: () => { qc.invalidateQueries(); onClose() }, onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  return (
    <Modal open={open} onClose={onClose} title="Request credit / adjustment" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="red" loading={m.isPending} disabled={!f.customer_id || !(Number(f.amount) > 0) || f.reason.trim().length < 10} onClick={() => m.mutate()}>Submit for approval</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label" htmlFor="cc">Customer</label><select id="cc" className="input" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value, invoice_id: '' })}><option value="">Select…</option>{ref.data?.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label" htmlFor="ci">Invoice (optional)</label><select id="ci" className="input" value={f.invoice_id} onChange={(e) => setF({ ...f, invoice_id: e.target.value })}><option value="">Account-level</option>{invs.data?.items.map((i) => <option key={i.id} value={i.id}>{i.number}</option>)}</select></div>
        <div><label className="label" htmlFor="ct">Type</label><select id="ct" className="input" value={f.adjustment_type} onChange={(e) => setF({ ...f, adjustment_type: e.target.value })}>{['CREDIT_NOTE', 'DEBIT_ADJUSTMENT', 'WRITE_OFF'].map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</select></div>
        <div><label className="label" htmlFor="ca">Amount (INR)</label><input id="ca" className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div><label className="label" htmlFor="ce">Effective date</label><input id="ce" type="date" className="input" value={f.effective_date} onChange={(e) => setF({ ...f, effective_date: e.target.value })} /></div>
        <div className="col-span-2"><label className="label" htmlFor="cr">Reason</label><textarea id="cr" className="input" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
      </div>
      {err && <p className="mt-2 text-sm text-[#ff8796]">{err}</p>}
    </Modal>
  )
}
