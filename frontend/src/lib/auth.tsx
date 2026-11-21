import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { api, setUnauthorizedHandler } from './api'
import { setDemoOptOut } from './demo'

export interface Me { id: number; email: string; full_name: string; title: string; role: 'ADMIN' | 'ANALYST' | 'VIEWER'; permissions: string[]; initials: string }

/** Why the user was signed out (shown once on the sign-in screen). */
let sessionNotice = ''
export const takeSessionNotice = () => { const n = sessionNotice; sessionNotice = ''; return n }

const Ctx = createContext<{ me: Me | null; loading: boolean; can: (p: string) => boolean; logout: () => Promise<void> } | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), retry: false, staleTime: 5 * 60_000 })
  useEffect(() => setUnauthorizedHandler((detail) => {
    // Only a session that was active can "expire"; a failed probe before sign-in is not news.
    if (qc.getQueryData(['me'])) {
      sessionNotice = /inactivity/i.test(detail) ? 'You were signed out after a period of inactivity. Please sign in again.'
        : 'Your session has ended. Please sign in again.'
      qc.setQueryData(['me'], null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'auth-options' })
    }
  }), [qc])
  const me = data ?? null
  return (
    <Ctx.Provider value={{
      me, loading: isLoading, can: (p) => !!me?.permissions.includes(p),
      logout: async () => {
        setDemoOptOut(true)  // after signing out, show the sign-in form rather than re-opening the demo
        try { await api.post('/auth/logout') } finally {
          // Signal "signed out" on the query the guard observes, then drop every other cached response.
          // (qc.clear() would also delete the observed 'me' query, leaving the guard on stale data.)
          qc.setQueryData(['me'], null)
          qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
        }
      },
    }}>{children}</Ctx.Provider>
  )
}
export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
