import { useEffect, useRef, useState } from 'react'

import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'
import { Page } from '@/renderer/Page'

interface LazySpreadProps {
  projectId: string
  spread: LaidOutPage[]
  pageBox: PageBox
  theme: ResolvedBookTheme
  dropCapBlockIds: Set<string>
  toc: TocEntry[]
  bookTitle: string
  language?: string
  /**
   * Mount this spread's real pages immediately, skipping the
   * IntersectionObserver wait — used to jump straight to a chapter that
   * hasn't scrolled into view yet (see `BookRenderer`'s scroll-request
   * handling). Pins the spread mounted for as long as it stays true —
   * Reading Mode renders exactly one spread and passes it permanently.
   */
  forceVisible?: boolean
  /** Passed straight through to `Page.tsx`'s own `decorative` prop — see
   * that file's doc comment. Used by Reading Mode (`FocusModeLayout.tsx`)
   * to render full-size, fully non-interactive pages; `undefined`/`false`
   * everywhere else preserves today's fully-editable behavior exactly. */
  decorative?: boolean
}

/** How near the viewport a spread must come before its real pages mount. */
const MOUNT_MARGIN_PX = 1200
/**
 * How far it must travel before they are thrown away again — deliberately
 * much larger than `MOUNT_MARGIN_PX`. The gap between the two is hysteresis:
 * with a single threshold, a spread parked exactly on the boundary would
 * mount and unmount on every few pixels of scroll, which is worse than
 * either behaviour on its own.
 */
const KEEP_MARGIN_PX = 4000

/**
 * Defers mounting a spread's real `<Page>` components until it scrolls near
 * the viewport, rendering a cheap placeholder box until then, and throws
 * them away again once it is a long way off-screen. Books can run to 1,000+
 * pages (see CLAUDE.md's performance guidance).
 *
 * It used to mount and never unmount, which made the DOM grow monotonically
 * for as long as the app stayed open — and that turned out to be the whole
 * of the "structural-page mutation freeze" `docs/ROADMAP.md` Phase J carried
 * unprofiled since Phase 21 (15-30s on a 17-chapter project).
 *
 * The measurements that settled it, same 1,700-block book, same insert:
 *
 *     6,667 DOM nodes (opened, not scrolled)   ->   140ms longest task
 *    76,911 DOM nodes (scrolled end to end)    ->  4,340ms longest task
 *
 * Structural pages had nothing to do with it. A CPU profile put the time in
 * `focus()` and Floating UI's offset-parent walk — both O(DOM), both forced
 * to recompute layout over a tree that never stopped growing. Any
 * interaction would do; inserting a page was simply the one people did after
 * enough scrolling, which is why the bug was filed under its name for a
 * year. Unmounting fixes it at the source, and is why this stayed a "cheap
 * placeholder" rather than becoming a full virtualised-list rewrite.
 *
 * Two things make unmounting safe here. The placeholder is exactly the same
 * size as the pages it replaces, so the scroll position never jumps; and a
 * spread containing the caret is never unmounted, so a mid-edit scroll can't
 * discard the field being typed into.
 */
export function LazySpread({ projectId, spread, pageBox, theme, dropCapBlockIds, toc, bookTitle, language, forceVisible, decorative }: LazySpreadProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const isVisible = visible || Boolean(forceVisible)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const mountObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin: `${MOUNT_MARGIN_PX}px 0px`, threshold: 0 },
    )

    const keepObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) return
        // Never pull the rug from under an active edit: `contains` covers
        // the caret sitting in any contentEditable inside these pages, and
        // any focused control (a caption field, an inspector-driven
        // selection) alike.
        if (el.contains(document.activeElement)) return
        setVisible(false)
      },
      { rootMargin: `${KEEP_MARGIN_PX}px 0px`, threshold: 0 },
    )

    mountObserver.observe(el)
    keepObserver.observe(el)
    return () => {
      mountObserver.disconnect()
      keepObserver.disconnect()
    }
    // Deliberately not keyed on `isVisible`: both observers stay attached for
    // this spread's whole life, because a spread now has to be able to travel
    // back and forth across both thresholds any number of times.
  }, [])

  return (
    <div ref={ref} className="flex gap-px">
      {spread.map((page) =>
        isVisible ? (
          <Page
            key={page.id}
            projectId={projectId}
            page={page}
            pageBox={pageBox}
            theme={theme}
            dropCapBlockIds={dropCapBlockIds}
            toc={toc}
            bookTitle={bookTitle}
            language={language}
            decorative={decorative}
          />
        ) : (
          <div
            key={page.id}
            className="shrink-0 shadow-[var(--shadow-md)]"
            style={{ width: pageBox.widthPx, height: pageBox.heightPx, background: theme.page.background }}
          />
        ),
      )}
    </div>
  )
}
