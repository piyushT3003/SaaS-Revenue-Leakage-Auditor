import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Clock3, Rewind } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Basis, Button, ErrorBox, Modal } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { dateTime, inr } from '@/lib/format'
import type { AuditRun } from './ReconciliationPage'

interface ReplayOut {
  id: string; run_code: string; status: string; compare_url: string
  replay: { mode: string; knowledge_cutoff?: string; complete?: boolean; completeness_note?: string; in_place_changes?: Record<string, number>; engine_version: string; original_engine_version: string }
}
interface Compare { totals: Record<string, string>; counts: { resolved: number; remaining: number; newly_detected: number; amount_changed: number }; comparison: AuditRun }

const MODES = [
  { key: 'AS_KNOWN', title: 'As known at the time', body: 'Reproduce the audit from the data that existed when it completed. Later invoices, voids and allocation reversals are hidden.' },
  { key: 'CURRENT', title: 'With today’s data', body: 'Re-run the same period, scope and as-of date on the corrected data, to see what has been resolved since.' },
] as const

/** Historical replay launcher with a holographic timeline (original audit → later corrections → now). */
export function RunTools({ run }: { run?: AuditRun }) {
  const { can } = useAuth()
  const reduce = useReducedMotion()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'AS_KNOWN' | 'CURRENT'>('AS_KNOWN')
  const [cmp, setCmp] = useState<Compare | null>(null)
  const replay = useMutation({
    mutationFn: async () => {
      const r = await api.post<ReplayOut>(`/audits/${run!.id}/replay`, { mode })
      setCmp(await api.get<Compare>(`/audits/${run!.id}/compare/${r.id}`))
      return r
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }),
  })
  const completed = run && ['COMPLETED', 'COMPLETED_WITH_EXCLUSIONS'].includes(run.status)
  if (!run || !completed || !can('audit:run') || run.run_type === 'REPLAY') return null
  const out = replay.data
  const close = () => { setOpen(false); replay.reset(); setCmp(null) }

  const stops = [
    { label: 'Audit period', at: `${run.period_start} → ${run.period_end}`, tone: '#4c8dff' },
    { label: `${run.run_code} completed`, at: dateTime(run.completed_at), tone: '#14b8a6' },
    { label: 'Later corrections', at: out?.replay.in_place_changes && Object.keys(out.replay.in_place_changes).length ? 'in-place edits found' : 'append-only (voids, reversals)', tone: '#f5a524' },
    { label: 'Now', at: dateTime(new Date().toISOString()), tone: '#ef2b45' },
  ]
  const cut = mode === 'AS_KNOWN' ? 1 : 3

  return (
    <>
      <Button onClick={() => setOpen(true)}><Rewind size={16} />Replay</Button>
      <Modal open={open} onClose={close} title="Historical Audit Replay" wide
        footer={<>
          <Button onClick={close}>Close</Button>
          {out ? <Button variant="red" onClick={() => { params.set('run', out.id); setParams(params); close() }}>Open replay results</Button>
            : <Button variant="red" loading={replay.isPending} onClick={() => replay.mutate()}><Rewind size={15} />Run replay</Button>}
        </>}>
        <div className="relative mb-6 overflow-hidden rounded-xl border border-accent-blue/25 bg-[linear-gradient(180deg,rgba(47,123,255,0.10),rgba(3,6,20,0.4))] px-6 pb-6 pt-8">
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(120,170,255,0.05)_0_1px,transparent_1px_4px)]" />
          <div className="relative h-1 rounded-full bg-[#1a2550]">
            <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: 'linear-gradient(90deg,#4c8dff,#22d3ee)', boxShadow: '0 0 14px #22d3ee' }}
              initial={false} animate={{ width: `${(cut / 3) * 100}%` }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
          <div className="relative -mt-3 grid grid-cols-2 lg:grid-cols-4">
            {stops.map((s, i) => (
              <div key={s.label} className={cn('flex flex-col items-center text-center', i > cut && 'opacity-40')}>
                <motion.span className="h-5 w-5 rounded-full border-2 bg-space-900" style={{ borderColor: s.tone, boxShadow: i <= cut ? `0 0 16px ${s.tone}` : 'none' }}
                  animate={i === cut && !reduce ? { scale: [1, 1.25, 1] } : {}} transition={{ repeat: Infinity, duration: 1.8 }} />
                <span className="mt-2 text-xs font-semibold text-ink">{s.label}</span>
                <span className="text-[11px] text-ink-muted">{s.at}</span>
              </div>
            ))}
          </div>
          <p className="relative mt-4 text-center text-[11px] uppercase tracking-[0.2em] text-[#7fb2ff]">{mode === 'AS_KNOWN' ? 'Knowledge cut-off at original completion' : 'Knowledge through today'}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Replay mode">
          {MODES.map((m) => (
            <button key={m.key} role="radio" aria-checked={mode === m.key} disabled={!!out} onClick={() => setMode(m.key)}
              className={cn('panel p-4 text-left transition', mode === m.key ? 'ring-1 ring-accent-red/70' : 'opacity-75 hover:opacity-100')}>
              <div className="mb-1 flex items-center gap-2 font-semibold"><Clock3 size={15} className={mode === m.key ? 'text-accent-red' : 'text-ink-muted'} />{m.title}</div>
              <p className="text-xs text-ink-muted">{m.body}</p>
            </button>
          ))}
        </div>
        {replay.error && <ErrorBox error={replay.error} />}
        {out && cmp && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-3">
            {out.replay.mode === 'AS_KNOWN' && (
              <div className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', out.replay.complete ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-100')}>
                {out.replay.complete ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}
                <span><b>{out.replay.complete ? 'Complete replay.' : 'Incomplete replay.'}</b> {out.replay.completeness_note}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[['Resolved since', cmp.counts.resolved], ['Still open', cmp.counts.remaining], ['Newly detected', cmp.counts.newly_detected], ['Amount changed', cmp.counts.amount_changed]].map(([l, v]) => (
                <div key={l as string} className="panel p-3"><div className="text-[11px] text-ink-muted">{l}</div><div className="text-xl font-semibold">{v}</div></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              {[['Expected', run.expected_total, cmp.comparison.expected_total], ['Invoiced', run.invoiced_total, cmp.comparison.invoiced_total],
                ['Underbilled', run.underbilled_total, cmp.comparison.underbilled_total], ['Overbilled', run.overbilled_total, cmp.comparison.overbilled_total]].map(([l, a, b]) => (
                <div key={l} className="rounded-lg border border-panel-line p-3"><div className="text-[11px] text-ink-muted">{l}</div>
                  <div className="text-ink-muted line-through decoration-ink-faint/40">{inr(a)}</div><div className="font-semibold">{inr(b)}</div></div>
              ))}
            </div>
            <Basis>Replay {out.run_code} is a new, separate audit run; {run.run_code} is never modified and replays never create or reopen exception cases. Engine {out.replay.engine_version} (original {out.replay.original_engine_version}).</Basis>
          </motion.div>
        )}
      </Modal>
    </>
  )
}
