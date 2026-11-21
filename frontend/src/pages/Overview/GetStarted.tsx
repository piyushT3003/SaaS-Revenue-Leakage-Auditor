import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Download, Play, Rocket, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Panel } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'

interface Step { key: string; label: string; dataset: string; count: number; optional?: boolean }
interface Status { company: string; base_currency: string; steps: Step[]; completed_audits: number; ready_to_audit: boolean; complete: boolean }

/** First-run guide for a new (empty) workspace. Disappears once the first audit has completed. */
export function GetStarted() {
  const q = useQuery({ queryKey: ['onboarding'], queryFn: () => api.get<Status>('/onboarding/status') })
  const nav = useNavigate()
  const { can } = useAuth()
  const d = q.data
  if (!d || d.complete) return null
  const next = d.steps.find((s) => s.count === 0 && !s.optional)
  return (
    <Panel className="mb-4 p-5" aria-labelledby="get-started">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="get-started" className="flex items-center gap-2 text-[18px] font-semibold"><Rocket size={19} className="text-accent-red" />Get started with {d.company}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">Load your data in this order, then run the first audit. Download a template for each file;
            every upload is validated and nothing is stored until you confirm. Amounts are in {d.base_currency} (change it in Settings → General).</p>
        </div>
        <Button variant="red" disabled={!d.ready_to_audit || !can('audit:run')} onClick={() => nav('/reconciliation')}><Play size={15} />Run first audit</Button>
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {d.steps.map((s, i) => {
          const done = s.count > 0
          return (
            <li key={s.key} className={cn('flex items-center gap-3 rounded-lg border p-3 text-sm', next?.key === s.key ? 'border-accent-red/50 bg-accent-red/5' : 'border-panel-line')}>
              {done ? <CheckCircle2 size={18} className="shrink-0 text-accent-green" aria-label="Done" /> : <Circle size={18} className="shrink-0 text-ink-faint" aria-label="Not yet loaded" />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i + 1}. {s.label}</div>
                <div className="text-xs text-ink-muted">{done ? `${s.count.toLocaleString('en-IN')} loaded` : s.optional ? 'Optional' : 'Not loaded yet'}</div>
              </div>
              <a href={api.url(`/imports/templates/${s.dataset}.csv`)} className="text-ink-muted hover:text-ink" aria-label={`Download ${s.label} template`} title="Download CSV template"><Download size={15} /></a>
              {can('import:write') && <button className="text-ink-muted hover:text-ink" onClick={() => nav('/data')} aria-label={`Upload ${s.label}`} title="Upload"><Upload size={15} /></button>}
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
