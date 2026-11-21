/** Optional browser error reporting (Sentry). Loaded only when the server advertises a browser DSN, so the
 *  SDK costs nothing otherwise. Reports go to this site's own /api tunnel (CSP stays 'self'). No PII is sent. */
import { api } from './api'

type Reporter = (error: unknown, context?: Record<string, unknown>) => void
let report: Reporter = () => {}
export const reportError: Reporter = (e, c) => report(e, c)

export async function initMonitoring() {
  try {
    const opts = await api.get<{ sentry: { dsn: string; environment: string; release: string } | null }>('/auth/options')
    if (!opts.sentry) return
    const { start } = await import('./sentry-init')
    report = start(opts.sentry)
  } catch { /* monitoring must never break the app */ }
}
