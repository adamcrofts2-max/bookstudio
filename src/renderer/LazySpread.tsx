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
}

/**
 * Defers mounting a spread's real `<Page>` components until it scrolls
 * near the viewport, rendering a cheap placeholder box until then. Books
 * can run to 1,000+ pages (see CLAUDE.md's performance guidance) — this
 * keeps the initial render and scroll performance responsive without a
 * full virtualised-list rewrite. Once mounted, a spread stays mounted
 * (no unmount-on-scroll-away) to avoid re-triggering the height
 * measurement pass and to keep scrolling smooth.
 */
export function LazySpread({ projectId, spread, pageBox, theme, dropCapBlockIds, toc, bookTitle, language }: LazySpreadProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin: '1200px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div ref={ref} className="flex gap-px">
      {spread.map((page) =>
        visible ? (
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
