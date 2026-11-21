import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Box, Maximize2, Network, Square, ZoomIn, ZoomOut } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useCan3D } from '@/lib/webgl'

const EvidenceGraph3D = lazy(() => import('@/components/three/EvidenceGraph3D'))
import { Basis, Empty, ErrorBox, Modal, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { inr, titleCase } from '@/lib/format'

const MONEY = /(amount|impact|total|price|exposure|subtotal|balance)$/
const show = (k: string, v: unknown) => v === null || v === '' || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : MONEY.test(k) && !Number.isNaN(Number(v)) ? inr(String(v)) : String(v)

/** Revenue Evidence Graph: every node is a stored record and every edge a stored relation.
 *  Laid out in lanes from commercial agreement → obligation → billing → cash. */
export interface GNode { id: string; type: string; label: string; subtitle: string; record: Record<string, unknown>; highlight: boolean }
interface GEdge { source: string; target: string; relation: string; detail: string }
interface Graph { root: string; nodes: GNode[]; edges: GEdge[]; counts: Record<string, number>; note: string }
export type GraphQuery = { exception_id?: number; obligation_id?: number; customer_id?: number; period_start?: string; period_end?: string }

const LANES: { types: string[]; label: string }[] = [
  { types: ['customer'], label: 'Customer' },
  { types: ['contract', 'contract_version'], label: 'Contract' },
  { types: ['pricing_rule', 'product'], label: 'Pricing' },
  { types: ['subscription', 'usage'], label: 'Entitlement & usage' },
  { types: ['obligation'], label: 'Billing obligation' },
  { types: ['exception'], label: 'Exception' },
  { types: ['invoice_line', 'invoice'], label: 'Invoice' },
  { types: ['allocation', 'payment'], label: 'Cash' },
]
const COLOR: Record<string, string> = {
  customer: '#4c8dff', contract: '#818cf8', contract_version: '#a78bfa', pricing_rule: '#f5a524', product: '#fbbf24',
  subscription: '#22d3ee', usage: '#38bdf8', obligation: '#14b8a6', exception: '#ef2b45', invoice_line: '#ec4899',
  invoice: '#f472b6', allocation: '#34d399', payment: '#10b981',
}
const W = 190, H = 54, GAP_X = 70, GAP_Y = 18, PAD = 24

function layout(nodes: GNode[]) {
  const lanes = LANES.map((l) => nodes.filter((n) => l.types.includes(n.type)))
  const used = lanes.map((l, i) => ({ i, l })).filter((x) => x.l.length)
  const pos: Record<string, { x: number; y: number }> = {}
  const tallest = Math.max(1, ...used.map((u) => u.l.length))
  const height = PAD * 2 + 22 + tallest * (H + GAP_Y)
  used.forEach((u, col) => {
    const offset = ((tallest - u.l.length) * (H + GAP_Y)) / 2
    u.l.forEach((n, row) => { pos[n.id] = { x: PAD + col * (W + GAP_X), y: PAD + 22 + offset + row * (H + GAP_Y) } })
  })
  return { pos, width: PAD * 2 + used.length * W + (used.length - 1) * GAP_X, height, cols: used.map((u, col) => ({ label: LANES[u.i].label, x: PAD + col * (W + GAP_X) })) }
}

export function EvidenceGraphView({ query }: { query: GraphQuery }) {
  const reduce = useReducedMotion()
  const g = useQuery({ queryKey: ['evidence-graph', query], queryFn: () => api.get<Graph>('/evidence-graph', query) })
  const [sel, setSel] = useState<string | null>(null)
  const L = useMemo(() => layout(g.data?.nodes ?? []), [g.data])
  const box = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const can3D = useCan3D()
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const nodes3d = useMemo(() => {
    const out: { id: string; type: string; label: string; highlight: boolean; lane: number; row: number; rows: number; color: string }[] = []
    let lane = 0
    LANES.forEach((l) => {
      const ns = (g.data?.nodes ?? []).filter((n) => l.types.includes(n.type))
      if (!ns.length) return
      ns.forEach((n, row) => out.push({ id: n.id, type: n.type, label: n.label, highlight: n.highlight, lane, row, rows: ns.length, color: COLOR[n.type] ?? '#94a3b8' }))
      lane++
    })
    return out
  }, [g.data])
  const fit = () => { const w = box.current?.clientWidth ?? L.width; const h = box.current?.clientHeight ?? L.height; setZoom(Math.max(0.45, Math.min(1, (w - 8) / L.width, (h - 8) / L.height))) }
  useEffect(() => {
    if (!g.data || !box.current) return
    fit()
    const r = L.pos[g.data.root]
    requestAnimationFrame(() => box.current && r && box.current.scrollTo({ left: Math.max(0, r.x * zoom - box.current.clientWidth / 2), top: Math.max(0, r.y * zoom - box.current.clientHeight / 2) }))
  }, [g.data, L]) // eslint-disable-line react-hooks/exhaustive-deps
  if (g.isLoading) return <Spinner label="Tracing evidence…" />
  if (g.error) return <ErrorBox error={g.error} />
  if (!g.data?.nodes.length) return <Empty title="No linked records" />
  const node = g.data.nodes.find((n) => n.id === (sel ?? g.data!.root))
  const linked = new Set(g.data.edges.filter((e) => e.source === sel || e.target === sel).flatMap((e) => [e.source, e.target]))
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="relative min-w-0">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        {can3D && <div className="mr-1 flex overflow-hidden rounded-lg border border-panel-border" role="radiogroup" aria-label="Graph view">
          <button role="radio" aria-checked={mode === '2d'} className={mode === '2d' ? 'bg-accent-redDeep px-2 py-1 text-white' : 'bg-space-800/60 px-2 py-1 text-ink-muted'} onClick={() => setMode('2d')}><Square size={14} /></button>
          <button role="radio" aria-checked={mode === '3d'} className={mode === '3d' ? 'bg-accent-redDeep px-2 py-1 text-white' : 'bg-space-800/60 px-2 py-1 text-ink-muted'} onClick={() => setMode('3d')}><Box size={14} /></button>
        </div>}
        {mode === '2d' && <>
        <button className="btn-ghost px-2 py-1" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}><ZoomIn size={14} /></button>
        <button className="btn-ghost px-2 py-1" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.35, z - 0.15))}><ZoomOut size={14} /></button>
        <button className="btn-ghost px-2 py-1" aria-label="Fit to view" onClick={fit}><Maximize2 size={14} /></button>
        </>}
      </div>
      {mode === '3d' && (
        <div className="h-[62vh] overflow-hidden rounded-xl border border-panel-line bg-[radial-gradient(ellipse_at_center,rgba(47,123,255,0.16),transparent_65%)]">
          <Suspense fallback={<Spinner label="Building 3D view…" />}>
            <EvidenceGraph3D nodes={nodes3d} edges={g.data.edges} selected={sel} onSelect={setSel} />
          </Suspense>
        </div>
      )}
      <div ref={box} className={(mode === '3d' ? 'hidden ' : '') + 'scroll-thin relative h-[62vh] overflow-auto rounded-xl border border-panel-line bg-[radial-gradient(ellipse_at_top,rgba(47,123,255,0.12),transparent_60%)]'}>
        <svg width={L.width * zoom} height={L.height * zoom} viewBox={`0 0 ${L.width} ${L.height}`} role="img" aria-label="Revenue evidence graph">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5b6b95" /></marker>
            <filter id="glow"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {L.cols.map((c) => <text key={c.label} x={c.x + W / 2} y={PAD + 6} textAnchor="middle" className="fill-[#7d8bb0] text-[10px] uppercase tracking-[0.14em]">{c.label}</text>)}
          {g.data.edges.map((e, i) => {
            const a = L.pos[e.source], b = L.pos[e.target]
            if (!a || !b) return null
            const [s, t] = a.x <= b.x ? [a, b] : [b, a]
            const x1 = s.x + W, y1 = s.y + H / 2, x2 = t.x, y2 = t.y + H / 2
            const same = Math.abs(x1 - W - x2) < 1
            const d = same ? `M${s.x + W / 2},${s.y + H} C${s.x + W / 2 + 40},${(s.y + t.y) / 2 + H} ${t.x + W / 2 + 40},${(s.y + t.y) / 2} ${t.x + W / 2},${t.y}`
              : `M${x1},${y1} C${x1 + GAP_X / 1.4},${y1} ${x2 - GAP_X / 1.4},${y2} ${x2},${y2}`
            const hot = sel && (e.source === sel || e.target === sel)
            return (
              <g key={i}>
                <motion.path d={d} fill="none" stroke={hot ? '#ff5a6e' : '#34406a'} strokeWidth={hot ? 2 : 1.3} markerEnd="url(#arrow)"
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.7, delay: 0.2 + i * 0.015 }} />
                <title>{`${e.relation}${e.detail ? ` — ${e.detail}` : ''}`}</title>
              </g>
            )
          })}
          {g.data.nodes.map((n, i) => {
            const p = L.pos[n.id]
            if (!p) return null
            const c = COLOR[n.type] ?? '#94a3b8'
            const dim = sel && sel !== n.id && !linked.has(n.id)
            return (
              <motion.g key={n.id} role="button" tabIndex={0} aria-label={`${titleCase(n.type)} ${n.label}`}
                onClick={() => setSel(n.id)} onKeyDown={(e) => e.key === 'Enter' && setSel(n.id)} className="cursor-pointer outline-none"
                initial={reduce ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: dim ? 0.35 : 1, scale: 1 }} transition={{ delay: i * 0.02, type: 'spring', stiffness: 220, damping: 22 }}
                style={{ transformOrigin: `${p.x + W / 2}px ${p.y + H / 2}px` }}>
                <rect x={p.x} y={p.y} width={W} height={H} rx={10} fill="#0b1330" stroke={sel === n.id ? '#fff' : c} strokeOpacity={sel === n.id ? 0.9 : 0.55}
                  strokeWidth={n.highlight ? 1.8 : 1} filter={n.highlight ? 'url(#glow)' : undefined} />
                <rect x={p.x} y={p.y} width={4} height={H} rx={2} fill={c} />
                <text x={p.x + 14} y={p.y + 21} className="fill-[#e6ecff] text-[12px] font-semibold">{n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}</text>
                <text x={p.x + 14} y={p.y + 39} className="fill-[#8b98bd] text-[10.5px]">{n.subtitle.length > 30 ? `${n.subtitle.slice(0, 29)}…` : n.subtitle}</text>
              </motion.g>
            )
          })}
        </svg>
      </div>
      </div>
      <aside className="panel scroll-thin max-h-[62vh] overflow-y-auto p-4 text-sm">
        {node && <>
          <div className="mb-1 text-[11px] uppercase tracking-wider" style={{ color: COLOR[node.type] }}>{titleCase(node.type)}</div>
          <div className="mb-3 font-semibold">{node.label}</div>
          <dl className="space-y-1.5 text-xs">
            {Object.entries(node.record).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-panel-line/60 pb-1"><dt className="text-ink-muted">{titleCase(k)}</dt>
                <dd className="text-right font-medium text-ink">{show(k, v)}</dd></div>
            ))}
          </dl>
          <div className="mt-4 space-y-1 text-xs">
            {g.data.edges.filter((e) => e.source === node.id || e.target === node.id).map((e, i) => (
              <div key={i} className="text-ink-muted">→ <span className="text-ink">{e.relation}</span>{e.detail && <> · {e.detail}</>}</div>
            ))}
          </div>
        </>}
        <div className="mt-4"><Basis>{g.data.note}</Basis></div>
      </aside>
    </div>
  )
}

export function EvidenceGraphModal({ open, onClose, query, title = 'Revenue Evidence Graph' }: { open: boolean; onClose: () => void; query: GraphQuery | null; title?: string }) {
  return (
    <Modal open={open && !!query} onClose={onClose} wide title={<span className="flex items-center gap-2"><Network size={17} className="text-accent-blue" />{title}</span>}>
      {query && <EvidenceGraphView query={query} />}
    </Modal>
  )
}
