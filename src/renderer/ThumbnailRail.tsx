import type { LaidOutPage } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface ThumbnailRailProps {
  pages: LaidOutPage[]
  pageBox: PageBox
  theme: ResolvedBookTheme
}

const THUMB_WIDTH = 68

/** Left-hand page-thumbnail rail for quick navigation through a long book. */
export function ThumbnailRail({ pages, pageBox, theme }: ThumbnailRailProps) {
  const thumbHeight = THUMB_WIDTH * (pageBox.heightPx / pageBox.widthPx)

  const scrollToPage = (pageId: string) => {
    document.getElementById(`page-${pageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <ScrollArea className="h-full w-[104px] shrink-0 border-r border-border bg-panel">
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => scrollToPage(page.id)}
            className="group flex flex-col items-center gap-1"
            title={page.kind === 'chapter-start' ? page.chapterTitle : `Page ${page.number}`}
          >
            <div
              className={cn(
                'flex items-center justify-center rounded-[2px] border transition-colors duration-150 group-hover:border-[var(--color-accent)]',
                page.kind === 'blank' ? 'border-dashed border-border' : 'border-border',
              )}
              style={{ width: THUMB_WIDTH, height: thumbHeight, background: page.kind === 'blank' ? 'transparent' : theme.page.background }}
            >
              {page.kind === 'chapter-start' && (
                <span className="text-[6px] font-semibold" style={{ color: theme.page.mutedInk }}>
                  {page.chapterTitle?.slice(0, 3).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-[10px] text-text-muted">{page.kind === 'blank' ? '' : page.number}</span>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
