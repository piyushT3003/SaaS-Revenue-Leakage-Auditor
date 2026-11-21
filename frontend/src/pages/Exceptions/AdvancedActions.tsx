import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileArchive, GitBranch, ListOrdered, Network } from 'lucide-react'
import { useState } from 'react'
import { EvidenceGraphModal } from '@/components/EvidenceGraph'
import { Basis, Button, CategoryPill, Drawer, Empty, ErrorBox, Modal, Pill, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { inr } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'

interface Ranked {
  id: number; rank: number; exception_code: string; category: string; customer: string; financial_impact: string; status: string
  score: number; priority: string; explanation: string; contributions: Record<string, number>
}
interface Cluster {
  cause_type: string; cause_label: string; cause_reference: string; confidence: string; exception_ids: number[]; exception_codes: string[]
  categories: string[]; unique_exposure: string; leakage_exposure: string; rationale: string
  blast_radius: { exceptions: number; customers: number; subscriptions: number; invoices: number; periods: string[] }
}

const FACTOR_COLOR: Record<string, string> = {
  exposure: '#ef2b45', recurrence: '#f5a524', customers_affected: '#ec4899', evidence: '#14b8a6',
  match_reliability: '#22d3ee', age: '#818cf8', business_impact: '#4c8dff',
}

/** Prioritization, root cause, evidence graph and evidence pack tools for the Exceptions page. */
export function AdvancedActions({ selected }: { selected: number[] }) {
  const { can } = useAuth()
  const { period } = usePeriod()
  const [panel, setPanel] = useState<'priority' | 'cause' | null>(null)
  const [graph, setGraph] = useState<number | null>(null)
  const [packOpen, setPackOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setPanel('priority')}><ListOrdered size={16} />Prioritize</Button>
      <Button onClick={() => setPanel('cause')}><GitBranch size={16} />Root Cause</Button>
      <Button disabled={selected.length !== 1} title={selected.length !== 1 ? 'Select one exception' : undefined} onClick={() => setGraph(selected[0])}><Network size={16} />Evidence Graph</Button>
      {can('export') && <Button disabled={!selected.length} title={!selected.length ? 'Select exceptions to include' : undefined} onClick={() => setPackOpen(true)}><FileArchive size={16} />Evidence Pack</Button>}
      <Drawer open={panel === 'priority'} onClose={() => setPanel(null)} width="max-w-3xl" title="Leakage Prioritization">
        {panel === 'priority' && <Priority period={periodParams(period)} onGraph={setGraph} />}
      </Drawer>
      <Drawer open={panel === 'cause'} onClose={() => setPanel(null)} width="max-w-3xl" title="Root Cause Analysis">
        {panel === 'cause' && <RootCause period={periodParams(period)} />}
      </Drawer>
      <EvidenceGraphModal open={graph !== null} onClose={() => setGraph(null)} query={graph ? { exception_id: graph } : null} />
      <EvidencePackModal open={packOpen} onClose={() => setPackOpen(false)} ids={selected} />
    </>
  )
}

function Priority({ period, onGraph }: { period: { period_start: string; period_end: string }; onGraph: (id: number) => void }) {
  const q = useQuery({ queryKey: ['priority', period], queryFn: () => api.get<{ ranked: Ranked[]; method: string }>('/prioritization', period) })
  if (q.isLoading) return <Spinner />
  if (q.error) return <ErrorBox error={q.error} />
  if (!q.data?.ranked.length) return <Empty title="No open exceptions in this period" />
  return (
    <div className="space-y-2.5">
      <Basis>{q.data.method} The score orders the work queue; it is not a probability that the exception is real.</Basis>
      {q.data.ranked.map((r, i) => (
        <motion.div key={r.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} className="panel p-3">
          <div className="flex items-center gap-3">
            <span className="w-7 text-center text-lg font-bold text-ink-muted">{r.rank}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm"><b>{r.exception_code}</b><CategoryPill value={r.category} /><Pill value={r.priority === 'P1' ? 'HIGH' : r.priority === 'P2' ? 'MEDIUM' : 'LOW'} label={r.priority} /></div>
              <div className="truncate text-xs text-ink-muted">{r.customer} · {inr(r.financial_impact)}</div>
            </div>
            <div className="text-right"><div className="text-xl font-semibold">{r.score.toFixed(1)}</div><div className="text-[10px] text-ink-faint">/ 100</div></div>
            <button className="btn-ghost px-2 py-1" aria-label={`Evidence graph for ${r.exception_code}`} onClick={() => onGraph(r.id)}><Network size={14} /></button>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-space-800" aria-hidden>
            {Object.entries(r.contributions).map(([k, v]) => <span key={k} title={`${k}: +${v}`} style={{ width: `${v}%`, background: FACTOR_COLOR[k] }} />)}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-muted">{r.explanation}</p>
        </motion.div>
      ))}
      <div className="flex flex-wrap gap-3 pt-2 text-[11px] text-ink-muted">
        {Object.entries(FACTOR_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{k.replace(/_/g, ' ')}</span>)}
      </div>
    </div>
  )
}

function RootCause({ period }: { period: { period_start: string; period_end: string } }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['root-cause', period], queryFn: () => api.get<{ clusters: Cluster[]; note: string }>('/root-cause', period) })
  const [confirming, setConfirming] = useState<Cluster | null>(null)
  const [note, setNote] = useState('')
  const confirm = useMutation({
    mutationFn: (c: Cluster) => api.post('/root-cause/confirm', { cause_type: c.cause_type, cause_reference: c.cause_reference, exception_ids: c.exception_ids, note }),
    onSuccess: () => { setConfirming(null); setNote(''); qc.invalidateQueries({ queryKey: ['root-cause'] }) },
  })
  if (q.isLoading) return <Spinner />
  if (q.error) return <ErrorBox error={q.error} />
  if (!q.data?.clusters.length) return <Empty title="No shared causes found" hint="Clusters need at least two exceptions sharing a rule, configuration, batch, invoice run or payment source." />
  return (
    <div className="space-y-3">
      <Basis>{q.data.note} A cluster is a potential cause until an investigator confirms it.</Basis>
      {q.data.clusters.map((c) => (
        <div key={c.cause_type + c.cause_reference} className="panel p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-accent-blueSoft">{c.cause_label}</span>
            <Pill value={c.confidence === 'CONFIRMED' ? 'RESOLVED' : 'MEDIUM'} label={c.confidence === 'CONFIRMED' ? 'Confirmed' : 'Potential'} />
          </div>
          <div className="mb-2 font-semibold">{c.cause_reference}</div>
          <div className="mb-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
            {[['Exceptions', c.blast_radius.exceptions], ['Customers', c.blast_radius.customers], ['Subscriptions', c.blast_radius.subscriptions], ['Invoices', c.blast_radius.invoices], ['Unique exposure', inr(c.unique_exposure)]].map(([l, v]) => (
              <div key={l as string} className="rounded-md border border-panel-line px-2 py-1.5"><div className="text-ink-faint">{l}</div><div className="font-semibold text-ink">{v}</div></div>
            ))}
          </div>
          <div className="mb-2 flex flex-wrap gap-1">{c.categories.map((k) => <CategoryPill key={k} value={k} />)}</div>
          <p className="text-xs text-ink-muted">{c.rationale}</p>
          <p className="mt-1 text-[11px] text-ink-faint">{c.exception_codes.join(', ')}</p>
          {can('exception:write') && c.confidence !== 'CONFIRMED' && <Button className="mt-2" onClick={() => setConfirming(c)}>Confirm root cause</Button>}
        </div>
      ))}
      <Modal open={!!confirming} onClose={() => setConfirming(null)} title="Confirm root cause"
        footer={<><Button onClick={() => setConfirming(null)}>Cancel</Button><Button variant="red" disabled={note.trim().length < 10} loading={confirm.isPending} onClick={() => confirming && confirm.mutate(confirming)}>Confirm</Button></>}>
        <p className="mb-3 text-sm text-ink-muted">Record what the investigation established about <b className="text-ink">{confirming?.cause_reference}</b>. This is logged in the audit trail.</p>
        <textarea className="input h-28" aria-label="Investigation finding" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Price book v3 was loaded without the enterprise discount — confirmed with Billing Ops" />
        {confirm.error && <ErrorBox error={confirm.error} />}
      </Modal>
    </div>
  )
}

function EvidencePackModal({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: number[] }) {
  const [fmt, setFmt] = useState<'pdf' | 'xlsx'>('pdf')
  const gen = useMutation({
    mutationFn: () => api.post<{ id: string; file_name: string; sha256: string; download: string }>('/evidence-packs', { exception_ids: ids, format: fmt }),
  })
  const close = () => { gen.reset(); onClose() }
  return (
    <Modal open={open} onClose={close} title="Generate Evidence Pack"
      footer={<><Button onClick={close}>Close</Button>{gen.data ? <a className="btn-red" href={gen.data.download} download>Download</a>
        : <Button variant="red" loading={gen.isPending} onClick={() => gen.mutate()}>Generate</Button>}</>}>
      <p className="mb-3 text-sm text-ink-muted">Bundles the calculation, contract terms, pricing rule, invoice lines, payments, notes and status history for {ids.length} exception{ids.length === 1 ? '' : 's'} into one document for finance review or customer discussion.</p>
      <div className="mb-3 flex gap-2" role="radiogroup" aria-label="Format">
        {(['pdf', 'xlsx'] as const).map((f) => <button key={f} role="radio" aria-checked={fmt === f} onClick={() => setFmt(f)} className={fmt === f ? 'btn-red' : 'btn-ghost'}>{f.toUpperCase()}</button>)}
      </div>
      {gen.error && <ErrorBox error={gen.error} />}
      {gen.data && <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{gen.data.file_name} is ready.<div className="mt-1 break-all text-[11px] text-emerald-200/80">SHA-256 {gen.data.sha256}</div></div>}
    </Modal>
  )
}
