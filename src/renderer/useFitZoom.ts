import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * The zoom that makes a spread fit the canvas it is being drawn in.
 *
 * A 6×9in page is 576 CSS px at this app's 96dpi page scale, so a two-page
 * spread is 1152px before any chrome. On a 1440×900 laptop the canvas
 * column is 772px wide once the sidebar, the thumbnail rail and the
 * Inspector have taken their share, and on a 1280 window it is 612px. At
 * the fixed 100% zoom this app shipped with, that meant **the left-hand
 * page was simply cut off** — 13px of it at 1440, 173px at 1280 — and
 * because the scroll container centres its content, the hidden part could
 * not even be scrolled back into view. The first thing a new author saw
 * after writing a sentence was half a page.
 *
 * So the canvas fits by default, the way every layout tool does ("Fit
 * spread in window"), and 100% becomes something you choose rather than
 * something you are given.
 *
 * Capped at 1: fitting *up* on a large monitor would magnify a page past
 * its true printed size, which is exactly the wrong promise for an app
 * whose whole claim is that the screen matches the print.
 */
export const FIT_MAX = 1
/** Below this the type is unreadable and "fit" stops being a kindness. */
export const FIT_MIN = 0.25

export function computeFitZoom(containerWidthPx: number, contentWidthPx: number): number {
  if (containerWidthPx <= 0 || contentWidthPx <= 0) return FIT_MAX
  return Math.max(FIT_MIN, Math.min(FIT_MAX, containerWidthPx / contentWidthPx))
}

/**
 * Measures an element and reports the fit zoom for `contentWidthPx`.
 *
 * A `ResizeObserver` rather than a window listener, because the canvas
 * changes width without the window doing anything at all — collapsing the
 * Inspector, hiding the thumbnail rail, opening the sidebar. Each of those
 * should re-fit, and none of them fires `resize`.
 */
export function useFitZoom(contentWidthPx: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  const fitZoom = useMemo(() => computeFitZoom(width, contentWidthPx), [width, contentWidthPx])
  return { ref, fitZoom, measured: width > 0 }
}
