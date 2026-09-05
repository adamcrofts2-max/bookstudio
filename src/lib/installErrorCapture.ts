import { useErrorLogStore } from '@/store/errorLogStore'

/**
 * Routes the errors React's boundaries never see into `errorLogStore`.
 *
 * A boundary catches render errors only. An exception thrown inside a
 * `pointerup` handler, or a promise rejection nobody awaited, unwinds to the
 * window — where, on a phone, it reaches a console no one can open. Those are
 * exactly the failures that get reported as "it just stopped working" with no
 * detail attached, so they are the ones most worth capturing.
 *
 * Deliberately does not preventDefault or swallow anything: the console must
 * keep receiving these, because that is where they are read during
 * development. This only makes a copy.
 *
 * Idempotent — a second call in the same document does nothing, so React 19's
 * double-invoked effects in development cannot install two listeners and
 * record everything twice.
 */
let installed = false

export function installErrorCapture() {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    // A failed <img>/<script> load also fires `error` on the window during
    // capture, but as an Event rather than an ErrorEvent with a real error —
    // those are not application faults and would drown the log.
    if (!(event instanceof ErrorEvent)) return
    const error = event.error instanceof Error ? event.error : null
    useErrorLogStore.getState().record({
      source: 'window',
      name: error?.name ?? 'Error',
      message: error?.message ?? event.message ?? 'Unknown error',
      stack: error?.stack,
      path: window.location.pathname,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    const error = reason instanceof Error ? reason : null
    useErrorLogStore.getState().record({
      source: 'unhandled-rejection',
      name: error?.name ?? 'UnhandledRejection',
      message: error?.message ?? String(reason),
      stack: error?.stack,
      path: window.location.pathname,
    })
  })
}
