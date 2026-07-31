import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSelectionStore } from '@/store/selectionStore'
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

  return (
    <ScrollArea className="h-full w-[104px] shrink-0 border-r border-border bg-panel">
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => requestScrollToPage(page.id)}
            className="group flex flex-col items-center gap-1"
            title={page.kind === 'chapter-start' ? page.chapterTitle : `Page ${page.number}`}
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
            <span className="text-[10px] text-text-muted">{page.kind === 'blank' ? '' : page.number}</span>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
