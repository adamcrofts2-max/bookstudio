import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSelectionStore } from '@/store/selectionStore'
import { useStructuralPageStore, EMPTY_STRUCTURAL_PAGES } from '@/store/structuralPageStore'
import { getStructuralPageTypeDefinition } from '@/structuralPages/registry'
import { ThumbnailPage } from '@/renderer/ThumbnailPage'

interface ThumbnailRailProps {
  projectId: string
  pages: LaidOutPage[]
  pageBox: PageBox
  theme: ResolvedBookTheme
  dropCapBlockIds: Set<string>
  toc: TocEntry[]
  bookTitle: string
  language?: string
}

const THUMB_WIDTH = 68

/** Left-hand page-thumbnail rail for quick navigation through a long book.
 * Each thumbnail is a real (lazily-mounted) miniature of the page — see
 * `ThumbnailPage.tsx` — rather than a blank box. */
export function ThumbnailRail({ projectId, pages, pageBox, theme, dropCapBlockIds, toc, bookTitle, language }: ThumbnailRailProps) {
  const thumbHeight = THUMB_WIDTH * (pageBox.heightPx / pageBox.widthPx)
  const requestScrollToPage = useSelectionStore((s) => s.requestScrollToPage)
  const structuralPages = useStructuralPageStore((s) => s.byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES)

  /**
   * What goes under a thumbnail. `composePages.ts` gives every structural
   * page `number: 0` on purpose — front matter is conventionally unnumbered
   * and main-body folios start fresh at chapter one — but this rail printed
   * that 0 verbatim, so the cover of every book was captioned "0" (seen in
   * the running app, Phase 156). Structural pages don't have a folio to
   * show; they have a name, which is more use for navigation anyway, so
   * that's what they get. Blank pages stay deliberately unlabelled.
   */
  const captionFor = (page: LaidOutPage): string => {
    if (page.kind === 'blank') return ''
    if (page.kind === 'structural') {
      const structural = structuralPages.find((sp) => sp.id === page.structuralPageId)
      return structural ? (getStructuralPageTypeDefinition(structural.type)?.label ?? '') : ''
    }
    return String(page.number)
  }

  return (
    <ScrollArea className="h-full w-[104px] shrink-0 border-r border-border bg-panel">
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => requestScrollToPage(page.id)}
            className="group flex flex-col items-center gap-1"
            title={page.kind === 'chapter-start' ? page.chapterTitle : captionFor(page) || 'Blank page'}
          >
            <ThumbnailPage
              projectId={projectId}
              page={page}
              pageBox={pageBox}
              theme={theme}
              dropCapBlockIds={dropCapBlockIds}
              toc={toc}
              bookTitle={bookTitle}
              language={language}
              width={THUMB_WIDTH}
              height={thumbHeight}
            />
            <span className="truncate text-[10px] text-text-muted" style={{ maxWidth: THUMB_WIDTH }}>
              {captionFor(page)}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
