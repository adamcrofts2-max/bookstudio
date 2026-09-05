import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface LoggedError {
  id: string
  at: string
  /** Where it came from — a render error caught by a boundary, an uncaught
   * event-handler error, or a rejected promise nobody awaited. */
  source: 'render' | 'window' | 'unhandled-rejection'
  /** The boundary's `area` for render errors ("Book Graph", "the editor"). */
  area?: string
  name: string
  message: string
  stack?: string
  /** The route it happened on, with the project id kept — reproducing a
   * crash usually starts with "which screen were you on". */
  path?: string
}

interface ErrorLogState {
  errors: LoggedError[]
}

interface ErrorLogActions {
  record: (error: Omit<LoggedError, 'id' | 'at'>) => void
  clear: () => void
}

/** Enough to cover a session's worth of a repeating fault without letting a
 * crash loop fill the storage quota that the manuscript also lives in. */
export const MAX_LOGGED_ERRORS = 25

/**
 * Anything shaped like an Anthropic API key, so it cannot ride out of the
 * browser inside a stack trace.
 *
 * `AiSettingsDialog` tells the user their key is "never included in a
 * problem report". That has to be enforced rather than believed: the point
 * of a diagnostics report is that people send it to someone else, and an
 * SDK is entitled to put a request — headers included — into an error
 * message without asking this app's opinion. Redacting at the moment of
 * recording covers every path into the log at once, which is cheaper and
 * far more reliable than auditing each producer.
 */
const API_KEY_PATTERN = /sk-ant-[\w-]{8,}/g

function redactSecrets(text: string | undefined): string | undefined {
  if (!text) return text
  return text.replace(API_KEY_PATTERN, 'sk-ant-[redacted]')
}

/** Shared empty array so selectors never return a fresh `[]` literal — see
 * `templateStore.ts`'s `EMPTY_TEMPLATES` for the re-render loop this avoids. */
export const EMPTY_ERRORS: LoggedError[] = []

/**
 * A small, local record of what has gone wrong.
 *
 * Book Studio has no backend, so there is no crash-reporting service to send
 * anything to and there is not going to be one until Phase G is decided. What
 * there *can* be is a report the user is able to hand over — which is the part
 * that was actually missing. The mobile Book Graph crash (Phase 134) reached
 * the author of this app as a **photograph of a phone screen**, because that
 * was genuinely the only way to get the message out of the device.
 *
 * Deliberately not just a bigger error boundary. React routes only *render*
 * errors to a boundary; an error thrown inside an event handler or a rejected
 * promise escapes to `window` and, until now, went nowhere but a console
 * nobody has open on a phone. `installErrorCapture` catches those too, so the
 * log holds the failures that were previously invisible.
 *
 * Persisted, because the most useful report is the one written after the app
 * has recovered and the user has calmed down — and because a reload was
 * previously enough to destroy the only evidence.
 */
export const useErrorLogStore = create<ErrorLogState & ErrorLogActions>()(
  persist(
    (set) => ({
      errors: EMPTY_ERRORS,

      record: (error) =>
        set((state) => {
          const entry: LoggedError = {
            ...error,
            message: redactSecrets(error.message) ?? error.message,
            stack: redactSecrets(error.stack),
            id: `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            at: new Date().toISOString(),
          }
          // Identical faults repeat — a broken render loops, a bad handler
          // fires on every tap. Collapsing an immediate repeat keeps the log
          // readable without hiding that it happened more than once, which
          // the timestamps still show for anything non-consecutive.
          const previous = state.errors[0]
          if (previous && previous.message === entry.message && previous.name === entry.name) {
            return { errors: [entry, ...state.errors.slice(1)].slice(0, MAX_LOGGED_ERRORS) }
          }
          return { errors: [entry, ...state.errors].slice(0, MAX_LOGGED_ERRORS) }
        }),

      clear: () => set({ errors: EMPTY_ERRORS }),
    }),
    {
      name: 'book-studio.errorLog',
      version: 1,
    },
  ),
)
