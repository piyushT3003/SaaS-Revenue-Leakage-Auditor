import { useQueryClient } from '@tanstack/react-query'
import { Download, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Modal, Panel } from '@/components/ui'
import { api } from '@/lib/api'

const PHRASE = 'ERASE ALL COMPANY DATA'

/** Admin-only: export every record of this workspace, or erase all business data. */
export function PrivacyTab() {
  const qc = useQueryClient()
  const [exporting, setExporting] = useState(false)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const exportAll = async () => {
    setExporting(true)
    try {
      const blob = await api.get<Blob>('/admin/data-export')
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: `company_data_${new Date().toISOString().slice(0, 10)}.zip` })
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { toast.error('Export failed', { description: e instanceof Error ? e.message : '' }) } finally { setExporting(false) }
  }
  const erase = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.post<{ deleted_rows: number }>('/admin/data-erase', { confirm, password })
      toast.success(`Erased ${r.deleted_rows.toLocaleString('en-IN')} records`)
      setOpen(false); setConfirm(''); setPassword('')
      qc.invalidateQueries()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erase failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <h2 className="text-[16px] font-semibold">Export all company data</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">A ZIP with one CSV per table: customers, contracts, pricing, usage, invoices, payments, every audit run and its results,
          exceptions, notes, simulations, AI conversations and the audit trail. Password hashes and session tokens are never included.</p>
        <Button className="mt-3" loading={exporting} onClick={exportAll}><Download size={15} />Download export (.zip)</Button>
      </Panel>
      <Panel red className="p-5">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold"><ShieldAlert size={17} className="text-accent-red" />Erase all company data</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">Permanently deletes every business record of this workspace, including audit history and the audit trail.
          Users and settings are kept so you can start again. <b className="text-ink">This cannot be undone</b> — download an export first if you may need the data.</p>
        <Button variant="red" className="mt-3" onClick={() => setOpen(true)}>Erase all company data…</Button>
      </Panel>
      <p className="text-xs text-ink-faint">See the <Link className="underline" to="/privacy">privacy notice</Link> and <Link className="underline" to="/terms">terms of use</Link>.</p>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Erase all company data"
        footer={<><Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="red" loading={busy} disabled={confirm !== PHRASE || !password} onClick={erase}>Erase permanently</Button></>}>
        <div className="space-y-3 text-sm">
          <p>To confirm, type <code className="rounded bg-white/10 px-1.5 py-0.5">{PHRASE}</code> and enter your password.</p>
          <div><label className="label" htmlFor="erase-confirm">Confirmation</label><input id="erase-confirm" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></div>
          <div><label className="label" htmlFor="erase-password">Your password</label><input id="erase-password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
          {err && <p role="alert" className="text-[#ff8796]">{err}</p>}
        </div>
      </Modal>
    </div>
  )
}
