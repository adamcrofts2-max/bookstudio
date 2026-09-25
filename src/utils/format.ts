const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
]

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** Formats an ISO timestamp as "3 hours ago", "just now", etc. */
export function formatRelativeTime(isoDate: string): string {
  const seconds = (Date.parse(isoDate) - Date.now()) / 1000

  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return relativeFormatter.format(Math.round(seconds / secondsInUnit), unit)
    }
  }
  return 'just now'
}

export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(isoDate))
}

/**
 * A date and time as a person would write it — "24 Sep 2026, 18:44".
 *
 * Replaces the eight scattered `new Date(x).toLocaleString()` calls, which
 * printed seconds nobody needed ("9/24/2026, 6:44:05 PM") and each picked
 * their own format by accident (Phase 177). One formatter, used everywhere
 * a timestamp is shown, so a saved version, a backup and a review report
 * all look like they belong to the same application.
 */
export function formatTimestamp(isoDate: string | number | Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoDate))
}

/** Strips HTML tags from a sanitised inline fragment, returning plain text. */
export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent ?? ''
}

/** Counts words in plain text, collapsing runs of whitespace. */
export function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Escapes regex special characters so a value can be dropped into a
 * `RegExp` literally — used everywhere this codebase does word-boundary name
 * matching (Layer 0 entity names/prompt-context detection, paste-back
 * suggestions, and the Virtual Editor's continuity checker) so a name like
 * "Dr. Vance" doesn't blow up matching on the unescaped `.`. One shared
 * implementation rather than a copy per call site. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
