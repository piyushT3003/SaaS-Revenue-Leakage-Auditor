import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, LogIn } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/ui'
import { api } from './api'
import { useAuth } from './auth'

export interface AuthOptions {
  password_reset_email: boolean; demo_login: boolean; demo_auto: boolean; demo_email: string | null; synthetic_data: boolean
  operator?: { name: string; contact: string; email_provider: string; error_monitoring: boolean; llm_provider: string }
}
export const useAuthOptions = () =>
  useQuery({ queryKey: ['auth-options'], queryFn: () => api.get<AuthOptions>('/auth/options'), staleTime: 5 * 60_000, retry: 1 })

/** A visitor who chose to sign in (or signed out) must not be dropped back into the demo during this tab session.
 *  `?signin` in the URL does the same, which also gives tests and real users a direct link to the sign-in form. */
const OPT_OUT = 'sra.demo.optout'
export function demoOptedOut() {
  if (new URLSearchParams(window.location.search).has('signin')) {
    try { sessionStorage.setItem(OPT_OUT, '1') } catch { /* storage unavailable */ }
    return true
  }
  try { return sessionStorage.getItem(OPT_OUT) === '1' } catch { return false }
}
export function setDemoOptOut(on: boolean) {
  try { if (on) sessionStorage.setItem(OPT_OUT, '1'); else sessionStorage.removeItem(OPT_OUT) } catch { /* ignore */ }
}

/** Demo mode: opens the read-only demo account straight away, no sign-in form. Falls back to the form on error. */
export function DemoEntry({ onFail }: { onFail: () => void }) {
  const qc = useQueryClient()
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    api.post<{ user: unknown }>('/auth/demo-login').then((r) => qc.setQueryData(['me'], r.user)).catch(onFail)
  }, [qc, onFail])
  return <Spinner label="Opening the live demo…" />
}

/** Slim banner shown while using the demo account: what it is, and the way out to a real sign-in. */
export function DemoBanner() {
  const { me, logout } = useAuth()
  const opts = useAuthOptions()
  const [busy, setBusy] = useState(false)
  if (!me || !opts.data?.demo_email || me.email.toLowerCase() !== opts.data.demo_email) return null
  return (
    <div role="status" className="relative z-20 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-accent-blueSoft/30 bg-accent-blueSoft/10 px-4 py-1.5 text-[13px] text-[#cfe0ff]">
      <span className="flex items-center gap-1.5"><Eye size={14} /><b>Live demo</b> · read-only, synthetic data. Explore every page; changes are disabled.</span>
      <button className="flex items-center gap-1 rounded-full border border-accent-blueSoft/50 px-3 py-0.5 font-medium hover:bg-accent-blueSoft/20 disabled:opacity-60"
        disabled={busy} onClick={async () => { setBusy(true); await logout() }}><LogIn size={13} />Sign in with your account</button>
    </div>
  )
}
