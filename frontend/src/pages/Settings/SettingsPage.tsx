import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle2, Copy, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthOptions } from '@/lib/demo'
import { useEffect, useState } from 'react'
import { Basis, Button, Empty, ErrorBox, Modal, Pager, Panel, Pill, Select, Spinner, Tabs } from '@/components/ui'
import { PageTitle } from '@/layouts/AppLayout'
import { api, type Paged } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { dateTime, titleCase } from '@/lib/format'
import { BillingRulesLab } from './BillingRulesLab'
import { PrivacyTab } from './PrivacyTab'

type Settings = Record<string, Record<string, unknown>>
type T = 'general' | 'users' | 'data' | 'rules' | 'billing' | 'ai' | 'notifications' | 'accessibility' | 'privacy' | 'logs'

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-accent-blue shadow-[0_0_12px_rgba(47,123,255,0.6)]' : 'bg-space-600')}>
      <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 30 }} className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white', checked ? 'right-0.5' : 'left-0.5')} />
    </button>
  )
}

export default function SettingsPage() {
  const emailOn = useAuthOptions().data?.password_reset_email
  const emailNote = emailOn
    ? 'With Email notifications on, audit failures and new high-severity exceptions are emailed to every admin. In-app notifications are always on.'
    : 'Email delivery needs an email provider (EMAIL_PROVIDER), which is not configured in this deployment; in-app notifications are always on.'
  const { can } = useAuth()
  const [tab, setTab] = useState<T>('general')
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') })
  const tabs: { key: T; label: string }[] = [
    { key: 'general', label: 'General' }, { key: 'users', label: 'Users & Access' }, { key: 'data', label: 'Data & Sync' },
    { key: 'rules', label: 'Revenue Rules' }, { key: 'billing', label: 'Billing Rules' }, { key: 'notifications', label: 'Alerts' },
    { key: 'ai', label: 'Integrations' }, { key: 'accessibility', label: 'Accessibility' }, ...(can('users:manage') ? [{ key: 'privacy' as T, label: 'Data & Privacy' }] : []),
    ...(can('settings:write') ? [{ key: 'logs' as T, label: 'Audit Logs' }] : []),
  ]
  return (
    <div>
      <PageTitle first="Settings" subtitle="Manage application preferences and configurations" />
      <Tabs value={tab} onChange={setTab} tabs={tabs} className="mb-4" />
      {q.isLoading && <Spinner />}
      {q.data && (
        <>
          {tab === 'general' && <GeneralTab s={q.data} />}
          {tab === 'users' && <UsersTab />}
          {tab === 'data' && <SectionForm section="data_preferences" s={q.data} fields={[['max_upload_mb', 'Maximum upload size (MB)', 'number'], ['require_import_confirmation', 'Require explicit confirmation before import', 'bool']]} note="Database connection and credentials are configured through environment variables (.env), never through the UI." />}
          {tab === 'rules' && <RulesTab s={q.data} />}
          {tab === 'billing' && <BillingRulesLab />}
          {tab === 'notifications' && <SectionForm section="notifications" s={q.data} fields={[['revenue_leakage_alerts', 'Revenue leakage alerts', 'bool'], ['payment_due_alerts', 'Payment due alerts', 'bool'], ['daily_data_sync', 'Daily data sync summary', 'bool'], ['import_completed', 'Import completed', 'bool'], ['audit_completed', 'Audit completed', 'bool'], ['email_notifications', 'Email notifications', 'bool']]} note={emailNote} />}
          {tab === 'ai' && <AiTab s={q.data} />}
          {tab === 'accessibility' && <SectionForm section="accessibility" s={q.data} fields={[['reduced_motion', 'Reduce motion (disable parallax, tilt and animated transitions)', 'bool'], ['disable_3d_effects', 'Disable 3D effects', 'bool'], ['high_contrast', 'High-contrast panels', 'bool']]} note="Your operating system's reduced-motion preference is always respected." />}
          {tab === 'privacy' && <PrivacyTab />}
          {tab === 'logs' && <LogsTab />}
        </>
      )}
    </div>
  )
}

function useSave(section: string) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const m = useMutation({ mutationFn: (body: Record<string, unknown>) => api.put(`/settings/${section}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2500) } })
  return { ...m, saved }
}

function GeneralTab({ s }: { s: Settings }) {
  const { can } = useAuth()
  const g = s.general as { workspace_name: string; currency: string; timezone: string }
  const n = s.notifications as Record<string, boolean>
  const [f, setF] = useState(g)
  const [alerts, setAlerts] = useState(n)
  const save = useSave('general')
  const saveN = useSave('notifications')
  const ro = !can('settings:write')
  return (
    <Panel className="p-5">
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <div><label className="label" htmlFor="ws">Workspace Name</label><input id="ws" className="input" value={f.workspace_name} disabled={ro} onChange={(e) => setF({ ...f, workspace_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="cur">Currency</label><select id="cur" className="input" value={f.currency} disabled={ro} onChange={(e) => setF({ ...f, currency: e.target.value })}><option value="INR">INR (₹)</option></select>
              <p className="mt-1 text-[11px] text-ink-faint">Only the tenant base currency is supported until FX rates are configured.</p></div>
            <div><label className="label" htmlFor="tz">Time Zone</label><select id="tz" className="input" value={f.timezone} disabled={ro} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{['Asia/Kolkata', 'Asia/Singapore', 'Asia/Dubai', 'Europe/London', 'UTC'].map((z) => <option key={z} value={z}>{z === 'Asia/Kolkata' ? 'Asia/Kolkata (IST)' : z}</option>)}</select></div>
          </div>
        </div>
        <div className="space-y-3">
          {([['revenue_leakage_alerts', 'Revenue Leakage Alerts'], ['payment_due_alerts', 'Payment Due Alerts'], ['daily_data_sync', 'Daily Data Sync'], ['email_notifications', 'Email Notifications']] as const).map(([k, l]) => (
            <div key={k} className="flex items-center justify-between border-b border-panel-line pb-2.5"><span>{l}</span><Toggle label={l} checked={!!alerts[k]} disabled={ro} onChange={(v) => setAlerts({ ...alerts, [k]: v })} /></div>
          ))}
        </div>
      </div>
      {!ro && <div className="mt-5 flex items-center justify-end gap-3">
        {(save.saved || saveN.saved) && <span className="flex items-center gap-1 text-sm text-[#4ade80]"><CheckCircle2 size={15} />Saved</span>}
        {(save.error || saveN.error) && <span className="text-sm text-[#ff8796]">{(save.error ?? saveN.error)?.message}</span>}
        <Button variant="red" loading={save.isPending || saveN.isPending} onClick={async () => { await save.mutateAsync(f); await saveN.mutateAsync(alerts) }}>Save Changes</Button></div>}
    </Panel>
  )
}

function SectionForm({ section, s, fields, note }: { section: string; s: Settings; fields: [string, string, 'bool' | 'number' | 'text'][]; note?: string }) {
  const { can } = useAuth()
  const [f, setF] = useState(s[section] ?? {})
  useEffect(() => setF(s[section] ?? {}), [s, section])
  const save = useSave(section)
  const ro = !can('settings:write')
  useEffect(() => {
    if (section === 'accessibility') document.documentElement.classList.toggle('reduce-motion', !!(s.accessibility as Record<string, boolean>).reduced_motion)
  }, [s, section])
  return (
    <Panel className="max-w-3xl p-5">
      <div className="space-y-3">
        {fields.map(([k, l, t]) => (
          <div key={k} className="flex items-center justify-between gap-4 border-b border-panel-line pb-2.5">
            <span>{l}</span>
            {t === 'bool' ? <Toggle label={l} checked={!!f[k]} disabled={ro} onChange={(v) => setF({ ...f, [k]: v })} />
              : <input className="input w-40" type={t === 'number' ? 'number' : 'text'} value={String(f[k] ?? '')} disabled={ro} onChange={(e) => setF({ ...f, [k]: t === 'number' ? Number(e.target.value) : e.target.value })} aria-label={l} />}
          </div>
        ))}
      </div>
      {note && <div className="mt-3"><Basis>{note}</Basis></div>}
      {!ro && <div className="mt-4 flex items-center justify-end gap-3">{save.saved && <span className="text-sm text-[#4ade80]">Saved</span>}{save.error && <span className="text-sm text-[#ff8796]">{save.error.message}</span>}
        <Button variant="red" loading={save.isPending} onClick={() => save.mutate(f)}>Save Changes</Button></div>}
    </Panel>
  )
}

function RulesTab({ s }: { s: Settings }) {
  const { can } = useAuth()
  const r = s.revenue_rules as { severity_thresholds: Record<string, string>; match_tolerance: string; leakage_alert_threshold: string; priority_weights: Record<string, number> }
  const [f, setF] = useState(r)
  const save = useSave('revenue_rules')
  const ro = !can('settings:write')
  const total = Object.values(f.priority_weights).reduce((a, b) => a + Number(b), 0)
  return (
    <div className="grid grid-cols-2 gap-4">
      <Panel className="p-5">
        <h3 className="panel-title mb-3">Alert thresholds & severity</h3>
        {(['CRITICAL', 'HIGH', 'MEDIUM'] as const).map((k) => (
          <div key={k} className="mb-2 flex items-center justify-between"><span><Pill value={k} /> impact at least (₹)</span><input className="input w-40" disabled={ro} value={f.severity_thresholds[k]} onChange={(e) => setF({ ...f, severity_thresholds: { ...f.severity_thresholds, [k]: e.target.value } })} aria-label={`${k} threshold`} /></div>
        ))}
        <div className="mb-2 flex items-center justify-between"><span>Leakage alert threshold (₹)</span><input className="input w-40" disabled={ro} value={f.leakage_alert_threshold} onChange={(e) => setF({ ...f, leakage_alert_threshold: e.target.value })} aria-label="Leakage alert threshold" /></div>
        <div className="flex items-center justify-between"><span>Matching tolerance (₹)</span><input className="input w-40" disabled={ro} value={f.match_tolerance} onChange={(e) => setF({ ...f, match_tolerance: e.target.value })} aria-label="Matching tolerance" /></div>
        <div className="mt-3"><Basis>Severity is applied when an audit creates or refreshes an exception. Matching tolerance is the absolute amount within which an obligation counts as matched.</Basis></div>
      </Panel>
      <Panel className="p-5">
        <h3 className="panel-title mb-3">Leakage prioritization weights</h3>
        {Object.entries(f.priority_weights).map(([k, v]) => (
          <div key={k} className="mb-2 flex items-center gap-3"><span className="w-44">{titleCase(k)}</span><input type="range" min={0} max={60} value={v} disabled={ro} aria-label={`${k} weight`} className="flex-1 accent-[#ef2b45]" onChange={(e) => setF({ ...f, priority_weights: { ...f.priority_weights, [k]: Number(e.target.value) } })} /><span className="w-10 text-right">{v}</span></div>
        ))}
        <p className={cn('mt-2 text-sm', total === 100 ? 'text-[#4ade80]' : 'text-[#ff8796]')}>Total {total} / 100</p>
      </Panel>
      {!ro && <div className="col-span-2 flex items-center justify-end gap-3">{save.saved && <span className="text-sm text-[#4ade80]">Saved</span>}{save.error && <span className="text-sm text-[#ff8796]">{save.error.message}</span>}
        <Button variant="red" disabled={total !== 100} loading={save.isPending} onClick={() => save.mutate(f)}>Save Changes</Button></div>}
    </div>
  )
}

function AiTab({ s }: { s: Settings }) {
  const a = (s.ai ?? {}) as { provider?: string; model?: string; api_key_configured?: boolean; temperature?: number; max_tool_calls?: number }
  return (
    <Panel className="max-w-3xl space-y-3 p-5 text-sm">
      <h3 className="panel-title">AI configuration</h3>
      <div className="flex items-center justify-between border-b border-panel-line pb-2"><span>LLM credentials</span>{a.api_key_configured ? <Pill value="COMPLETED" label="Configured" /> : <Pill value="DRAFT" label="Not configured" />}</div>
      <div className="flex items-center justify-between border-b border-panel-line pb-2"><span>Provider / model</span><span className="text-ink-muted">{a.provider || '—'} / {a.model || '—'}</span></div>
      <div className="flex items-center justify-between border-b border-panel-line pb-2"><span>Max analytical tool calls per question</span><span>{a.max_tool_calls ?? '—'}</span></div>
      <Basis>Credentials are read only from the server environment (LLM_PROVIDER, LLM_API_KEY, LLM_MODEL) and are never sent to the browser or stored in the database. Without credentials the assistant still answers supported questions using deterministic analytical tools.</Basis>
      <h3 className="panel-title pt-3">Other integrations</h3>
      <p className="text-ink-muted">No payment gateway, bank feed or billing-provider integration is configured. Data arrives through CSV/XLSX imports.</p>
    </Panel>
  )
}

interface UserRow { id: number; email: string; full_name: string; title: string; role: string; is_active: boolean; last_login_at: string | null }
function UsersTab() {
  const { can, me } = useAuth()
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<{ name: string; description: string; permissions: string[] }[]>('/roles') })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ email: '', full_name: '', title: '', role: 'ANALYST', password: '' })
  const [err, setErr] = useState('')
  const create = useMutation({ mutationFn: () => api.post('/users', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setOpen(false) }, onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/users/${id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }), onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  const manage = can('users:manage')
  const [link, setLink] = useState<{ url: string; expires_at: string; email: string } | null>(null)
  const resetLink = useMutation({ mutationFn: (id: number) => api.post<{ url: string; expires_at: string; email: string }>(`/users/${id}/reset-link`), onSuccess: setLink, onError: (e) => setErr(e instanceof Error ? e.message : 'Failed') })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Panel className="col-span-2">
        <div className="flex items-center justify-between border-b border-panel-line p-3"><h3 className="panel-title">Users</h3>{manage && <Button variant="red" onClick={() => setOpen(true)}>Invite user</Button>}</div>
        {err && <ErrorBox error={new Error(err)} />}
        <table className="w-full text-[13.5px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th>{manage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>{users.data?.map((u) => (
            <tr key={u.id} className="border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td>{u.full_name}<div className="text-[11px] text-ink-faint">{u.title}</div></td><td>{u.email}</td>
              <td>{manage && u.id !== me?.id ? <Select label={`Role of ${u.full_name}`} value={u.role} onChange={(v) => patch.mutate({ id: u.id, body: { role: v } })} options={['ADMIN', 'ANALYST', 'VIEWER'].map((r) => ({ value: r, label: titleCase(r) }))} /> : <Pill value={u.role === 'ADMIN' ? 'CRITICAL' : u.role === 'ANALYST' ? 'ISSUED' : 'DRAFT'} label={titleCase(u.role)} />}</td>
              <td>{manage && u.id !== me?.id ? <Toggle label={`${u.full_name} active`} checked={u.is_active} onChange={(v) => patch.mutate({ id: u.id, body: { is_active: v } })} /> : <Pill value={u.is_active ? 'ACTIVE' : 'CANCELLED'} />}</td>
              <td className="text-xs text-ink-muted">{dateTime(u.last_login_at)}</td>
              {manage && <td>{u.is_active && u.id !== me?.id && <button className="btn-ghost py-1 text-xs" onClick={() => resetLink.mutate(u.id)} aria-label={`Reset link for ${u.full_name}`}><KeyRound size={13} />Reset link</button>}</td>}</tr>))}</tbody></table>
      </Panel>
      <Panel className="p-4"><h3 className="panel-title mb-2">Roles & permissions</h3>
        {roles.data?.map((r) => <div key={r.name} className="mb-3"><div className="font-medium">{titleCase(r.name)}</div><div className="text-xs text-ink-muted">{r.description}</div><div className="mt-1 flex flex-wrap gap-1">{r.permissions.map((p) => <span key={p} className="chip bg-space-700 text-[10px] text-ink-muted">{p}</span>)}</div></div>)}
        <Basis>Permissions are enforced by the server on every request.</Basis></Panel>
      <Modal open={open} onClose={() => setOpen(false)} title="Invite user" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="red" loading={create.isPending} onClick={() => create.mutate()}>Create user</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          {(['full_name', 'email', 'title'] as const).map((k) => <div key={k}><label className="label" htmlFor={k}>{titleCase(k)}</label><input id={k} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
          <div><label className="label" htmlFor="role">Role</label><select id="role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['ADMIN', 'ANALYST', 'VIEWER'].map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</select></div>
          <div className="col-span-2"><label className="label" htmlFor="pw">Initial password (min. 10 chars, letters and digits)</label><input id="pw" type="password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        </div>
        {err && <p className="mt-2 text-sm text-[#ff8796]">{err}</p>}
      </Modal>
      <Modal open={!!link} onClose={() => setLink(null)} title="One-time password reset link" footer={<Button variant="red" onClick={() => setLink(null)}>Done</Button>}>
        {link && <div className="space-y-3 text-sm">
          <p>Send this link to <b>{link.email}</b> over a channel you trust. It works once, expires {dateTime(link.expires_at)}, and signs the user out everywhere when used. It is shown only now.</p>
          <div className="flex gap-2"><input readOnly className="input font-mono text-xs" value={link.url} aria-label="Reset link" onFocus={(e) => e.target.select()} />
            <Button onClick={() => { void navigator.clipboard?.writeText(link.url); toast.success('Link copied') }}><Copy size={14} />Copy</Button></div>
        </div>}
      </Modal>
    </div>
  )
}

function LogsTab() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['audit-logs', action, page], queryFn: () => api.get<Paged<{ id: number; at: string; user: string; action: string; entity_type: string; entity_id: string; details: Record<string, unknown>; request_id: string }>>('/audit-logs', { action, page, page_size: 25 }) })
  return (
    <Panel>
      <div className="border-b border-panel-line p-3"><input className="input w-72 py-1.5 text-[13px]" placeholder="Filter by action (e.g. EXCEPTION, IMPORT, AUDIT)…" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} aria-label="Filter audit log" /></div>
      <table className="w-full text-[13px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th><th>Request</th></tr></thead>
        <tbody>{q.data?.items.map((l) => <tr key={l.id} className="border-b border-panel-line align-top [&>td]:px-3 [&>td]:py-2"><td className="whitespace-nowrap">{dateTime(l.at)}</td><td>{l.user}</td><td>{titleCase(l.action)}</td><td>{l.entity_type} {l.entity_id}</td><td className="max-w-lg break-all font-mono text-[11px] text-ink-muted">{JSON.stringify(l.details)}</td><td className="font-mono text-[10px] text-ink-faint">{l.request_id}</td></tr>)}</tbody></table>
      {q.data?.items.length === 0 && <Empty title="No matching log entries" />}
      {q.data && <Pager page={q.data.page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
      <div className="px-4 pb-2"><Basis>The audit log is append-only: the database rejects updates and deletes.</Basis></div>
    </Panel>
  )
}
