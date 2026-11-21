import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, AlertTriangle, BarChart3, CreditCard, Database, Home, Layers, PanelLeftClose, PanelLeftOpen, Settings, Sparkles, Users } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { pct } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'
import { useShell } from '@/lib/shell'
import { useCan3D } from '@/lib/webgl'

const HealthGauge3D = lazy(() => import('@/components/three/HealthGauge3D'))

export const NAV = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/reconciliation', label: 'Reconciliation', icon: Layers },
  { to: '/exceptions', label: 'Exceptions', icon: AlertTriangle, badge: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/billing', label: 'Billing & Payments', icon: CreditCard },
  { to: '/unit-economics', label: 'Unit Economics', icon: BarChart3 },
  { to: '/ai', label: 'AI Investigation', icon: Sparkles },
  { to: '/data', label: 'Data Management', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label={compact ? 'SaaS Revenue Assurance' : undefined} title="Go to overview">
      <svg width="36" height="34" viewBox="0 0 36 34" aria-hidden>
        <defs><linearGradient id="lg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#c81732" /><stop offset="1" stopColor="#ff4d63" /></linearGradient></defs>
        <rect x="1" y="20" width="7" height="13" rx="1.5" fill="url(#lg)" /><rect x="10" y="13" width="7" height="20" rx="1.5" fill="url(#lg)" />
        <rect x="19" y="7" width="7" height="26" rx="1.5" fill="url(#lg)" /><rect x="28" y="1" width="7" height="32" rx="1.5" fill="url(#lg)" />
      </svg>
      {!compact && <div className="leading-tight">
        <div className="text-[17px] font-bold tracking-tight text-white">SaaS Revenue</div>
        <div className="text-[17px] font-bold tracking-tight text-white">Assurance</div>
      </div>}
    </Link>
  )
}

function HealthCard({ h, compact }: { h?: RevenueHealth; compact: boolean }) {
  const can3D = useCan3D()
  const v = h?.reconciliation_rate.value == null ? null : Number(h.reconciliation_rate.value)
  const gauge = can3D && v !== null
    ? <Suspense fallback={null}><HealthGauge3D value={v} className={compact ? '!h-14 !w-14' : '!h-[72px] !w-[72px]'} /></Suspense>
    : <Activity size={compact ? 26 : 30} className="text-accent-red" />
  if (compact) {
    return (
      <Link to="/reconciliation" className="panel mx-auto flex flex-col items-center p-1.5" title={`Revenue health: ${pct(h?.reconciliation_rate.value)} reconciliation rate`}
        aria-label={`Revenue health ${pct(h?.reconciliation_rate.value)}`}>
        <div className="flex h-14 w-14 items-center justify-center">{gauge}</div>
        <span className="text-[11px] font-semibold">{pct(h?.reconciliation_rate.value)}</span>
      </Link>
    )
  }
  return (
    <Link to="/reconciliation" className="panel tilt block p-4 transition hover:shadow-cardHover">
      <div className="flex items-center gap-2">
        <div className="-my-2 -ml-2 flex h-[72px] w-[72px] shrink-0 items-center justify-center">{gauge}</div>
        <div>
          <div className="text-[13px] text-ink-muted">Revenue Health</div>
          <div className="depth-text text-2xl font-bold leading-tight">{pct(h?.reconciliation_rate.value)}</div>
          <div className="text-[11px] text-ink-faint">reconciliation rate</div>
        </div>
      </div>
      <dl className="mt-3 space-y-1 text-[11px]">
        <div className="flex justify-between"><dt className="text-ink-muted">Data quality</dt><dd>{pct(h?.data_quality.value)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-muted">Latest audit</dt><dd>{h?.latest_audit?.run_code ?? 'none'}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-muted">Freshness</dt>
          <dd className={h?.freshness.status === 'CURRENT' ? 'text-[#4ade80]' : 'text-[#fbbf24]'}>{h ? h.freshness.status.replace('_', ' ').toLowerCase() : '—'}</dd></div>
      </dl>
    </Link>
  )
}

function SidebarBody({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const { period } = usePeriod()
  const { mode, toggleCollapsed } = useShell()
  const ex = useQuery({ queryKey: ['exceptions-summary', period], queryFn: () => api.get<{ open: number; in_progress: number }>('/exceptions/summary', periodParams(period)) })
  const health = useQuery({ queryKey: ['metrics-summary', period], queryFn: () => api.get<{ revenue_health: RevenueHealth }>('/metrics/summary', periodParams(period)) })
  const open = (ex.data?.open ?? 0) + (ex.data?.in_progress ?? 0)
  return (
    <>
      <div className={cn('pb-5 pt-5', rail ? 'flex flex-col items-center px-2' : 'px-5')}>
        <Logo compact={rail} />
        {!rail && <span className="ml-12 mt-1 inline-block rounded-full border border-accent-red/60 bg-accent-red/15 px-3 py-0.5 text-[11px] font-semibold text-[#ff8796]">Enterprise</span>}
      </div>
      <nav aria-label="Main" className={cn('flex flex-col gap-1', rail ? 'px-2' : 'px-3')}>
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink key={to} to={to} end={end} className="group relative" onClick={onNavigate} title={rail ? label : undefined} aria-label={rail ? label : undefined}>
            {({ isActive }) => (
              <motion.div whileHover={{ x: isActive || rail ? 0 : 3, scale: rail ? 1.06 : 1 }} className={cn('relative flex items-center rounded-xl text-[15px] transition-colors',
                rail ? 'h-12 justify-center' : 'gap-3.5 px-4 py-[11px]', isActive ? 'text-white' : 'text-ink-muted hover:text-white')}>
                {isActive && <motion.span layoutId={`nav-active-${rail ? 'r' : 'f'}`} className="absolute inset-0 rounded-xl"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  style={{ background: 'linear-gradient(90deg, rgba(239,43,69,0.95), rgba(160,16,40,0.75))', boxShadow: '0 0 0 1px rgba(255,90,110,0.65), 0 0 26px -4px rgba(239,43,69,0.75)' }} />}
                <Icon size={20} className="relative shrink-0 transition-transform group-hover:scale-110" strokeWidth={1.8} />
                {!rail && <span className="relative flex-1">{label}</span>}
                {badge && open > 0 && (rail
                  ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-accent-red shadow-red" aria-label={`${open} open`} />
                  : <span className="relative rounded-full bg-accent-redDeep px-2 py-0.5 text-xs font-semibold text-white shadow-red">{open}</span>)}
                {rail && <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg border border-panel-border bg-space-900/95 px-3 py-1.5 text-xs text-white opacity-0 shadow-card transition group-hover:opacity-100 group-focus-visible:opacity-100">{label}</span>}
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>
      <div className={cn('mt-auto', rail ? 'p-2' : 'p-4')}>
        <HealthCard h={health.data?.revenue_health} compact={rail} />
        {mode !== 'drawer' && (
          <button onClick={toggleCollapsed} className={cn('mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-faint hover:bg-white/5 hover:text-ink', rail && 'justify-center')}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand sidebar' : 'Collapse sidebar'}>
            {rail ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} />Collapse</>}
          </button>
        )}
      </div>
    </>
  )
}

export function Sidebar() {
  const { mode, drawerOpen, setDrawerOpen } = useShell()
  useEffect(() => {
    if (!drawerOpen) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [drawerOpen, setDrawerOpen])
  if (mode === 'drawer') {
    return (
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div key="scrim" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)} />
            <motion.aside key="drawer" role="dialog" aria-modal="true" aria-label="Navigation"
              className="fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-panel-line bg-[#040a1c]/95 backdrop-blur-xl"
              initial={{ x: -300, rotateY: 18, opacity: 0.4 }} animate={{ x: 0, rotateY: 0, opacity: 1 }} exit={{ x: -300, rotateY: 12, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }} style={{ transformPerspective: 1200, transformOrigin: 'left center' }}>
              <SidebarBody rail={false} onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    )
  }
  const rail = mode === 'rail'
  return (
    <motion.aside animate={{ width: rail ? 84 : 256 }} transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      className="relative z-20 flex h-full shrink-0 flex-col border-r border-panel-line bg-[#040a1c]/85 backdrop-blur-xl">
      <SidebarBody rail={rail} />
    </motion.aside>
  )
}

export interface RevenueHealth {
  data_quality: { value: string | null; basis: string }
  reconciliation_rate: { value: string | null; basis: string }
  latest_audit: { id: string; run_code: string; status: string; period_start: string; period_end: string; completed_at: string } | null
  freshness: { status: 'CURRENT' | 'STALE' | 'NO_AUDIT'; basis: string }
  period_audit_available: boolean
}
