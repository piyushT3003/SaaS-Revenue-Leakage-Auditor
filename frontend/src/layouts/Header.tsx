import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Calendar, ChevronDown, HelpCircle, KeyRound, LogOut, Menu, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChangePasswordModal } from '@/components/ChangePasswordModal'
import { Drawer, Empty, Modal, Pill } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAuthOptions } from '@/lib/demo'
import { cn } from '@/lib/cn'
import { inr, relative } from '@/lib/format'
import { useShell } from '@/lib/shell'
import { customPeriod, monthPeriod, usePeriod } from '@/lib/period'

export function Header() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { mode, setDrawerOpen } = useShell()
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ unread: number }>('/notifications', { page_size: 1 }), refetchInterval: 30_000 })
  return (
    <header className="relative z-30 flex items-center gap-2 px-3 pb-2 pt-3 sm:gap-3 md:px-5 lg:gap-4 lg:px-7 lg:pt-4">
      {mode === 'drawer' && (
        <button onClick={() => setDrawerOpen(true)} className="rounded-full p-2 text-ink hover:bg-white/5" aria-label="Open navigation"><Menu size={24} /></button>
      )}
      <button onClick={() => setPaletteOpen(true)} className="group flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-panel-border bg-space-900/70 px-4 text-left text-[15px] text-ink-muted shadow-card transition hover:border-accent-blueSoft/60 hover:shadow-[0_0_24px_-6px_rgba(76,141,255,0.6)] lg:h-12 lg:max-w-[560px] lg:px-5">
        <Search size={20} className="shrink-0 transition-transform group-hover:scale-110" />
        <span className="sr-only flex-1 truncate sm:not-sr-only sm:inline sm:overflow-hidden sm:whitespace-nowrap">Search customers, contracts, invoices, exceptions...</span>
        <kbd aria-hidden className="ml-auto hidden rounded-md border border-accent-red/50 bg-accent-red/15 px-2 py-0.5 text-[11px] font-semibold text-[#ff8796] md:inline">Ctrl K</kbd>
      </button>
      <div className="hidden flex-1 lg:block" />
      <PeriodPicker />
      <button onClick={() => setNotifOpen(true)} className="relative rounded-full p-2 text-ink hover:bg-white/5" aria-label={`Notifications (${notifications.data?.unread ?? 0} unread)`}>
        <Bell size={24} />
        {!!notifications.data?.unread && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-accent-red shadow-red" />}
      </button>
      <button onClick={() => setHelpOpen(true)} className="rounded-full p-2 text-ink hover:bg-white/5" aria-label="Help"><HelpCircle size={24} /></button>
      <ProfileMenu />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} />
      <Help open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  )
}

function PeriodPicker() {
  const { period, setPeriod } = usePeriod()
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(period.start)
  const [end, setEnd] = useState(period.end)
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => monthPeriod(2026, 10 - i)).filter((p) => p.start <= '2026-11-30'), [])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog"
        className="flex h-11 items-center gap-2 rounded-full border border-panel-border bg-space-900/70 px-3 text-[14px] shadow-card hover:border-accent-blueSoft/60 lg:h-12 lg:gap-3 lg:px-5 lg:text-[15px]" aria-label={`Analytical period: ${period.label}`}>
        <Calendar size={19} className="shrink-0 text-ink-muted" /><span className="hidden whitespace-nowrap md:inline">{period.label}</span><ChevronDown size={17} className="text-ink-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
            className="panel absolute right-0 top-14 w-[min(340px,calc(100vw-24px))] p-4" role="dialog" aria-label="Select analytical period">
            <div className="mb-2 text-xs font-medium text-ink-muted">Month</div>
            <div className="grid grid-cols-3 gap-1.5">
              {months.map((m) => (
                <button key={m.start} onClick={() => { setPeriod(m); setOpen(false) }}
                  className={cn('rounded-md px-2 py-1.5 text-xs', m.start === period.start && m.end === period.end ? 'bg-accent-redDeep text-white' : 'bg-space-800/70 text-ink-muted hover:text-ink')}>
                  {new Date(`${m.start}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </button>
              ))}
            </div>
            <div className="mb-2 mt-4 text-xs font-medium text-ink-muted">Custom range</div>
            <div className="flex gap-2">
              <input type="date" className="input py-1.5 text-xs" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start date" />
              <input type="date" className="input py-1.5 text-xs" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End date" />
            </div>
            <button className="btn-red mt-3 w-full" disabled={!start || !end || end < start} onClick={() => { setPeriod(customPeriod(start, end)); setOpen(false) }}>Apply range</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProfileMenu() {
  const { me, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const nav = useNavigate()
  const opts = useAuthOptions()
  if (!me) return null
  const isDemo = !!opts.data?.demo_email && me.email.toLowerCase() === opts.data.demo_email
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 hover:bg-white/5" aria-haspopup="menu" aria-expanded={open}>
        <span className="sr-only">Account menu: </span>
        <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-semibold text-white shadow-red" style={{ background: 'linear-gradient(180deg,#ff3a54,#b3122b)' }}>{me.initials}</span>
        <span className="hidden text-left leading-tight xl:block"><span className="block text-[15px] font-semibold">{me.full_name}</span><span className="block text-[13px] text-ink-muted">{me.title || me.role}</span></span>
        <ChevronDown size={17} className="text-ink-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="panel absolute right-0 top-14 w-60 p-2">
            <div className="px-3 py-2 text-xs text-ink-muted">{me.email}<br /><Pill value={me.role} className="mt-1" /></div>
            <button role="menuitem" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => { setOpen(false); nav('/settings') }}>Settings</button>
            {!isDemo && <button role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => { setOpen(false); setPwOpen(true) }}><KeyRound size={15} />Change password</button>}
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[#ff8796] hover:bg-accent-red/10" onClick={() => logout()}><LogOut size={15} />Log out</button>
          </motion.div>
        )}
      </AnimatePresence>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}

interface SearchResult {
  customers: { id: number; code: string; name: string; segment: string; link: string }[]
  contracts: { id: number; number: string; customer: string; link: string }[]
  invoices: { id: number; number: string; customer: string; total: string; status: string; link: string }[]
  exceptions: { id: number; code: string; title: string; status: string; link: string }[]
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const nav = useNavigate()
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 220); return () => clearTimeout(t) }, [q])
  const res = useQuery({ queryKey: ['search', debounced], queryFn: () => api.get<SearchResult>('/search', { q: debounced }), enabled: debounced.length >= 2 })
  const go = (link: string) => { onClose(); setQ(''); nav(link) }
  const groups = res.data ? [
    { label: 'Customers', items: res.data.customers.map((c) => ({ key: `c${c.id}`, title: c.name, sub: `${c.code} · ${c.segment.replace('_', '-')}`, link: c.link })) },
    { label: 'Contracts', items: res.data.contracts.map((c) => ({ key: `k${c.id}`, title: c.number, sub: c.customer, link: c.link })) },
    { label: 'Invoices', items: res.data.invoices.map((i) => ({ key: `i${i.id}`, title: i.number, sub: `${i.customer} · ${inr(i.total)} · ${i.status}`, link: i.link })) },
    { label: 'Exceptions', items: res.data.exceptions.map((e) => ({ key: `e${e.id}`, title: `${e.code} — ${e.title}`, sub: e.status, link: e.link })) },
  ].filter((g) => g.items.length) : []
  return (
    <Modal open={open} onClose={onClose} title="Search">
      <input autoFocus className="input text-base" placeholder="Customer, contract number, invoice number or exception…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search query" />
      <div className="mt-4 space-y-4">
        {debounced.length < 2 && <p className="text-sm text-ink-muted">Type at least 2 characters.</p>}
        {res.isFetching && <p className="text-sm text-ink-muted">Searching…</p>}
        {res.data && !groups.length && <Empty title="No matches" />}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{g.label}</div>
            {g.items.map((it) => (
              <button key={it.key} onClick={() => go(it.link)} className="block w-full rounded-md px-3 py-2 text-left hover:bg-white/5">
                <div className="text-sm">{it.title}</div><div className="text-xs text-ink-muted">{it.sub}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}

interface Notif { id: number; category: string; severity: string; title: string; body: string; link: string; created_at: string; read: boolean }

function Notifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.get<{ items: Notif[]; unread: number }>('/notifications', { page_size: 40 }), enabled: open })
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
  const readOne = useMutation({ mutationFn: (id: number) => api.post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })
  return (
    <Drawer open={open} onClose={onClose} title={<span>Notifications {q.data ? <span className="text-sm text-ink-muted">({q.data.unread} unread)</span> : null}</span>}>
      <div className="mb-3 flex justify-end"><button className="btn-ghost py-1 text-xs" onClick={() => readAll.mutate()} disabled={!q.data?.unread}>Mark all as read</button></div>
      {q.data?.items.length === 0 && <Empty title="No notifications yet" hint="Audit completions, imports and exception assignments appear here." />}
      <ul className="space-y-2">
        {q.data?.items.map((n) => (
          <li key={n.id}>
            <button onClick={() => { readOne.mutate(n.id); if (n.link) { onClose(); nav(n.link) } }}
              className={cn('panel w-full p-3 text-left', !n.read && 'ring-1 ring-accent-red/40')}>
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{n.title}</span><span className="shrink-0 text-[11px] text-ink-faint">{relative(n.created_at)}</span></div>
              {n.body && <p className="mt-1 text-xs text-ink-muted">{n.body}</p>}
              <div className="mt-1.5 flex gap-1.5"><Pill value={n.category} /><Pill value={n.severity === 'ERROR' ? 'FAILED' : n.severity === 'WARNING' ? 'MEDIUM' : 'LOW'} label={n.severity.toLowerCase()} /></div>
            </button>
          </li>
        ))}
      </ul>
    </Drawer>
  )
}

function Help({ open, onClose }: { open: boolean; onClose: () => void }) {
  const defs = useQuery({ queryKey: ['defs'], queryFn: () => api.get<{ key: string; formula: string }[]>('/metrics/definitions'), enabled: open })
  return (
    <Modal open={open} onClose={onClose} title="Help & metric definitions">
      <h3 className="mb-2 text-sm font-semibold">Keyboard</h3>
      <ul className="mb-4 space-y-1 text-sm text-ink-muted"><li><kbd className="rounded bg-space-700 px-1.5">Ctrl K</kbd> global search</li><li><kbd className="rounded bg-space-700 px-1.5">Esc</kbd> close dialogs</li></ul>
      <h3 className="mb-2 text-sm font-semibold">How every number is calculated</h3>
      <dl className="space-y-2 text-sm">
        {defs.data?.map((d) => <div key={d.key}><dt className="font-medium">{d.key.replace(/_/g, ' ')}</dt><dd className="text-ink-muted">{d.formula}</dd></div>)}
      </dl>
      <p className="mt-4 text-xs text-ink-faint">All demonstration data is synthetic. Full definitions: docs/metrics/METRIC_DEFINITIONS.md</p>
    </Modal>
  )
}
