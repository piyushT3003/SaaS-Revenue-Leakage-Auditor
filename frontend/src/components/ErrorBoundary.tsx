import { RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/monitoring'

/** Catches rendering errors so one broken view never blanks the whole app; reports them when monitoring is on. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { reportError(error, { componentStack: info.componentStack }) }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }) // navigating away recovers
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="panel mx-auto mt-10 max-w-lg space-y-3 p-6 text-center">
        <h2 className="text-lg font-semibold">This view hit an unexpected error</h2>
        <p className="text-sm text-ink-muted">Your data is safe — nothing was changed. Try again, or open another page from the sidebar.</p>
        <button className="btn-red mx-auto" onClick={() => this.setState({ error: null })}><RotateCcw size={15} />Try again</button>
      </div>
    )
  }
}
