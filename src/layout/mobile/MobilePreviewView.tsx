import { useEffect, useRef, useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'

import type { Project } from '@/types'
import { useContentStore } from '@/store/contentStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { useBookLayout } from '@/renderer/useBookLayout'
import { LazySpread } from '@/renderer/LazySpread'
import { computePreviewScale } from '@/layout/mobile/previewScale'

interface MobilePreviewViewProps {
  project: Project
}

/**
 * Read-only book preview for mobile (Phase 127).
 *
 * Mobile could write into a book but never look at it — the one thing that
 * made "on the go" mode feel like a notes app rather than Book Studio. This
 * shows the real, paginated book: the same chapter flow, front/back matter,
 * running heads, folios and drop caps the desktop canvas and the exported PDF
 * produce.
 *
 * It is a *view*, not a second layout engine. The whole pipeline is reused
 * unchanged — `HeightMeasurer` measures real block heights off-screen,
 * `paginate` flows them, `composeBookPages` splices structural pages around
 * the result, and `Page` (via `LazySpread`) draws them. Reimplementing any of
 * that for a small screen would produce a second source of truth that could
 * disagree with the printed book, which is precisely the failure this app's
 * WYSIWYG guarantee exists to prevent.
 *
 * Two mobile-specific concerns, and nothing else:
 *
 *  - **Scale.** A page is a fixed physical size (a 6×9in trim is ~680px wide
 *    at this app's scale, far wider than a phone). Rather than reflowing the
 *    text — which would change where pages break and therefore show a
 *    different book from the one that prints — the real page is rendered at
 *    full size and CSS-scaled down to fit. What you see is the actual page,
 *    just smaller.
 *  - **Read-only.** Pages render with `decorative`, the same flag
 *    `ThumbnailPage` uses: no editing affordances and no duplicate DOM ids.
 *    Editing stays in the Write tab, where the touch targets are built for it.
 */
export function MobilePreviewView({ project }: MobilePreviewViewProps) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const structuralPages = useStructuralPageStore((s) => s.byProject[project.id] ?? EMPTY_STRUCTURAL_PAGES)

  // The measure/paginate/compose/publish pipeline, shared with the More tab
  // so exporting no longer depends on this view having been opened — see
  // `useBookLayout`'s own doc comment for why that was a defect.
  const { pages, toc, pageBox, theme, dropCapBlockIds, measurer } = useBookLayout(project)
  const chapters = manuscript?.chapters ?? []

  // Scale is measured from the real container rather than `window.innerWidth`
  // so it stays correct through rotation and any future chrome around this
  // view, with no breakpoint constants to keep in sync.
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const apply = () => setScale(computePreviewScale(el.clientWidth, pageBox.widthPx))
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [pageBox.widthPx])

  const hasSomethingToShow = chapters.length > 0 || structuralPages.length > 0

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overscroll-contain bg-background">
      {measurer}

      {!hasSomethingToShow ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-background-secondary">
            <BookOpen className="size-5 text-text-muted" />
          </div>
          <p className="text-[15px] font-semibold text-text-primary">Nothing to preview yet</p>
          <p className="text-sm text-text-secondary">Write a chapter and it will appear here, laid out as a real book.</p>
        </div>
      ) : pages.length === 0 || scale === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="size-5 animate-spin text-text-muted" />
          <p className="text-sm text-text-secondary">Laying out your book…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 px-4 py-5">
          {pages.map((page) => (
            <div key={page.id} className="flex flex-col items-center gap-1.5">
              {/* The scaled page is wrapped in a box of the *scaled* size so
                  surrounding layout reserves the right space — a CSS
                  transform alone does not affect layout, which would leave
                  every page overlapping the next. */}
              <div
                style={{ width: pageBox.widthPx * scale, height: pageBox.heightPx * scale }}
                className="overflow-hidden"
              >
                <div
                  style={{
                    width: pageBox.widthPx,
                    height: pageBox.heightPx,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <LazySpread
                    projectId={project.id}
                    spread={[page]}
                    pageBox={pageBox}
                    theme={theme}
                    dropCapBlockIds={dropCapBlockIds}
                    toc={toc}
                    bookTitle={project.name}
                    language={project.settings.language}
                    decorative
                  />
                </div>
              </div>
              <span className="text-[11px] tabular-nums text-text-muted">{page.number}</span>
            </div>
          ))}
          <p className="pb-2 text-xs text-text-muted">
            {pages.length} page{pages.length === 1 ? '' : 's'} · preview only
          </p>
        </div>
      )}
    </div>
  )
}
