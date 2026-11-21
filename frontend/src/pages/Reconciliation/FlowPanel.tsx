import { motion } from 'framer-motion'
import { ScanLine, Waves } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Basis, Panel } from '@/components/ui'
import type { FlowFigures } from '@/components/three/MoneyFlow3D'
import { inr, pct } from '@/lib/format'
import { useCan3D } from '@/lib/webgl'
import type { AuditRun } from './ReconciliationPage'

const MoneyFlow3D = lazy(() => import('@/components/three/MoneyFlow3D'))
const AuditScan3D = lazy(() => import('@/components/three/AuditScan3D'))

const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0)

/** While an audit is QUEUED/RUNNING: a 3D scanning beam (indeterminate — no invented progress).
 *  Once complete: the money-flow tunnel built only from the run's DB-confirmed totals. */
export function FlowPanel({ run }: { run: AuditRun }) {
  const can3D = useCan3D()
  const busy = ['QUEUED', 'RUNNING'].includes(run.status)
  const done = ['COMPLETED', 'COMPLETED_WITH_EXCLUSIONS'].includes(run.status)
  if (!busy && !done) return null

  if (busy) {
    return (
      <Panel className="mt-4 overflow-hidden p-4" aria-label="Audit in progress">
        <div className="flex items-center gap-2 text-[16px] font-semibold"><ScanLine size={18} className="text-accent-blueSoft" />Auditing {run.run_code}</div>
        <div className="relative mt-2 h-[230px]">
          {can3D ? <Suspense fallback={null}><AuditScan3D className="!h-full !w-full" /></Suspense> : <ScanFallback />}
          <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[13px] text-ink-muted" role="status" aria-live="polite">
            {run.status === 'QUEUED' ? 'Queued — waiting for a worker…' : 'Reconstructing expected charges, matching invoices and allocating payments…'}
          </div>
        </div>
      </Panel>
    )
  }

  const p = (run.summary.payments ?? {}) as Record<string, unknown>
  const f: FlowFigures = {
    expected: n(run.expected_total), invoiced: n(run.invoiced_total), underbilled: n(run.underbilled_total), overbilled: n(run.overbilled_total),
    collected: n(p.collected), collectible: n(p.collectible),
  }
  return (
    <Panel className="mt-4 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold"><Waves size={18} className="text-accent-blueSoft" />Money Flow · {run.run_code}</h2>
        <div className="flex flex-wrap gap-3 text-[12px] text-ink-muted">
          <Key c="#4c8dff" t="Matched" /><Key c="#ff2e4c" t={`Under-billed ${inr(f.underbilled, { decimals: 0 })}`} />
          <Key c="#a78bfa" t={`Over-billed ${inr(f.overbilled, { decimals: 0 })}`} /><Key c="#f5a524" t="Invoiced, unpaid" />
          <Key c="#22c55e" t={`Collected ${inr(f.collected, { decimals: 0 })}${p.collection_rate !== undefined ? ` (${pct(p.collection_rate as string)})` : ''}`} />
        </div>
      </div>
      {can3D ? (
        <div className="h-[300px]"><Suspense fallback={null}><MoneyFlow3D figures={f} className="!h-full !w-full" /></Suspense></div>
      ) : <FlowFallback f={f} />}
      <Basis>Amounts are this audit run's stored totals.{can3D ? ' Particle rates are proportional to each amount, with a small visibility floor so a non-zero leak is never invisible.' : ''} {typeof p.collection_basis === 'string' ? `Collection: ${p.collection_basis}.` : ''}</Basis>
    </Panel>
  )
}

function Key({ c, t }: { c: string; t: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />{t}</span>
}

function ScanFallback() {
  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-panel-line bg-[repeating-linear-gradient(90deg,rgba(76,141,255,0.08)_0_1px,transparent_1px_28px),repeating-linear-gradient(0deg,rgba(76,141,255,0.08)_0_1px,transparent_1px_28px)]">
      <motion.div className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-accent-blueSoft/40 to-transparent" animate={{ left: ['-10%', '100%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  )
}

function FlowFallback({ f }: { f: FlowFigures }) {
  const max = Math.max(f.expected, f.invoiced, 1)
  const bars = [
    { l: 'Contract / Expected', v: f.expected, c: '#4c8dff' },
    { l: 'Invoiced', v: f.invoiced, c: '#7aa8ff' },
    { l: 'Under-billed', v: f.underbilled, c: '#ef2b45' },
    { l: 'Over-billed', v: f.overbilled, c: '#a78bfa' },
    { l: 'Collected', v: f.collected, c: '#22c55e' },
  ]
  return (
    <ul className="my-3 space-y-2 text-[13px]">
      {bars.map((b) => (
        <li key={b.l} className="flex items-center gap-3">
          <span className="w-40 text-ink-muted">{b.l}</span>
          <span className="h-2.5 flex-1 rounded-full bg-panel-line"><span className="block h-full rounded-full" style={{ width: `${Math.max(0.5, (b.v / max) * 100)}%`, background: b.c }} /></span>
          <span className="w-32 text-right">{inr(b.v, { decimals: 0 })}</span>
        </li>
      ))}
    </ul>
  )
}
