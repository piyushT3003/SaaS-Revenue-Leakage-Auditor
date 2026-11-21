import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Database, FileDown, FileSpreadsheet, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Basis, Button, Drawer, Empty, ErrorBox, Modal, Pager, Panel, Pill, Select, Spinner, Tabs } from '@/components/ui'
import { PageTitle } from '@/layouts/AppLayout'
import { ApiError, api, type Paged } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { dateTime, num, pct, titleCase } from '@/lib/format'
import { UsageIntegrityPanel } from './UsageIntegrityPanel'

interface Source { dataset: string; label: string; category: string; records: number; last_updated: string | null; last_batch: { id: number; code: string; status: string; origin: string; at: string } | null; rows_uploaded: number; rows_rejected_or_duplicate: number; status: string }
interface DatasetSpec { key: string; label: string; category: string; description: string; natural_key: string[]; fields: { name: string; type: string; required: boolean; choices: string[]; references: string | null }[] }
export interface Batch { id: number; batch_code: string; dataset_type: string; dataset_label: string; file_name: string; data_origin: string; status: string; source_columns: string[]; column_mapping: Record<string, string>; total_rows: number; accepted_rows: number; rejected_rows: number; duplicate_rows: number; inserted_rows: number; issues_summary: { errors?: Record<string, number>; warnings?: number; database_error?: string }; created_at: string; uploaded_by: string | null; confirmed_by: string | null; rolled_back_at: string | null; rollback_reason: string }
interface RowRec { row_number: number; status: string; raw: Record<string, string>; errors: { field: string; message: string }[]; entity_id: number | null }
type T = 'sources' | 'history' | 'quality' | 'integrity' | 'logs'

export default function DataManagementPage() {
  const { can } = useAuth()
  const [tab, setTab] = useState<T>('sources')
  const [upload, setUpload] = useState(false)
  const [batchId, setBatchId] = useState<number | null>(null)
  const sources = useQuery({ queryKey: ['sources'], queryFn: () => api.get<Source[]>('/imports/sources') })
  return (
    <div>
      <PageTitle first="Data" accent="Management" subtitle="Upload, manage and monitor data sources"
        actions={can('import:write') && <Button variant="red" onClick={() => setUpload(true)}><Upload size={16} />Upload Data</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[{ key: 'sources', label: 'Data Sources' }, { key: 'history', label: 'Upload History' }, { key: 'quality', label: 'Data Quality' }, { key: 'integrity', label: 'Usage Meter Integrity' }, { key: 'logs', label: 'Sync Logs' }]} />
      {tab === 'sources' && (
        <Panel>
          <table className="w-full text-[14px]">
            <thead><tr className="table-head [&>th]:px-4 [&>th]:py-3"><th>Data Source</th><th>Type</th><th className="text-right">Records</th><th>Last Updated</th><th>Status</th><th>Latest batch</th><th className="w-10" /></tr></thead>
            <tbody>
              {sources.isLoading && <tr><td colSpan={7}><Spinner /></td></tr>}
              {sources.data?.map((s) => (
                <tr key={s.dataset} className="row-hover border-b border-panel-line [&>td]:px-4 [&>td]:py-2.5">
                  <td><span className="flex items-center gap-3"><FileSpreadsheet size={18} className="text-accent-blueSoft" />{s.label}</span></td>
                  <td className="text-ink-muted">{titleCase(s.category)}</td>
                  <td className="text-right font-medium">{num(s.records)}</td>
                  <td className="text-ink-muted">{dateTime(s.last_updated)}</td>
                  <td><Pill value={s.status === 'EMPTY' ? 'DRAFT' : s.status} label={s.status === 'EMPTY' ? 'No data' : titleCase(s.status)} /></td>
                  <td className="text-xs text-ink-muted">{s.last_batch ? <button className="hover:text-ink" onClick={() => setBatchId(s.last_batch!.id)}>{s.last_batch.code} · {titleCase(s.last_batch.origin)}</button> : '—'}</td>
                  <td><a href={api.url(`/imports/templates/${s.dataset}.csv`)} aria-label={`Download ${s.label} template`} className="text-ink-muted hover:text-ink" title="Download CSV template"><FileDown size={16} /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2"><Basis>Raw uploaded rows are kept per batch; operational records carry their source batch and row number (lineage). Synthetic demonstration batches are labelled.</Basis></div>
        </Panel>
      )}
      {tab === 'history' && <History onOpen={setBatchId} />}
      {tab === 'quality' && <Quality sources={sources.data ?? []} />}
      {tab === 'integrity' && <UsageIntegrityPanel />}
      {tab === 'logs' && <SyncLogs />}
      <UploadWizard open={upload} onClose={() => setUpload(false)} onDone={(id) => { setUpload(false); setBatchId(id) }} />
      <BatchDrawer id={batchId} onClose={() => setBatchId(null)} />
    </div>
  )
}

function History({ onOpen }: { onOpen: (id: number) => void }) {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['batches', status, page], queryFn: () => api.get<Paged<Batch>>('/imports/batches', { status, page, page_size: 15 }) })
  return (
    <Panel>
      <div className="border-b border-panel-line p-3"><Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={[{ value: '', label: 'All statuses' }, ...['VALIDATED', 'IMPORTED', 'ROLLED_BACK', 'FAILED'].map((v) => ({ value: v, label: titleCase(v) }))]} /></div>
      <table className="w-full text-[13.5px]">
        <thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5"><th>Batch</th><th>Dataset</th><th>File</th><th className="text-right">Rows</th><th className="text-right">Accepted</th><th className="text-right">Rejected</th><th className="text-right">Duplicates</th><th>Status</th><th>Uploaded</th></tr></thead>
        <tbody>{q.data?.items.map((b) => (
          <tr key={b.id} className="row-hover cursor-pointer border-b border-panel-line [&>td]:px-3 [&>td]:py-2" onClick={() => onOpen(b.id)}>
            <td className="font-mono text-xs">{b.batch_code}</td><td>{b.dataset_label}</td><td className="max-w-[200px] truncate">{b.file_name}{b.data_origin === 'SYNTHETIC_DEMO' && <Pill value="DRAFT" label="synthetic" className="ml-2" />}</td>
            <td className="text-right">{num(b.total_rows)}</td><td className="text-right text-[#4ade80]">{num(b.accepted_rows)}</td><td className="text-right text-[#ff8796]">{num(b.rejected_rows)}</td><td className="text-right text-[#fbbf24]">{num(b.duplicate_rows)}</td>
            <td><Pill value={b.status} /></td><td className="text-xs text-ink-muted">{dateTime(b.created_at)}<div>{b.uploaded_by ?? 'system'}</div></td></tr>
        ))}</tbody>
      </table>
      {q.data && <Pager page={q.data.page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
    </Panel>
  )
}

function Quality({ sources }: { sources: Source[] }) {
  const q = useQuery({ queryKey: ['batches', 'quality'], queryFn: () => api.get<Paged<Batch>>('/imports/batches', { page_size: 200 }) })
  const issues: Record<string, number> = {}
  q.data?.items.forEach((b) => Object.entries(b.issues_summary.errors ?? {}).forEach(([k, v]) => { issues[k] = (issues[k] ?? 0) + v }))
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <Panel className="lg:col-span-7">
        <table className="w-full text-[13.5px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2.5"><th>Dataset</th><th className="text-right">Rows uploaded</th><th className="text-right">Rejected / duplicate</th><th className="text-right">Acceptance</th></tr></thead>
          <tbody>{sources.map((s) => (
            <tr key={s.dataset} className="border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td>{s.label}</td><td className="text-right">{num(s.rows_uploaded)}</td><td className="text-right">{num(s.rows_rejected_or_duplicate)}</td>
              <td className="text-right">{s.rows_uploaded ? pct(((s.rows_uploaded - s.rows_rejected_or_duplicate) * 100) / s.rows_uploaded) : '—'}</td></tr>))}</tbody></table>
      </Panel>
      <Panel className="lg:col-span-5 p-4">
        <h3 className="panel-title mb-2">Most frequent validation issues</h3>
        {Object.keys(issues).length === 0 ? <Empty title="No validation issues recorded" /> : (
          <ul className="space-y-1.5 text-sm">{Object.entries(issues).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => <li key={k} className="flex justify-between gap-2 border-b border-panel-line py-1"><span className="text-ink-muted">{k}</span><span className="font-semibold">{v}</span></li>)}</ul>)}
        <div className="mt-3"><Basis>Checks: data types, required values, allowed values, references to existing records, date ordering, duplicates within the file and against the database.</Basis></div>
      </Panel>
    </div>
  )
}

function SyncLogs() {
  const { can } = useAuth()
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['import-logs', page], enabled: can('settings:write'), queryFn: () => api.get<Paged<{ id: number; at: string; user: string; action: string; entity_id: string; details: Record<string, unknown> }>>('/audit-logs', { action: 'IMPORT', page, page_size: 20 }) })
  if (!can('settings:write')) return <Panel className="p-4"><Empty title="Sync logs are visible to administrators" /></Panel>
  return (
    <Panel>
      <table className="w-full text-[13px]"><thead><tr className="table-head [&>th]:px-3 [&>th]:py-2"><th>Time</th><th>User</th><th>Action</th><th>Batch</th><th>Details</th></tr></thead>
        <tbody>{q.data?.items.map((l) => <tr key={l.id} className="border-b border-panel-line [&>td]:px-3 [&>td]:py-2"><td className="whitespace-nowrap">{dateTime(l.at)}</td><td>{l.user}</td><td>{titleCase(l.action)}</td><td>#{l.entity_id}</td><td className="font-mono text-[11px] text-ink-muted">{JSON.stringify(l.details)}</td></tr>)}</tbody></table>
      {q.data?.items.length === 0 && <Empty title="No import activity yet" />}
      {q.data && <Pager page={q.data.page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
    </Panel>
  )
}

function UploadWizard({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: number) => void }) {
  const qc = useQueryClient()
  const specs = useQuery({ queryKey: ['dataset-specs'], queryFn: () => api.get<DatasetSpec[]>('/imports/datasets'), enabled: open })
  const [file, setFile] = useState<File | null>(null)
  const [dataset, setDataset] = useState('')
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!open) { setFile(null); setErr(''); setDataset('') } }, [open])
  const send = useMutation({
    mutationFn: () => { const f = new FormData(); f.append('file', file!); if (dataset) f.append('dataset_type', dataset); return api.upload<Batch>('/imports/upload', f) },
    onSuccess: (b) => { qc.invalidateQueries({ queryKey: ['batches'] }); onDone(b.id) },
    onError: (e) => {
      const d = e instanceof ApiError ? (e.detail as { candidates?: { label: string }[] }) : null
      setErr(`${e instanceof Error ? e.message : 'Upload failed'}${d?.candidates ? ` (closest matches: ${d.candidates.map((c) => c.label).join(', ')})` : ''}`)
    },
  })
  const spec = specs.data?.find((s) => s.key === dataset)
  return (
    <Modal open={open} onClose={onClose} title="Upload data" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="red" disabled={!file} loading={send.isPending} onClick={() => send.mutate()}>Validate file</Button></>}>
      <p className="mb-3 text-sm text-ink-muted">CSV or Excel (.xlsx), max 25 MB. The file is validated first; nothing is imported until you review the result and confirm.</p>
      <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0] ?? null) }}
        className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition', file ? 'border-accent-green/60 bg-accent-green/5' : 'border-panel-border hover:border-accent-blueSoft')}>
        {file ? <><CheckCircle2 className="text-accent-green" /><span className="text-sm">{file.name} · {(file.size / 1024).toFixed(1)} KB</span></> : <><Upload className="text-ink-muted" /><span className="text-sm">Drop a file here or click to choose</span></>}
        <input ref={input} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Choose file" />
      </div>
      <label className="label mt-4" htmlFor="ds">Dataset type</label>
      <select id="ds" className="input" value={dataset} onChange={(e) => setDataset(e.target.value)}>
        <option value="">Detect automatically from the column headers</option>
        {specs.data?.map((s) => <option key={s.key} value={s.key}>{s.label} ({titleCase(s.category)})</option>)}
      </select>
      {spec && <p className="mt-2 text-xs text-ink-muted">Expected columns: {spec.fields.map((f) => `${f.name}${f.required ? '*' : ''}`).join(', ')}. Duplicate key: {spec.natural_key.join(' + ')}.</p>}
      {err && <ErrorBox error={new Error(err)} />}
    </Modal>
  )
}

export function BatchDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { can } = useAuth()
  const [rowFilter, setRowFilter] = useState('')
  const [page, setPage] = useState(1)
  const [mapping, setMapping] = useState<Record<string, string> | null>(null)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const b = useQuery({ queryKey: ['batch', id], queryFn: () => api.get<Batch>(`/imports/batches/${id}`), enabled: id !== null })
  const specs = useQuery({ queryKey: ['dataset-specs'], queryFn: () => api.get<DatasetSpec[]>('/imports/datasets'), enabled: id !== null })
  const rows = useQuery({ queryKey: ['batch-rows', id, rowFilter, page], queryFn: () => api.get<Paged<RowRec>>(`/imports/batches/${id}/rows`, { status: rowFilter, page, page_size: 25 }), enabled: id !== null })
  useEffect(() => { setMapping(null); setErr(''); setPage(1) }, [id])
  const refresh = () => { qc.invalidateQueries({ queryKey: ['batch', id] }); qc.invalidateQueries({ queryKey: ['batch-rows', id] }); qc.invalidateQueries({ queryKey: ['batches'] }); qc.invalidateQueries({ queryKey: ['sources'] }) }
  const onErr = (e: unknown) => setErr(e instanceof Error ? e.message : 'Failed')
  const remap = useMutation({ mutationFn: () => api.put(`/imports/batches/${id}/mapping`, { column_mapping: mapping }), onSuccess: () => { setMapping(null); refresh() }, onError: onErr })
  const confirm = useMutation({ mutationFn: () => api.post(`/imports/batches/${id}/confirm`), onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['readiness'] }); qc.invalidateQueries({ queryKey: ['onboarding'] }) }, onError: onErr })
  const rollback = useMutation({ mutationFn: () => api.post(`/imports/batches/${id}/rollback`, { reason }), onSuccess: () => { setRollbackOpen(false); refresh() }, onError: onErr })
  const d = b.data
  const spec = specs.data?.find((s) => s.key === d?.dataset_type)
  const current = mapping ?? d?.column_mapping ?? {}
  return (
    <Drawer open={id !== null} onClose={onClose} width="max-w-5xl" title={d ? <span className="flex items-center gap-3"><Database size={18} />{d.batch_code} · {d.dataset_label}<Pill value={d.status} /></span> : 'Import batch'}>
      {b.isLoading && <Spinner />}
      {d && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {[['Rows', d.total_rows, ''], ['Accepted', d.accepted_rows, 'text-[#4ade80]'], ['Rejected', d.rejected_rows, 'text-[#ff8796]'], ['Duplicates', d.duplicate_rows, 'text-[#fbbf24]'], ['Inserted', d.inserted_rows, 'text-accent-blueSoft']].map(([l, v, c]) => (
              <div key={l as string} className="rounded-lg bg-space-900/60 p-3 text-center"><div className="text-xs text-ink-muted">{l}</div><div className={cn('text-xl font-bold', c as string)}>{num(v as number)}</div></div>
            ))}
          </div>
          <p className="text-ink-muted">{d.file_name} · uploaded {dateTime(d.created_at)} by {d.uploaded_by ?? 'system'}{d.confirmed_by && ` · confirmed by ${d.confirmed_by}`}{d.rolled_back_at && ` · rolled back ${dateTime(d.rolled_back_at)} (${d.rollback_reason})`}</p>
          {d.issues_summary.database_error && <ErrorBox error={new Error(d.issues_summary.database_error)} />}
          {err && <ErrorBox error={new Error(err)} />}
          {d.status === 'VALIDATED' && spec && (
            <Panel className="p-3">
              <h4 className="mb-2 font-semibold">Column mapping</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {d.source_columns.map((col) => (
                  <label key={col} className="flex items-center gap-2 text-xs"><span className="w-32 truncate text-ink-muted" title={col}>{col}</span>
                    <select className="input py-1 text-xs" value={current[col] ?? ''} onChange={(e) => setMapping({ ...current, [col]: e.target.value })}>
                      <option value="">— ignore —</option>{spec.fields.map((f) => <option key={f.name} value={f.name}>{f.name}{f.required ? ' *' : ''}</option>)}
                    </select></label>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-muted">Required: {spec.fields.filter((f) => f.required).map((f) => f.name).join(', ')}</p>
              <div className="mt-2 flex justify-end gap-2">
                {mapping && <Button loading={remap.isPending} onClick={() => remap.mutate()}>Re-validate with this mapping</Button>}
                {can('import:write') && <Button variant="red" disabled={!!mapping || d.accepted_rows === 0} loading={confirm.isPending} onClick={() => confirm.mutate()}>Confirm import of {num(d.accepted_rows)} accepted rows</Button>}
              </div>
            </Panel>
          )}
          {d.status === 'IMPORTED' && can('import:rollback') && <div className="flex justify-end"><Button variant="outline-red" onClick={() => setRollbackOpen(true)}>Roll back this batch</Button></div>}
          <div>
            <div className="mb-2 flex items-center gap-2"><h4 className="font-semibold">Rows</h4><Select label="Row status" value={rowFilter} onChange={(v) => { setRowFilter(v); setPage(1) }} options={[{ value: '', label: 'All rows' }, { value: 'ACCEPTED', label: 'Accepted' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'DUPLICATE', label: 'Duplicate' }]} /></div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="table-head [&>th]:px-2 [&>th]:py-1.5"><th>Row</th><th>Status</th>{d.source_columns.slice(0, 6).map((c) => <th key={c}>{c}</th>)}<th>Issues</th></tr></thead>
              <tbody>{rows.data?.items.map((r) => <tr key={r.row_number} className="border-b border-panel-line [&>td]:px-2 [&>td]:py-1.5"><td>{r.row_number}</td><td><Pill value={r.status === 'ACCEPTED' ? 'MATCHED' : r.status === 'DUPLICATE' ? 'MEDIUM' : 'FAILED'} label={titleCase(r.status)} /></td>
                {d.source_columns.slice(0, 6).map((c) => <td key={c} className="max-w-[140px] truncate">{r.raw[c]}</td>)}<td className="text-[#ff8796]">{r.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}</td></tr>)}</tbody></table></div>
            {rows.data && <Pager page={rows.data.page} pages={rows.data.pages} total={rows.data.total} onPage={setPage} />}
          </div>
        </div>
      )}
      <Modal open={rollbackOpen} onClose={() => setRollbackOpen(false)} title="Roll back import" footer={<><Button onClick={() => setRollbackOpen(false)}>Cancel</Button><Button variant="red" disabled={reason.trim().length < 5} loading={rollback.isPending} onClick={() => rollback.mutate()}>Roll back</Button></>}>
        <p className="mb-2 text-sm text-ink-muted">Removes exactly the records this batch inserted — only if no other data or audit results depend on them.</p>
        <textarea className="input" rows={2} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Rollback reason" />
      </Modal>
    </Drawer>
  )
}
