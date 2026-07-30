import type { Chapter, ContentBlock } from '@/types/content'
import { generateId } from '@/utils'

export type PageKind = 'toc' | 'chapter-start' | 'content' | 'blank'
export type PageSide = 'left' | 'right'

export interface LaidOutPage {
  id: string
  number: number
  side: PageSide
  kind: PageKind
  chapterId?: string
  chapterTitle?: string
  blocks: ContentBlock[]
}

export interface TocEntry {
  chapterId: string
  title: string
  pageNumber: number
}

export interface PaginationResult {
  pages: LaidOutPage[]
  toc: TocEntry[]
}

/** Extra vertical space (px) a block demands beyond its own measured
 * content height — implements "spacing before headings should always
 * exceed spacing after" from docs/BOOK_LAYOUT_RULES.md. Kept here (not in
 * CSS margins) so the pagination math and the rendered page never disagree
 * about how tall a block "really" is. */
function blockSpacing(block: ContentBlock): number {
  switch (block.type) {
    case 'heading':
      return 8
    case 'image':
      return 6
    case 'quote':
      return 6
    default:
      return 0
  }
}

/**
 * Greedily flows chapters into fixed-height pages using real measured
 * block heights. Block-level granularity (a paragraph never splits across
 * a page boundary) — see docs/STATUS.md for why, and where line-level flow
 * would extend this.
 */
export function paginate(
  chapters: Chapter[],
  getHeight: (block: ContentBlock) => number,
  contentHeightPx: number,
  chapterOpenerTopSpacerPx: number,
): PaginationResult {
  const pages: LaidOutPage[] = []
  const tocStartPage: TocEntry[] = []

  // Reserve page 1 for the table of contents; chapters begin after it.
  pages.push({ id: generateId('page'), number: 1, side: 'right', kind: 'toc', blocks: [] })
  let pageNumber = 2

  for (const chapter of chapters) {
    // Chapter openers always start on a right-hand (recto) page.
    const wouldBeSide: PageSide = pageNumber % 2 === 1 ? 'right' : 'left'
    if (wouldBeSide !== 'right') {
      pages.push({ id: generateId('page'), number: pageNumber, side: 'left', kind: 'blank', blocks: [] })
      pageNumber++
    }

    tocStartPage.push({ chapterId: chapter.id, title: chapter.title, pageNumber })

    let isOpener = true
    let currentBlocks: ContentBlock[] = []
    let currentHeight = 0
    let available = contentHeightPx - chapterOpenerTopSpacerPx

    const flush = () => {
      pages.push({
        id: generateId('page'),
        number: pageNumber,
        side: pageNumber % 2 === 1 ? 'right' : 'left',
        kind: isOpener ? 'chapter-start' : 'content',
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        blocks: currentBlocks,
      })
      pageNumber++
      currentBlocks = []
      currentHeight = 0
      isOpener = false
      available = contentHeightPx
    }

    for (let i = 0; i < chapter.blocks.length; i++) {
      const block = chapter.blocks[i]
      const height = getHeight(block) + blockSpacing(block)

      // Heading-orphan guard: don't strand a heading alone at the bottom
      // of a page with no following content beneath it.
      const next = chapter.blocks[i + 1]
      const requiredHeight = block.type === 'heading' && next ? height + Math.min(getHeight(next), 32) : height

      if (currentBlocks.length > 0 && currentHeight + requiredHeight > available) {
        flush()
      }
      currentBlocks.push(block)
      currentHeight += height
    }

    if (currentBlocks.length > 0 || isOpener) flush()
  }

  return { pages, toc: tocStartPage }
}
