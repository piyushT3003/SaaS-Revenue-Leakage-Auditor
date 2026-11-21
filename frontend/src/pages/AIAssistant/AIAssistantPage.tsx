import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Database, Lock, MessageSquarePlus, SendHorizontal, ShieldCheck, Sparkles, Trash2, Wrench } from 'lucide-react'
import { Fragment, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTip, ErrorBox, Panel, Spinner } from '@/components/ui'
import { PageTitle } from '@/layouts/AppLayout'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { inr, inrCompact, num, pct, relative, titleCase, toNumber } from '@/lib/format'
import { periodParams, usePeriod } from '@/lib/period'
import { useCan3D } from '@/lib/webgl'

const HoloCore = lazy(() => import('@/components/three/HoloCore'))

interface ToolCall { tool: string; args: Record<string, unknown>; ms: number; error: string | null; source: string[]; definition: string; row_count: number }
interface Block { type: 'kpis' | 'table' | 'bar'; tool: string; rows: Record<string, unknown>[]; items?: { label: string; value: string | null; unit: string }[]; columns?: { key: string; label: string; format?: string }[]; x?: string; y?: string; format?: string }
interface Msg { id?: number; role: 'user' | 'assistant'; content: string; mode?: string; tool_calls?: ToolCall[]; blocks?: Block[]; suggestions?: string[]; notice?: string; refused?: boolean; pending?: boolean }
interface Status { mode: 'llm' | 'deterministic'; provider: string | null; model: string | null; can_query: boolean; suggestions: string[]; note: string; tools: { name: string; description: string }[] }
type Orb = 'idle' | 'thinking' | 'answered' | 'refused'

export default function AIAssistantPage() {
  const { period } = usePeriod()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<Status>('/ai/status') })
  const convs = useQuery({ queryKey: ['ai-convs'], queryFn: () => api.get<{ id: string; title: string; updated_at: string }[]>('/ai/conversations'), enabled: !!status.data?.can_query })
  const [cid, setCid] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const asked = useRef(false)

  const send = useMutation({
    mutationFn: (q: string) => api.post<Msg & { conversation_id: string; answer: string }>('/ai/ask', { question: q, conversation_id: cid, ...periodParams(period) }),
    onMutate: (q) => { setMsgs((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '', pending: true }]); setInput('') },
    onSuccess: (r) => {
      setCid(r.conversation_id)
      setMsgs((m) => [...m.slice(0, -1), { role: 'assistant', content: r.answer, mode: r.mode, tool_calls: r.tool_calls, blocks: r.blocks, suggestions: r.suggestions, notice: r.notice, refused: r.refused }])
      qc.invalidateQueries({ queryKey: ['ai-convs'] })
    },
    onError: (e) => setMsgs((m) => [...m.slice(0, -1), { role: 'assistant', content: e instanceof Error ? e.message : 'The assistant could not answer.', refused: true }]),
  })
  const ask = (q: string) => { if (q.trim() && !send.isPending) send.mutate(q.trim()) }
  const open = async (id: string) => {
    const c = await api.get<{ messages: Msg[] }>(`/ai/conversations/${id}`)
    setCid(id); setMsgs(c.messages)
  }
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/ai/conversations/${id}`), onSuccess: (_, id) => { if (id === cid) { setCid(null); setMsgs([]) } qc.invalidateQueries({ queryKey: ['ai-convs'] }) } })

  useEffect(() => {
    const q = params.get('q')
    if (q && status.data?.can_query && !asked.current) { asked.current = true; params.delete('q'); setParams(params, { replace: true }); ask(q) }
  }, [status.data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // a new question scrolls to the bottom; a new answer scrolls to its first line so long answers read from the top
    const all = end.current?.parentElement?.querySelectorAll<HTMLElement>('[data-msg]'); const el = all?.[all.length - 1]
    if (el && msgs[msgs.length - 1]?.role === 'assistant' && !msgs[msgs.length - 1]?.pending) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs])

  const last = msgs[msgs.length - 1]
  const orb: Orb = send.isPending ? 'thinking' : last?.refused ? 'refused' : last?.role === 'assistant' ? 'answered' : 'idle'
  if (status.isLoading) return <Spinner />
  if (status.error) return <ErrorBox error={status.error} />
  const st = status.data!

  return (
    <div>
      <PageTitle first="AI Investigation" accent="Assistant" subtitle="Ask questions about revenue, billing, customers or anomalies" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <Panel red className="flex flex-col items-center p-5 text-center">
            <Core3D state={orb} />
            <div className="mt-3 text-sm font-semibold">{orb === 'thinking' ? 'Querying reconciled data…' : orb === 'refused' ? 'Read-only boundary' : orb === 'answered' ? 'Answer grounded in tool results' : 'Ready to investigate'}</div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span className={cn('h-1.5 w-1.5 rounded-full', st.mode === 'llm' ? 'bg-emerald-400' : 'bg-accent-blueSoft')} />
              {st.mode === 'llm' ? `Language model: ${st.model}` : 'Built-in analysis engine (no LLM configured)'}
            </div>
          </Panel>
          {st.can_query && (
            <Panel className="p-3">
              <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs uppercase tracking-wider text-ink-muted">Conversations</span>
                <button className="flex items-center gap-1 text-xs text-accent-blueSoft" onClick={() => { setCid(null); setMsgs([]) }}><MessageSquarePlus size={13} />New</button></div>
              <div className="scroll-thin max-h-[300px] space-y-1 overflow-y-auto">
                {convs.data?.length === 0 && <p className="px-1 text-xs text-ink-faint">No conversations yet.</p>}
                {convs.data?.map((c) => (
                  <div key={c.id} className={cn('group flex items-center rounded-lg px-2 py-1.5 text-sm', c.id === cid ? 'bg-accent-red/12 ring-1 ring-accent-red/40' : 'hover:bg-white/5')}>
                    <button className="min-w-0 flex-1 text-left" onClick={() => open(c.id)}><div className="truncate">{c.title}</div><div className="text-[10px] text-ink-faint">{relative(c.updated_at)}</div></button>
                    <button aria-label="Delete conversation" className="invisible p-1 text-ink-faint hover:text-accent-red group-hover:visible" onClick={() => remove.mutate(c.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          <Panel className="p-4 text-xs text-ink-muted">
            <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink"><ShieldCheck size={14} className="text-emerald-400" />Guardrails</div>
            <p>{st.note}</p>
            <p className="mt-2">{st.tools.length} approved tools · tenant-scoped · every answer shows the queries it used.</p>
          </Panel>
        </div>

        <Panel className="lg:col-span-9 flex h-[calc(100vh-190px)] min-h-[520px] flex-col">
          <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-5" aria-live="polite">
            {msgs.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                <div><h2 className="text-xl font-semibold">What would you like to investigate?</h2>
                  <p className="mt-1 text-sm text-ink-muted">Period: {period.label}. Mention a month, a customer or an exception code (e.g. EX-1029) to focus the answer.</p></div>
                <div className="grid w-full max-w-3xl grid-cols-2 gap-2">
                  {st.suggestions.map((s) => (
                    <motion.button key={s} whileHover={{ y: -2 }} disabled={!st.can_query} onClick={() => ask(s)}
                      className="rounded-xl border border-panel-border bg-space-900/60 px-4 py-3 text-left text-sm hover:border-accent-blueSoft/60 disabled:opacity-50">{s}</motion.button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => <div key={i} data-msg><Message m={m} onAsk={ask} canAsk={st.can_query && !send.isPending} /></div>)}
            <div ref={end} />
          </div>
          <form className="flex items-end gap-2 border-t border-panel-line p-3" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
            {st.can_query ? (
              <>
                <textarea rows={1} className="input max-h-32 min-h-[44px] flex-1 resize-none py-2.5" placeholder="Ask about leakage, billing, receivables, customers or audits…"
                  aria-label="Question" value={input} maxLength={1000} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }} />
                <button type="submit" className="btn-red h-[44px] px-4" disabled={!input.trim() || send.isPending} aria-label="Send"><SendHorizontal size={17} /></button>
              </>
            ) : <div className="flex w-full items-center gap-2 rounded-lg border border-panel-line px-3 py-3 text-sm text-ink-muted"><Lock size={15} />Your role can view dashboards but not query the assistant. Ask an administrator for Analyst access.</div>}
          </form>
        </Panel>
      </div>
    </div>
  )
}

function Message({ m, onAsk, canAsk }: { m: Msg; onAsk: (q: string) => void; canAsk: boolean }) {
  const [open, setOpen] = useState(false)
  if (m.role === 'user') return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-accent-red/15 px-4 py-2.5 text-sm ring-1 ring-accent-red/30">{m.content}</motion.div>
  if (m.pending) return <div className="flex items-center gap-2 text-sm text-ink-muted"><span className="flex gap-1">{[0, 1, 2].map((i) => <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-accent-blueSoft" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }} />)}</span>Running approved queries…</div>
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[92%] space-y-3">
      <div className="flex gap-3">
        <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', m.refused ? 'bg-amber-400/15 text-amber-300' : 'bg-accent-blue/20 text-accent-blueSoft')}><Sparkles size={15} /></div>
        <div className="min-w-0 flex-1 space-y-3">
          {m.notice && <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100">{m.notice}</div>}
          <Rich text={m.content} />
          {m.blocks?.map((b, i) => <BlockView key={i} b={b} />)}
          {!!m.tool_calls?.length && (
            <div className="rounded-lg border border-panel-line">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:text-ink" onClick={() => setOpen(!open)} aria-expanded={open}>
                <Wrench size={13} />How this was calculated · {m.tool_calls.length} quer{m.tool_calls.length === 1 ? 'y' : 'ies'} · {m.mode === 'llm' ? 'language model' : 'built-in engine'}
                <ChevronDown size={13} className={cn('ml-auto transition', open && 'rotate-180')} /></button>
              <AnimatePresence>{open && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="space-y-2 border-t border-panel-line p-3 text-xs">{m.tool_calls.map((c, i) => (
                    <div key={i}>
                      <div className="font-mono text-[11px] text-accent-cyan">{c.tool}({Object.entries(c.args).map(([k, v]) => `${k}=${String(v)}`).join(', ')}) · {c.row_count} rows · {c.ms} ms</div>
                      {c.error ? <div className="text-[#ff9aa6]">{c.error}</div> : <>
                        <div className="text-ink-muted">{c.definition}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-ink-faint"><Database size={11} />{c.source.join(' · ')}</div></>}
                    </div>
                  ))}</div>
                </motion.div>)}</AnimatePresence>
            </div>
          )}
          {!!m.suggestions?.length && (
            <div className="flex flex-wrap gap-2">{m.suggestions.map((s) => <button key={s} disabled={!canAsk} onClick={() => onAsk(s)} className="chip bg-white/5 text-ink-muted ring-1 ring-panel-line hover:text-ink disabled:opacity-50">{s}</button>)}</div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/** Minimal, safe renderer for the assistant's markdown subset: **bold**, numbered and bulleted lists, paragraphs. */
function Rich({ text }: { text: string }) {
  const bold = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <b key={i} className="text-white">{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>)
  const groups: { kind: 'p' | 'ol' | 'ul'; lines: string[] }[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const kind = /^\d+\.\s/.test(t) ? 'ol' : /^[-•]\s/.test(t) ? 'ul' : 'p'
    const g = groups[groups.length - 1]
    if (g && g.kind === kind && kind !== 'p') g.lines.push(t.replace(/^(\d+\.|[-•])\s/, ''))
    else groups.push({ kind, lines: [kind === 'p' ? t : t.replace(/^(\d+\.|[-•])\s/, '')] })
  }
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-ink">
      {groups.map((g, i) => g.kind === 'p' ? <p key={i}>{bold(g.lines[0])}</p>
        : g.kind === 'ol' ? <ol key={i} className="list-decimal space-y-0.5 pl-5">{g.lines.map((l, j) => <li key={j}>{bold(l)}</li>)}</ol>
          : <ul key={i} className="list-disc space-y-0.5 pl-5">{g.lines.map((l, j) => <li key={j}>{bold(l)}</li>)}</ul>)}
    </div>
  )
}

const fmt = (v: unknown, f?: string) => v === null || v === undefined ? '—' : f === 'inr' ? inr(v as string) : f === 'inr_sign' ? inr(v as string, { sign: true }) : f === 'pct' ? pct(v as string) : f === 'num' ? num(v as number) : String(v)

function BlockView({ b }: { b: Block }) {
  if (b.type === 'kpis' && b.items) return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{b.items.map((k) => (
      <div key={k.label} className="rounded-lg border border-panel-line bg-space-900/50 p-3"><div className="text-[11px] text-ink-muted">{k.label}</div>
        <div className="text-lg font-semibold">{k.value === null ? '—' : k.unit === 'PERCENT' ? pct(k.value) : inr(k.value, { decimals: 0 })}</div></div>
    ))}</div>
  )
  if (!b.rows.length) return null
  if (b.type === 'bar') return (
    <div className="rounded-lg border border-panel-line bg-space-900/40 p-2">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={b.rows.map((r) => ({ name: titleCase(String(r[b.x!])), value: toNumber(r[b.y!] as string) }))}>
          <CartesianGrid stroke="rgba(120,150,255,0.12)" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
          <YAxis tickFormatter={b.format === 'inr' ? inrCompact : undefined} tickLine={false} axisLine={false} width={56} />
          <Tooltip content={<ChartTip fmt={(v) => (b.format === 'inr' ? inr(v) : num(v))} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="value" name={titleCase(b.y)} fill="#ef2b45" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
  if (b.type === 'table' && b.columns) return (
    <div className="overflow-hidden rounded-lg border border-panel-line">
      <table className="table-dark w-full text-[13px]"><thead><tr>{b.columns.map((c) => <th key={c.key} className={c.format ? 'text-right' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{b.columns!.map((c) => <td key={c.key} className={c.format ? 'text-right tabular-nums' : ''}>{fmt(r[c.key], c.format)}</td>)}</tr>)}</tbody></table>
    </div>
  )
  return null
}

function Core3D({ state }: { state: Orb }) {
  const can = useCan3D()
  if (!can) return <Hologram state={state} />
  return <div className="h-48 w-full"><Suspense fallback={<Hologram state={state} />}><HoloCore state={state} className="!h-48 !w-full" /></Suspense></div>
}

/** Fallback holographic core (no WebGL / reduced motion). Pure SVG + motion: rings spin faster while querying, turn amber at the read-only boundary. */
function Hologram({ state }: { state: Orb }) {
  const reduce = useReducedMotion()
  const color = state === 'refused' ? '#f5a524' : state === 'thinking' ? '#22d3ee' : '#4c8dff'
  const speed = state === 'thinking' ? 2.2 : 9
  const spin = (dir: number, dur: number) => (reduce ? {} : { animate: { rotate: 360 * dir }, transition: { repeat: Infinity, ease: 'linear' as const, duration: dur } })
  return (
    <div className="relative h-44 w-44" aria-hidden>
      <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${color}33 0%, transparent 65%)` }} />
      <motion.svg viewBox="0 0 200 200" className="absolute inset-0" {...spin(1, speed)}>
        <ellipse cx="100" cy="100" rx="88" ry="30" fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4 6" />
      </motion.svg>
      <motion.svg viewBox="0 0 200 200" className="absolute inset-0" style={{ rotate: 60 }} {...spin(-1, speed * 1.3)}>
        <ellipse cx="100" cy="100" rx="80" ry="26" fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="1" />
      </motion.svg>
      <motion.svg viewBox="0 0 200 200" className="absolute inset-0" style={{ rotate: -60 }} {...spin(1, speed * 1.6)}>
        <ellipse cx="100" cy="100" rx="72" ry="22" fill="none" stroke="#ef2b45" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 5" />
      </motion.svg>
      <motion.div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle at 35% 30%, #fff 0%, ${color} 35%, #0b1a4a 100%)`, boxShadow: `0 0 40px ${color}, inset 0 0 18px #ffffff55` }}
        animate={reduce ? {} : { scale: state === 'thinking' ? [1, 1.12, 1] : [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: state === 'thinking' ? 0.9 : 3 }} />
      <div className="absolute inset-x-6 bottom-2 h-3 rounded-[50%] blur-md" style={{ background: color, opacity: 0.35 }} />
    </div>
  )
}
