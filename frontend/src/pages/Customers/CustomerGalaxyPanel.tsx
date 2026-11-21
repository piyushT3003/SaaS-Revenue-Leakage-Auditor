import { useQuery } from '@tanstack/react-query'
import { Orbit } from 'lucide-react'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { Basis, Panel, Spinner } from '@/components/ui'
import type { GalaxyStar } from '@/components/three/CustomerGalaxy3D'
import { api, type Paged } from '@/lib/api'
import { inr, inrCompact, pct, titleCase } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'
import { useCan3D } from '@/lib/webgl'
import type { CustomerRow } from './CustomersPage'

const CustomerGalaxy3D = lazy(() => import('@/components/three/CustomerGalaxy3D'))
const COLORS: Record<string, string> = { PROFITABLE: '#22c55e', AT_RISK: '#f5a524', UNPROFITABLE: '#ef2b45', NO_REVENUE: '#64748b' }
const BANDS = ['PROFITABLE', 'AT_RISK', 'UNPROFITABLE', 'NO_REVENUE']

/** Every active customer as a star. Size = MRR, colour = profitability band, distance from the core = contribution margin. */
export function CustomerGalaxyPanel() {
  const { period } = usePeriod()
  const nav = useNavigate()
  const can3D = useCan3D()
  const q = useQuery({ queryKey: ['customer-galaxy', period], queryFn: () => api.get<Paged<CustomerRow>>('/customers', { ...periodParams(period), status: 'ACTIVE', sort: '-mrr', page: 1, page_size: 200 }) })
  const rows = q.data?.items
  const stars: GalaxyStar[] = useMemo(() => (rows ?? []).map((c) => ({ id: c.id, name: c.name, mrr: Number(c.mrr) || 0, margin: c.margin_pct === null ? null : Number(c.margin_pct), profitability: c.profitability, segment: c.segment })), [rows])
  // the 2D fallback clamps margin to ±100% so a few extreme accounts don't squash everyone else; tooltips show the real value
  const plotted = useMemo(() => stars.filter((s) => s.margin !== null).map((s) => ({ ...s, x: Math.max(-100, Math.min(100, s.margin as number)) })), [stars])
  const byId = useMemo(() => new Map((rows ?? []).map((c) => [c.id, c])), [rows])
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null)
  const hc = hover ? byId.get(hover.id) : undefined
  const counts = BANDS.map((b) => ({ b, n: stars.filter((s) => s.profitability === b).length })).filter((x) => x.n > 0)

  return (
    <Panel className="mt-4 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="panel-title flex items-center gap-2 text-[17px]"><Orbit size={18} className="text-accent-blueSoft" />Customer Galaxy</h2>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-muted">
          {counts.map(({ b, n }) => <span key={b} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[b] }} />{titleCase(b)} <b className="text-ink">{n}</b></span>)}
        </div>
      </div>
      {!rows ? <Spinner rows={4} /> : can3D ? (
        <div ref={box} className="relative h-[440px]" onMouseLeave={() => setHover(null)}>
          <Suspense fallback={<Spinner rows={4} />}>
            <CustomerGalaxy3D stars={stars} hovered={hover?.id ?? null} className="!h-full !w-full"
              onHover={(s, x, y) => setHover(s ? { id: s.id, x, y } : null)} onPick={(id) => nav(`/customers/${id}`)} />
          </Suspense>
          {hc && hover && (
            <div className="pointer-events-none absolute z-10 w-60 rounded-lg border border-panel-border bg-[#0b1330]/95 p-3 text-[12.5px] shadow-xl backdrop-blur"
              style={{ left: hover.x > (box.current?.clientWidth ?? 0) - 270 ? hover.x - 254 : hover.x + 14, top: Math.min(hover.y + 14, (box.current?.clientHeight ?? 440) - 150) }}>
              <div className="font-semibold text-ink">{hc.name}</div>
              <div className="mb-1.5 text-[11px] text-ink-faint">{hc.code} · {titleCase(hc.segment)}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <span className="text-ink-muted">MRR</span><span className="text-right">{inr(hc.mrr)}</span>
                <span className="text-ink-muted">Margin</span><span className="text-right" style={{ color: COLORS[hc.profitability] }}>{pct(hc.margin_pct)}</span>
                <span className="text-ink-muted">Outstanding</span><span className="text-right">{inr(hc.outstanding)}</span>
                <span className="text-ink-muted">Open exceptions</span><span className="text-right">{hc.open_exceptions}</span>
              </div>
              <div className="mt-1.5 text-[11px] text-accent-blueSoft">Click to open profile</div>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-1 left-1 text-[11.5px] text-ink-faint">Size = MRR · colour = profitability · closer to the core = higher margin</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="rgba(120,150,255,0.12)" />
            <XAxis type="number" dataKey="x" name="Margin" unit="%" domain={[-100, 100]} ticks={[-100, -50, 0, 15, 50, 100]} tick={{ fontSize: 12 }} />
            <YAxis type="number" dataKey="mrr" name="MRR" tickFormatter={inrCompact} tick={{ fontSize: 12 }} width={64} />
            <ZAxis type="number" dataKey="mrr" range={[30, 400]} />
            <Tooltip cursor={false} content={({ payload }) => {
              const d = payload?.[0]?.payload as (GalaxyStar & { x: number }) | undefined
              return d ? <div className="rounded-lg border border-panel-border bg-[#0b1330]/95 px-3 py-2 text-[12px]"><div className="font-semibold">{d.name}</div><div>MRR {inr(d.mrr)} · margin {pct(d.margin)}</div></div> : null
            }} />
            <Scatter data={plotted} onClick={(d) => nav(`/customers/${(d as unknown as GalaxyStar).id}`)} className="cursor-pointer">
              {plotted.map((s) => <Cell key={s.id} fill={COLORS[s.profitability] ?? '#4c8dff'} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}
      <div className="mt-1"><Basis>Active customers for {period.label}. MRR from active subscriptions; margin = contribution ÷ net billed revenue for the period. {can3D ? 'Customers with no billed revenue sit on the outer rim.' : 'Margins beyond ±100% are drawn at the edge; hover for the exact figure.'}</Basis></div>
    </Panel>
  )
}
