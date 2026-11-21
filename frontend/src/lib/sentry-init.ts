// Named imports only, so the bundler tree-shakes the SDK down to error reporting (no replay, no tracing).
import { captureException, init } from '@sentry/react'

export function start(o: { dsn: string; environment: string; release: string }) {
  init({
    dsn: o.dsn, environment: o.environment, release: o.release,
    tunnel: '/api/v1/monitoring/sentry-tunnel', tracesSampleRate: 0,
    beforeSend(event) { delete event.user; if (event.request) { delete event.request.cookies; delete event.request.headers } return event },
  })
  return (e: unknown, extra?: Record<string, unknown>) => { captureException(e, extra ? { extra } : undefined) }
}
