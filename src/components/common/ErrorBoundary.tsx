import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useErrorLogStore } from '@/store/errorLogStore'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown above the message, e.g. "the editor". Helps a report say *where*
   * it broke, not just that it did. */
  area?: string
  /** Rendered instead of the default panel — used where a crash should
   * degrade one region rather than take over the screen. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render errors and shows what went wrong instead of a white screen.
 *
 * Book Studio had **no error boundary anywhere**, which meant any error thrown
 * during render unmounted the entire React tree and left a blank page — no
 * message, no way back, and nothing for a user to report beyond "it went
 * white". `docs/STATUS.md` records exactly that happening once before (the
 * Zustand selector infinite-loop incident), and it happened again on mobile.
 *
 * React only routes *render* errors here. An error inside an event handler
 * still escapes to `window.onerror`, so `componentDidCatch` logs are not the
 * whole picture — but a blank screen is always a render error, which is
 * precisely the case this covers.
 *
 * The panel deliberately shows the real error text. A user who can read
 * "Cannot read properties of null" and copy it can get a fix in one round
 * trip; "Something went wrong" costs several.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Also recorded, so the details survive the "Try again" that clears this
    // panel — and so a report written afterwards still has the stack. See
    // `store/errorLogStore.ts` for why a local log is the useful thing here.
    useErrorLogStore.getState().record({
      source: 'render',
      area: this.props.area,
      name: error.name,
      message: error.message,
      stack: `${error.stack ?? ''}${info.componentStack ?? ''}`,
      path: typeof window === 'undefined' ? undefined : window.location.pathname,
    })
    // Kept as a real console error so it still reaches remote logging or a
    // device console even though the UI has recovered.
    console.error('Book Studio crashed while rendering', this.props.area ?? '', error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  override render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    const details = `${error.name}: ${error.message}\n\n${error.stack ?? ''}`

    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-panel p-5 text-left shadow-[var(--shadow-md)]">
          <h1 className="text-base font-semibold text-text-primary">
            Something broke{this.props.area ? ` in ${this.props.area}` : ''}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Your work is saved — this is a display problem, not lost data. Try again, and if it keeps happening the
            details below say what went wrong.
          </p>

          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-button)] bg-background-secondary p-3 text-[11px] leading-relaxed text-text-secondary">
            {error.name}: {error.message}
          </pre>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-[var(--radius-button)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-[var(--radius-button)] border border-border px-3 py-2 text-sm font-medium text-text-primary"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(details)}
              className="rounded-[var(--radius-button)] border border-border px-3 py-2 text-sm font-medium text-text-secondary"
            >
              Copy details
            </button>
          </div>
        </div>
      </div>
    )
  }
}
