import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Info, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/cn'
import { titleCase } from '@/lib/format'

/* ------------------------------------------------------------------ 3D tilt panel */
export function Panel({ children, className, tilt = false, red = false, onClick, as = 'section', ...rest }:
  { children: ReactNode; className?: string; tilt?: boolean; red?: boolean; onClick?: () => void; as?: 'section' | 'button' | 'div'; 'aria-label'?: string }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const rx = useSpring(0, { stiffness: 180, damping: 18 })
  const ry = useSpring(0, { stiffness: 180, damping: 18 })
  const move = (e: React.PointerEvent) => {
    if (!tilt || reduce || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    ry.set((px - 0.5) * 7)
    rx.set(-(py - 0.5) * 7)
    ref.current.style.setProperty('--sx', `${px * 100}%`)
    ref.current.style.setProperty('--sy', `${py * 100}%`)
  }
  const leave = () => { rx.set(0); ry.set(0) }
  const Comp = (as === 'button' ? motion.button : as === 'div' ? motion.div : motion.section) as typeof motion.section
  return (
    <Comp ref={ref as never} onPointerMove={move} onPointerLeave={leave} onClick={onClick} {...rest}
      style={tilt ? { rotateX: rx, rotateY: ry, transformPerspective: 900 } : undefined}
      whileHover={tilt && !reduce ? { y: -3 } : undefined}
      className={cn('panel', red && 'panel-red', tilt && 'tilt transition-shadow hover:shadow-cardHover', onClick && 'cursor-pointer text-left', className)}>
      {tilt && <span className="tilt-shine" />}
      {children}
    </Comp>
  )
}

/* ------------------------------------------------------------------ numbers */
export function AnimatedValue({ value, format }: { value: number | null; format: (n: number) => string }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(0)
  const [text, setText] = useState(value === null ? '—' : format(reduce ? value : 0))
  useEffect(() => {
    if (value === null) { setText('—'); return }
    if (reduce) { setText(format(value)); return }
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setText(format(v)) })
    return () => c.stop()
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <span>{text}</span>
}

export function Delta({ value, type, invert = false, suffix = 'vs last month' }:
  { value: string | null | undefined; type: 'pct' | 'pp'; invert?: boolean; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-xs text-ink-faint">no comparison</span>
  const n = Number(value)
  const up = n >= 0
  const good = invert ? !up : up
  return (
    <span className="flex items-center gap-2">
      <span className={cn('chip px-2 py-[3px] text-[12px] font-semibold', good ? 'bg-accent-green/15 text-[#4ade80] ring-1 ring-accent-green/40' : 'bg-accent-red/15 text-[#ff6b7d] ring-1 ring-accent-red/45')}>
        {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{up ? '+' : ''}{n.toFixed(1)}{type === 'pp' ? ' pp' : '%'}
      </span>
      <span className="text-xs text-ink-muted">{suffix}</span>
    </span>
  )
}

export function Sparkline({ data, color = '#4c8dff', id }: { data: number[]; color?: string; id: string }) {
  if (data.length < 2) return <div className="h-10" />
  const rows = data.map((v, i) => ({ i, v }))
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${id})`} isAnimationActive dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ status pills */
const PILL: Record<string, string> = {
  OPEN: 'bg-accent-red/15 text-[#ff6b7d] ring-accent-red/40',
  IN_PROGRESS: 'bg-accent-amber/15 text-[#fbbf24] ring-accent-amber/40',
  RESOLVED: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  DISMISSED: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
  MATCHED: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  PARTIALLY_MATCHED: 'bg-accent-cyan/15 text-accent-cyan ring-accent-cyan/40',
  UNDERBILLED: 'bg-accent-red/20 text-[#ff6b7d] ring-accent-red/45',
  OVERBILLED: 'bg-accent-amber/15 text-[#fbbf24] ring-accent-amber/40',
  MISSING_CHARGE: 'bg-accent-violet/20 text-[#c4b5fd] ring-accent-violet/40',
  PENDING_REVIEW: 'bg-accent-blue/15 text-accent-blueSoft ring-accent-blue/40',
  EXCLUDED: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
  PAID: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  PENDING: 'bg-accent-amber/15 text-[#fbbf24] ring-accent-amber/40',
  PARTIALLY_PAID: 'bg-accent-cyan/15 text-accent-cyan ring-accent-cyan/40',
  OVERDUE: 'bg-accent-red/20 text-[#ff6b7d] ring-accent-red/45',
  CREDITED: 'bg-accent-indigo/15 text-accent-indigo ring-accent-indigo/40',
  OVER_APPLIED: 'bg-accent-pink/15 text-accent-pink ring-accent-pink/40',
  ISSUED: 'bg-accent-blue/15 text-accent-blueSoft ring-accent-blue/40',
  DRAFT: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
  VOID: 'bg-slate-500/15 text-slate-400 ring-slate-400/30 line-through',
  SYNCED: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  IMPORTED: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  VALIDATED: 'bg-accent-blue/15 text-accent-blueSoft ring-accent-blue/40',
  ROLLED_BACK: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
  FAILED: 'bg-accent-red/20 text-[#ff6b7d] ring-accent-red/45',
  REJECTED: 'bg-accent-red/20 text-[#ff6b7d] ring-accent-red/45',
  COMPLETED: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  COMPLETED_WITH_EXCLUSIONS: 'bg-accent-amber/15 text-[#fbbf24] ring-accent-amber/40',
  RUNNING: 'bg-accent-blue/15 text-accent-blueSoft ring-accent-blue/40',
  QUEUED: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
  CRITICAL: 'bg-accent-red/25 text-[#ff8796] ring-accent-red/60',
  HIGH: 'bg-accent-red/12 text-[#ff8796] ring-accent-red/35',
  MEDIUM: 'bg-accent-amber/15 text-[#fbbf24] ring-accent-amber/40',
  LOW: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
  PROFITABLE: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  AT_RISK: 'bg-accent-amber/15 text-[#fbbf24] ring-accent-amber/40',
  UNPROFITABLE: 'bg-accent-red/20 text-[#ff6b7d] ring-accent-red/45',
  ACTIVE: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  CHURNED: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
  CANCELLED: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
  UNVERIFIED: 'bg-accent-amber/10 text-[#fbbf24] ring-accent-amber/30',
  APPROVED: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  ALLOCATED: 'bg-accent-green/15 text-[#4ade80] ring-accent-green/40',
  PARTIAL: 'bg-accent-cyan/15 text-accent-cyan ring-accent-cyan/40',
  UNALLOCATED: 'bg-accent-red/20 text-[#ff6b7d] ring-accent-red/45',
}
export function Pill({ value, label, className }: { value: string; label?: string; className?: string }) {
  return <span className={cn('chip whitespace-nowrap ring-1', PILL[value] ?? 'bg-slate-500/15 text-slate-300 ring-slate-400/30', className)}>{label ?? titleCase(value)}</span>
}

const CATEGORY: Record<string, string> = {
  UNDERBILLING: 'bg-[#1d3a8a]/60 text-[#93b4ff] ring-[#3b6cf0]/50',
  OVERBILLING: 'bg-[#0e4a5c]/60 text-[#67e8f9] ring-[#22d3ee]/40',
  MISSING_CHARGE: 'bg-[#1d3a8a]/60 text-[#a5b4fc] ring-[#6366f1]/50',
  DUPLICATE_INVOICE: 'bg-[#4c1d95]/50 text-[#d8b4fe] ring-[#a855f7]/45',
  DISCOUNT_DRIFT: 'bg-[#7f1d1d]/55 text-[#fca5a5] ring-[#ef4444]/45',
  PRICING_MISMATCH: 'bg-[#78350f]/55 text-[#fcd34d] ring-[#f59e0b]/45',
  UNBILLED_USAGE: 'bg-[#164e63]/55 text-[#7dd3fc] ring-[#0ea5e9]/45',
  PAYMENT_DISCREPANCY: 'bg-[#831843]/50 text-[#f9a8d4] ring-[#ec4899]/45',
}
export const CATEGORY_COLOR: Record<string, string> = {
  UNDERBILLING: '#ef2b45', OVERBILLING: '#2f7bff', MISSING_CHARGE: '#22d3ee', DISCOUNT_DRIFT: '#f5a524',
  PRICING_MISMATCH: '#ec4899', UNBILLED_USAGE: '#8b5cf6', DUPLICATE_INVOICE: '#818cf8', PAYMENT_DISCREPANCY: '#14b8a6',
}
export function CategoryPill({ value, label }: { value: string; label?: string }) {
  return <span className={cn('chip whitespace-nowrap rounded-md ring-1', CATEGORY[value])}>{label ?? titleCase(value)}</span>
}

/* ------------------------------------------------------------------ buttons & feedback */
export function Button({ loading, variant = 'ghost', children, className, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: 'red' | 'ghost' | 'outline-red' }) {
  // Primary (red) buttons are "magnetic": they lean a few pixels towards the cursor.
  const reduce = useReducedMotion()
  const mx = useSpring(0, { stiffness: 260, damping: 18 })
  const my = useSpring(0, { stiffness: 260, damping: 18 })
  const magnetic = variant === 'red' && !reduce
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!magnetic) return
    const r = e.currentTarget.getBoundingClientRect()
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 8)
    my.set(((e.clientY - r.top) / r.height - 0.5) * 6)
  }
  const leave = () => { mx.set(0); my.set(0) }
  return (
    <motion.button whileTap={{ scale: 0.96, y: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      onPointerMove={move} onPointerLeave={leave} style={magnetic ? { x: mx, y: my } : undefined}
      className={cn(variant === 'red' ? 'btn-red' : variant === 'outline-red' ? 'btn-outline-red' : 'btn-ghost', className)}
      disabled={loading || rest.disabled} {...(rest as object)}>
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </motion.button>
  )
}
/** Loading placeholder: a shimmering skeleton (screen readers hear the label). Custom labels stay visible,
 *  because they describe a specific long-running step ("Recalculating expected charges…"). */
export const Spinner = ({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) => (
  <div role="status" aria-live="polite" className="space-y-2.5 p-5">
    {label !== 'Loading…'
      ? <div className="flex items-center gap-2 text-xs text-ink-muted"><Loader2 size={14} className="animate-spin" />{label}</div>
      : <span className="sr-only">{label}</span>}
    {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-3.5" style={{ width: `${[92, 76, 84, 64, 88][i % 5]}%`, animationDelay: `${i * 0.12}s` }} />)}
  </div>
)
export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong'
  return <div role="alert" className="m-4 flex items-start gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-[#ff9aa6]"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{msg}</div>
}
export const Empty = ({ title, hint }: { title: string; hint?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-1 p-8 text-center"><Info size={18} className="text-ink-faint" /><p className="text-sm font-medium text-ink">{title}</p>{hint && <p className="max-w-md text-xs text-ink-muted">{hint}</p>}</div>
)
export function Basis({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-faint"><Info size={12} className="mt-[1px] shrink-0" />{children}</p>
}

/* ------------------------------------------------------------------ overlays */
/** Modals and drawers render into document.body so a transformed ancestor (an open drawer, a tilted panel)
 *  can never trap their fixed positioning or clip them. */
export function Modal({ open, onClose, title, children, wide = false, footer }:
  { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[#01030b]/75 backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
            initial={{ opacity: 0, scale: 0.94, rotateX: 8, y: 24 }} animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            style={{ transformPerspective: 1200 }}
            className={cn('panel relative flex max-h-[90vh] w-full flex-col', wide ? 'max-w-6xl' : 'max-w-2xl')}>
            <header className="flex items-center justify-between border-b border-panel-line px-5 py-3.5">
              <h2 className="text-base font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-muted hover:bg-white/5 hover:text-ink"><X size={18} /></button>
            </header>
            <div className="scroll-thin overflow-y-auto p-5">{children}</div>
            {footer && <footer className="flex justify-end gap-2 border-t border-panel-line px-5 py-3">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function Drawer({ open, onClose, title, children, width = 'max-w-xl' }:
  { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[#01030b]/60 backdrop-blur-[2px]" onClick={onClose} />
          <motion.aside role="dialog" aria-modal="true" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className={cn('panel absolute right-0 top-0 flex h-full w-full flex-col rounded-none rounded-l-card', width)}>
            <header className="flex items-center justify-between border-b border-panel-line px-5 py-4">
              <div className="text-base font-semibold">{title}</div>
              <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-muted hover:bg-white/5"><X size={18} /></button>
            </header>
            <div className="scroll-thin flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ------------------------------------------------------------------ tabs / select / pagination */
export function Tabs<T extends string>({ tabs, value, onChange, className }:
  { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex flex-wrap gap-2', className)}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={cn('relative rounded-lg px-4 py-1.5 text-[13px] font-medium transition',
            value === t.key ? 'text-white' : 'border border-panel-border bg-space-800/50 text-ink-muted hover:text-ink')}>
          {value === t.key && <motion.span layoutId={`tab-${tabs.map((x) => x.key).join('')}`} className="absolute inset-0 rounded-lg"
            style={{ background: 'linear-gradient(180deg,#ff3a54,#c81732)', boxShadow: '0 0 18px -4px rgba(239,43,69,0.8)' }} />}
          <span className="relative">{t.label}{t.count !== undefined && ` (${t.count})`}</span>
        </button>
      ))}
    </div>
  )
}

export function Select({ value, onChange, options, label, className }:
  { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className={cn('input w-auto cursor-pointer py-1.5 pr-8 text-[13px]', className)}>
      {options.map((o) => <option key={o.value} value={o.value} className="bg-space-900">{o.label}</option>)}
    </select>
  )
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-xs text-ink-muted">
      <span>{total.toLocaleString('en-IN')} records</span>
      <div className="flex items-center gap-2">
        <button className="btn-ghost px-2 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
        <span>Page {page} of {pages}</span>
        <button className="btn-ghost px-2 py-1" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ chart tooltip */
export function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="panel px-3 py-2 text-xs shadow-cardHover">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-ink-muted"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <span className="font-medium text-ink">{fmt(p.value)}</span></div>
      ))}
    </div>
  )
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>{children}</motion.div>
  )
}
export const item = { hidden: { opacity: 0, y: 18, rotateX: 6 }, show: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 200, damping: 24 } } }
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={item as never} className={className} style={{ transformPerspective: 1000 }}>{children}</motion.div>
}
