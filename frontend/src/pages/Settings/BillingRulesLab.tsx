import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Beaker, CheckCircle2, FlaskConical, Pencil, Rocket, Search, Send, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Basis, Button, Drawer, Empty, ErrorBox, Modal, Pager, Panel, Pill, Spinner, Tabs } from '@/components/ui'
import { api, type Paged } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { dateTime, inr, titleCase } from '@/lib/format'
import { usePeriod } from '@/lib/period'

interface Rule {
  id: number; rule_key: string; rule_version: number; status: string; product: string; contract: string | null; contract_version: number | null
  customer: string | null; charge_type: string; pricing_model: string; unit_price: string; included_units: string; discount_pct: string
  tiers: { up_to: string | null; unit_price: string }[] | null; effective_from: string | null; effective_to: string | null; notes: string
}
interface Suite {
  id: number; name: string; proposed_rules: { id: number; label: string }[]; period_start: string; period_end: string; tolerance: string
  approval_status: string; passed: number; failed: number; total_difference: string; updated_at: string
}
interface SuiteDetail extends Suite {
  features: Record<string, { cases: number; failed: number }>
  results: Paged<{ case_key: string; outcome: string; current: string; proposed: string; difference: string; customer: string; subscription: string; period: string; features: string[]; current_formula: string[]; proposed_formula: string[] }>
}

const STATUS_PILL: Record<string, string> = { DRAFT: 'PENDING_REVIEW', SUBMITTED: 'IN_PROGRESS', APPROVED: 'MATCHED', REJECTED: 'OPEN', ACTIVATED: 'RESOLVED' }

/** Billing Rules Regression Lab: propose a pricing-rule version, replay it against history, approve with
 *  segregation of duties, then activate explicitly from an effective date. Nothing activates automatically. */
export function BillingRulesLab() {
  const [tab, setTab] = useState<'rules' | 'suites'>('rules')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Tabs tabs={[{ key: 'rules', label: 'Pricing Rules' }, { key: 'suites', label: 'Regression Suites' }]} value={tab} onChange={setTab} />
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 text-xs text-ink-muted"><FlaskConical size={14} className="text-accent-red" />Propose → Test → Submit → Approve (another admin) → Activate</span>
      </div>
      {tab === 'rules' ? <Rules onSuite={() => setTab('suites')} /> : <Suites />}
    </div>
  )
}

function Rules({ onSuite }: { onSuite: () => void }) {
  const { can } = useAuth()
  const { period } = usePeriod()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ACTIVE' | 'PROPOSED' | 'RETIRED'>('ACTIVE')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [suiteName, setSuiteName] = useState('')
  useEffect(() => setPage(1), [search, status])
  const q = useQuery({ queryKey: ['rules', search, status, page], queryFn: () => api.get<Paged<Rule>>('/rules', { search, status, page, page_size: 12 }) })
  const create = useMutation({
    mutationFn: () => api.post<Suite>('/regression/suites', { name: suiteName || `Regression ${new Date().toLocaleDateString('en-IN')}`, proposed_rule_ids: [...chosen], period_start: shiftMonths(period.start, -5), period_end: period.end }),
    onSuccess: () => { setChosen(new Set()); qc.invalidateQueries({ queryKey: ['suites'] }); onSuite() },
  })
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-ink-faint" />
          <input className="input w-64 pl-8 py-1.5 text-[13px]" placeholder="Rule key, customer or product" aria-label="Search rules" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Tabs tabs={[{ key: 'ACTIVE', label: 'Active' }, { key: 'PROPOSED', label: 'Proposed' }, { key: 'RETIRED', label: 'Retired' }]} value={status} onChange={setStatus} />
        <div className="flex-1" />
        {status === 'PROPOSED' && can('audit:run') && <>
          <input className="input w-56 py-1.5 text-[13px]" placeholder="Suite name" aria-label="Suite name" value={suiteName} onChange={(e) => setSuiteName(e.target.value)} />
          <Button variant="red" disabled={!chosen.size} loading={create.isPending} onClick={() => create.mutate()}><Beaker size={15} />Run regression ({chosen.size})</Button>
        </>}
      </div>
      {create.error && <ErrorBox error={create.error} />}
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.items.length ? <Empty title={`No ${status.toLowerCase()} rules`} hint={status === 'PROPOSED' ? 'Propose a change from an active rule first.' : undefined} /> : (
        <table className="table-dark w-full text-[13px]">
          <thead><tr>{status === 'PROPOSED' && <th />}<th>Rule</th><th>Customer / contract</th><th>Product</th><th>Model</th><th className="text-right">Unit price</th><th className="text-right">Discount</th><th>Effective</th><th /></tr></thead>
          <tbody>{q.data.items.map((r) => (
            <tr key={r.id}>
              {status === 'PROPOSED' && <td><input type="checkbox" aria-label={`Include ${r.rule_key}`} checked={chosen.has(r.id)} onChange={() => { const n = new Set(chosen); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setChosen(n) }} /></td>}
              <td><div className="font-medium">{r.rule_key}</div><div className="text-[11px] text-ink-faint">v{r.rule_version} · {titleCase(r.charge_type)}</div></td>
              <td>{r.customer ?? <span className="text-ink-faint">Price book</span>}{r.contract && <div className="text-[11px] text-ink-faint">{r.contract} v{r.contract_version}</div>}</td>
              <td>{r.product}</td><td className="text-ink-muted">{titleCase(r.pricing_model)}{r.tiers?.length ? ` · ${r.tiers.length} tiers` : ''}</td>
              <td className="text-right">{inr(r.unit_price)}</td><td className="text-right">{Number(r.discount_pct)}%</td>
              <td className="text-[11px] text-ink-muted">{r.effective_from ?? 'contract start'} → {r.effective_to ?? 'open'}</td>
              <td>{r.status === 'ACTIVE' && can('audit:run') && <Button onClick={() => setEditing(r)}><Pencil size={13} />Propose</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {q.data && q.data.pages > 1 && <Pager page={page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
      <ProposeModal rule={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); setStatus('PROPOSED') }} />
    </Panel>
  )
}

function ProposeModal({ rule, onClose, onDone }: { rule: Rule | null; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const [unit, setUnit] = useState('')
  const [disc, setDisc] = useState('')
  const [incl, setIncl] = useState('')
  const [notes, setNotes] = useState('')
  useEffect(() => { if (rule) { setUnit(rule.unit_price); setDisc(rule.discount_pct); setIncl(rule.included_units); setNotes('') } }, [rule])
  const changes = () => {
    const c: Record<string, string> = {}
    if (rule && unit !== rule.unit_price) c.unit_price = unit
    if (rule && disc !== rule.discount_pct) c.discount_pct = disc
    if (rule && incl !== rule.included_units) c.included_units = incl
    if (notes) c.notes = notes
    return c
  }
  const m = useMutation({ mutationFn: () => api.post(`/rules/${rule!.id}/propose`, { changes: changes() }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); onDone() } })
  return (
    <Modal open={!!rule} onClose={onClose} title={`Propose change · ${rule?.rule_key} v${rule?.rule_version}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="red" loading={m.isPending} disabled={!Object.keys(changes()).filter((k) => k !== 'notes').length} onClick={() => m.mutate()}>Create proposed version</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="label">Unit price<input className="input mt-1" inputMode="decimal" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        <label className="label">Discount %<input className="input mt-1" inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value)} /></label>
        <label className="label">Included units<input className="input mt-1" inputMode="decimal" value={incl} onChange={(e) => setIncl(e.target.value)} /></label>
      </div>
      <label className="label mt-3">Reason / notes<textarea className="input mt-1 h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this change is proposed" /></label>
      <Basis>A proposed version is never used by audits. It must pass a regression suite, be approved by a different administrator and be activated from an explicit effective date.</Basis>
      {m.error && <ErrorBox error={m.error} />}
    </Modal>
  )
}

function Suites() {
  const q = useQuery({ queryKey: ['suites'], queryFn: () => api.get<Suite[]>('/regression/suites') })
  const [open, setOpen] = useState<number | null>(null)
  if (q.isLoading) return <Spinner />
  if (q.error) return <ErrorBox error={q.error} />
  if (!q.data?.length) return <Panel><Empty title="No regression suites yet" hint="Propose a rule change, then select proposed versions and run a regression." /></Panel>
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {q.data.map((s, i) => {
        const total = s.passed + s.failed
        return (
          <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Panel tilt as="button" onClick={() => setOpen(s.id)} className="w-full p-4">
              <div className="mb-1 flex items-center justify-between gap-2"><span className="font-semibold">{s.name}</span><Pill value={STATUS_PILL[s.approval_status] ?? 'PENDING_REVIEW'} label={titleCase(s.approval_status)} /></div>
              <div className="mb-3 text-xs text-ink-muted">{s.proposed_rules.map((r) => r.label).join(', ')} · {s.period_start} → {s.period_end}</div>
              <div className="flex h-2 overflow-hidden rounded-full bg-space-800">
                <span className="bg-emerald-400" style={{ width: `${total ? (s.passed / total) * 100 : 0}%` }} /><span className="bg-accent-red" style={{ width: `${total ? (s.failed / total) * 100 : 0}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs"><span className="text-emerald-300">{s.passed} unchanged</span><span className="text-[#ff6b7d]">{s.failed} changed</span><span className="text-ink-muted">Net {inr(s.total_difference, { sign: true })}</span></div>
            </Panel>
          </motion.div>
        )
      })}
      <SuiteDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function SuiteDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [outcome, setOutcome] = useState<'' | 'FAILED' | 'PASSED'>('FAILED')
  const [page, setPage] = useState(1)
  const [eff, setEff] = useState('')
  const [note, setNote] = useState('')
  const q = useQuery({ queryKey: ['suite', id, outcome, page], queryFn: () => api.get<SuiteDetail>(`/regression/suites/${id}`, { outcome, page, page_size: 10 }), enabled: id !== null })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['suite'] }); qc.invalidateQueries({ queryKey: ['suites'] }); qc.invalidateQueries({ queryKey: ['rules'] }) }
  const decide = useMutation({ mutationFn: (decision: string) => api.post(`/regression/suites/${id}/decision`, { decision, note }), onSuccess: refresh })
  const activate = useMutation({ mutationFn: () => api.post<{ activated: string[] }>(`/regression/suites/${id}/activate`, { effective_from: eff }), onSuccess: refresh })
  const s = q.data
  return (
    <Drawer open={id !== null} onClose={onClose} width="max-w-3xl" title={s ? s.name : 'Regression suite'}>
      {q.isLoading || !s ? <Spinner /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {[['Cases', s.passed + s.failed], ['Unchanged', s.passed], ['Changed', s.failed], ['Net difference', inr(s.total_difference, { sign: true })]].map(([l, v]) => (
              <div key={l as string} className="panel p-3"><div className="text-[11px] text-ink-muted">{l}</div><div className="text-lg font-semibold">{v}</div></div>
            ))}
          </div>
          {Object.keys(s.features).length > 0 && (
            <div className="panel p-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Coverage by contract feature</div>
              <div className="flex flex-wrap gap-2">{Object.entries(s.features).map(([f, v]) => (
                <span key={f} className={cn('chip ring-1', v.failed ? 'bg-accent-red/10 text-[#ff9aa6] ring-accent-red/40' : 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/30')}>{titleCase(f)} · {v.cases} cases{v.failed ? `, ${v.failed} changed` : ''}</span>
              ))}</div></div>
          )}
          <Tabs tabs={[{ key: 'FAILED', label: 'Changed' }, { key: 'PASSED', label: 'Unchanged' }, { key: '', label: 'All' }]} value={outcome} onChange={(v) => { setOutcome(v); setPage(1) }} />
          {s.results.items.length === 0 ? <Empty title="No cases" /> : (
            <div className="space-y-2">{s.results.items.map((r) => (
              <div key={r.case_key} className="rounded-lg border border-panel-line p-3 text-[13px]">
                <div className="flex items-center gap-2">{r.outcome === 'PASSED' ? <CheckCircle2 size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-accent-red" />}
                  <b>{r.customer}</b><span className="text-ink-muted">{r.subscription} · {r.period}</span><div className="flex-1" />
                  <span>{inr(r.current)} → <b>{inr(r.proposed)}</b></span><span className={cn('w-28 text-right font-semibold', Number(r.difference) ? 'text-[#ff6b7d]' : 'text-ink-muted')}>{inr(r.difference, { sign: true })}</span></div>
                <div className="mt-1 grid gap-1 text-[11px] text-ink-faint md:grid-cols-2"><div>Current: {r.current_formula.join(' + ')}</div><div>Proposed: {r.proposed_formula.join(' + ')}</div></div>
              </div>
            ))}</div>
          )}
          {s.results.pages > 1 && <Pager page={page} pages={s.results.pages} total={s.results.total} onPage={setPage} />}
          <div className="panel space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">Approval workflow <Pill value={STATUS_PILL[s.approval_status] ?? 'PENDING_REVIEW'} label={titleCase(s.approval_status)} /></div>
            {['DRAFT', 'REJECTED', 'SUBMITTED'].includes(s.approval_status) && <input className="input text-[13px]" placeholder="Note for the audit trail" aria-label="Decision note" value={note} onChange={(e) => setNote(e.target.value)} />}
            <div className="flex flex-wrap items-center gap-2">
              {['DRAFT', 'REJECTED'].includes(s.approval_status) && can('audit:run') && <Button loading={decide.isPending} onClick={() => decide.mutate('SUBMIT')}><Send size={14} />Submit for approval</Button>}
              {s.approval_status === 'SUBMITTED' && can('rules:approve') && <>
                <Button variant="red" loading={decide.isPending} onClick={() => decide.mutate('APPROVED')}><CheckCircle2 size={14} />Approve</Button>
                <Button loading={decide.isPending} onClick={() => decide.mutate('REJECTED')}><XCircle size={14} />Reject</Button></>}
              {s.approval_status === 'APPROVED' && can('rules:approve') && <>
                <label className="text-xs text-ink-muted">Effective from <input type="date" className="input ml-1 w-auto py-1 text-[13px]" value={eff} onChange={(e) => setEff(e.target.value)} /></label>
                <Button variant="red" disabled={!eff} loading={activate.isPending} onClick={() => activate.mutate()}><Rocket size={14} />Activate</Button></>}
            </div>
            {(decide.error || activate.error) && <ErrorBox error={decide.error || activate.error} />}
            {activate.data && <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2 text-xs text-emerald-100">Activated: {activate.data.activated.join('; ')}</div>}
            <Basis>Approvers must differ from the submitter. Activation end-dates the current version the day before, so earlier periods are still priced (and replayable) with the rule that applied then. Updated {dateTime(s.updated_at)}.</Basis>
          </div>
        </div>
      )}
    </Drawer>
  )
}

function shiftMonths(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setMonth(d.getMonth() + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
