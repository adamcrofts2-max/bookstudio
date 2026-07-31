import { useEffect, useRef, useState } from 'react'

import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'
import { Page } from '@/renderer/Page'
import { cn } from '@/lib/utils'

interface ThumbnailPageProps {
  projectId: string
  page: LaidOutPage
  pageBox: PageBox
  theme: ResolvedBookTheme
  dropCapBlockIds: Set<string>
  toc: TocEntry[]
  bookTitle: string
  language?: string
  width: number
  height: number
}

/**
 * One thumbnail in `ThumbnailRail.tsx`. Renders a true miniature of the real
 * page — the same `Page` component used for the main spread view, CSS-scaled
 * down — rather than a placeholder box, so the rail is an actual WYSIWYG
 * preview (per `CLAUDE.md`'s Editor Philosophy: "the preview should always
 * represent the exported result as accurately as possible"). Confirmed gap
 * via user report 2026-07-31 ("the thumbnails don't actually use the text").
 *
 * Two things keep this affordable across a 1,000+ page book (see
 * `CLAUDE.md`'s Performance guidance):
 *   1. Lazy-mounted via `IntersectionObserver`, same pattern as
 *      `LazySpread.tsx` — only thumbnails scrolled near the rail's viewport
 *      ever mount the real `<Page>`; everything else stays a cheap
 *      placeholder box (this rail's pre-existing look) until scrolled near.
 *   2. `decorative` on the inner `<Page>` strips toolbars, drop zones, and
 *      contentEditable entirely rather than merely hiding them — see that
 *      prop's doc comment in `Page.tsx`.
 * A `pointer-events-none` wrapper is defense in depth on top of `decorative`,
 * not a substitute for it (see `Page.tsx`).
 */
export function ThumbnailPage({ projectId, page, pageBox, theme, dropCapBlockIds, toc, bookTitle, language, width, height }: ThumbnailPageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  // Same pattern as `LazySpread.tsx` — default `root` (viewport) still
  // correctly accounts for clipping by the `ScrollArea`'s own scrollable
  // ancestor per the IntersectionObserver spec, so no need to look up
  // Radix's internal viewport element explicitly.
  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin: '600px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  const scale = width / pageBox.widthPx

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-[2px] border transition-colors duration-150 group-hover:border-[var(--color-accent)]',
        page.kind === 'blank' ? 'border-dashed border-border' : 'border-border',
      )}
      style={{ width, height, background: page.kind === 'blank' ? 'transparent' : theme.page.background }}
    >
      {visible ? (
        // `absolute left-0 top-0` is load-bearing, not cosmetic: this box's
        // un-scaled layout size is the *real* page size (576x864-ish px),
        // many times larger than the thumbnail. Left in normal flow, the
        // parent's `flex items-center justify-center` centers that large
        // layout box first and only *then* the `scale()` transform paints it
        // — centering a huge box inside a tiny one pushes the rendered
        // (scaled) content far outside the visible, clipped thumbnail
        // entirely, which is why thumbnails initially shipped looking blank
        // despite genuinely containing the right content underneath
        // (confirmed via DOM inspection in a real browser, 2026-07-31).
        // Taking this out of flow with `absolute` anchors its untransformed
        // top-left corner at the parent's top-left corner instead, so
        // `transform-origin: top left` scales it down exactly into place.
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width: pageBox.widthPx, height: pageBox.heightPx, transform: `scale(${scale})` }}
        >
          <Page
            projectId={projectId}
            page={page}
            pageBox={pageBox}
            theme={theme}
            dropCapBlockIds={dropCapBlockIds}
            toc={toc}
            bookTitle={bookTitle}
            language={language}
            decorative
          />
        </div>
      ) : (
        page.kind === 'chapter-start' && (
          <span className="text-[6px] font-semibold" style={{ color: theme.page.mutedInk }}>
            {page.chapterTitle?.slice(0, 3).toUpperCase()}
          </span>
        )
      )}
    </div>
  )
}
