import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { Basis, Button, Empty, ErrorBox, Panel, Pill, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { date, num } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'

interface Batch {
  id: number; batch_code: string; source_system: string; status: string; period_start: string; period_end: string
  control_event_count: number | null; ingested_events: number; control_quantity: string | null; ingested_quantity: string
  sequence_number: number | null; issues: { code: string; severity: string; message: string }[]; affected_billing_periods: string[]; reprocessable: boolean
}
interface Issue { code: string; severity: string; batch_code: string; period: string; message: string }
interface Report {
  batches: Batch[]; issues: Issue[]; sequence_gaps: unknown[]; completeness_note: string
  summary: { batches: number; batches_with_issues: number; ingested_events: number; affected_billing_periods: string[] }
}

/** Usage Meter Integrity Monitor: control totals, sequence gaps, late or duplicate deliveries. */
export function UsageIntegrityPanel() {
  const { period } = usePeriod()
  const { can } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['usage-integrity', period], queryFn: () => api.get<Report>('/usage-integrity', periodParams(period)) })
  const re = useMutation({
    mutationFn: (id: number) => api.post<{ message: string }>(`/usage-integrity/batches/${id}/reprocess`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usage-integrity'] }),
  })
  if (q.isLoading) return <Spinner />
  if (q.error) return <ErrorBox error={q.error} />
  const d = q.data!
  const tiles = [
    { label: 'Usage batches', value: d.summary.batches },
    { label: 'With issues', value: d.summary.batches_with_issues, red: d.summary.batches_with_issues > 0 },
    { label: 'Ingested events', value: num(d.summary.ingested_events) },
    { label: 'Billing periods affected', value: d.summary.affected_billing_periods.length, red: d.summary.affected_billing_periods.length > 0 },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((t) => <Panel key={t.label} tilt as="div" className="p-4"><div className="text-xs text-ink-muted">{t.label}</div><div className={cn('mt-1 text-2xl font-bold', t.red && 'text-[#ff6b7d]')}>{t.value}</div></Panel>)}
      </div>
      {d.issues.length > 0 && (
        <Panel red className="p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} className="text-accent-red" />Integrity issues</h3>
          <ul className="space-y-1.5 text-sm">
            {d.issues.map((i, k) => <li key={k} className="flex items-start gap-2"><Pill value={i.severity} /><span><b>{i.batch_code}</b>{i.period && ` · ${i.period}`} — {i.message}</span></li>)}
          </ul>
        </Panel>
      )}
      {re.error && <ErrorBox error={re.error} />}
      {re.data && <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{re.data.message}</div>}
      <Panel className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold"><Activity size={16} className="text-accent-cyan" />Meter batches</div>
        {d.batches.length === 0 ? <Empty title="No usage batches in this period" /> : (
          <table className="table-dark mt-2 w-full text-[13px]">
            <thead><tr><th>Batch</th><th>Source</th><th>Window</th><th className="text-right">Control</th><th className="text-right">Ingested</th><th>Completeness</th><th>Status</th><th /></tr></thead>
            <tbody>
              {d.batches.map((b, i) => {
                const ratio = b.control_event_count ? Math.min(1, b.ingested_events / b.control_event_count) : null
                return (
                  <motion.tr key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <td className="font-medium">{b.batch_code}{b.sequence_number !== null && <span className="ml-1 text-[11px] text-ink-faint">#{b.sequence_number}</span>}</td><td className="text-ink-muted">{b.source_system}</td>
                    <td className="text-ink-muted">{date(b.period_start, false)} – {date(b.period_end, false)}</td>
                    <td className="text-right">{b.control_event_count ?? '—'}</td><td className="text-right">{num(b.ingested_events)}</td>
                    <td className="w-40">{ratio === null ? <span className="text-[11px] text-ink-faint">no control total</span> : (
                      <div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-space-800">
                        <motion.div className={cn('h-full', b.issues.length ? 'bg-accent-red' : 'bg-emerald-400')} initial={{ width: 0 }} animate={{ width: `${ratio * 100}%` }} /></div>
                        {b.issues.length ? <AlertTriangle size={13} className="text-accent-red" /> : <CheckCircle2 size={13} className="text-emerald-400" />}</div>)}
                      {b.issues.map((x) => <div key={x.code} className="text-[11px] text-[#ff9aa6]" title={x.message}>{x.code.replace(/_/g, ' ').toLowerCase()}</div>)}
                    </td>
                    <td><Pill value={b.status === 'PROCESSED' || b.status === 'REPROCESSED' ? 'MATCHED' : b.status === 'FAILED' ? 'OPEN' : 'PENDING_REVIEW'} label={b.status.toLowerCase()} /></td>
                    <td>{b.status === 'FAILED' && can('import:write') && <Button disabled={!b.reprocessable} title={b.reprocessable ? undefined : 'Control total still differs — re-deliver the missing events first'} loading={re.isPending} onClick={() => re.mutate(b.id)}><RefreshCw size={14} />Reprocess</Button>}</td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <Basis>{d.completeness_note}</Basis>
    </div>
  )
}
