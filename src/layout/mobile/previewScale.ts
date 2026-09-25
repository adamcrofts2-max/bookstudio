/**
 * Scaling rule for the mobile book preview (Phase 127).
 *
 * Its own module rather than an export alongside `MobilePreviewView` so that
 * file exports only its component — the `react(only-export-components)` rule,
 * and the reason it exists: mixing a component and a plain helper in one file
 * breaks Fast Refresh.
 */

/** Breathing room either side of the scaled page, in CSS px. */
export const PREVIEW_HORIZONTAL_PADDING_PX = 32

/**
 * How far down a real page must be scaled to fit the viewport.
 *
 * A page is a fixed physical size (a 6×9in trim is ~680px wide at this app's
 * scale, far wider than a phone). The preview renders the page at true size
 * and scales it with CSS rather than reflowing the text: reflowing would
 * change where pages break, showing the author a different book from the one
 * that prints.
 *
 * Returns 0 when the container has not been measured yet, which the view
 * renders as its loading state rather than as a zero-sized page.
 */
export function computePreviewScale(containerWidthPx: number, pageWidthPx: number): number {
  if (containerWidthPx <= 0 || pageWidthPx <= 0) return 0
  const available = containerWidthPx - PREVIEW_HORIZONTAL_PADDING_PX
  if (available <= 0) return 0
  // Never scale *up*: on a wide viewport a page sits at its true size rather
  // than being blown up past 100%.
  return Math.min(available / pageWidthPx, 1)
}
