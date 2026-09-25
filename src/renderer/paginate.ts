import type { Chapter, ContentBlock } from '@/types/content'
import { getBlockTypeDefinition } from '@/blocks/registry'

export type PageKind = 'toc' | 'chapter-start' | 'content' | 'blank' | 'structural'
export type PageSide = 'left' | 'right'

export interface LaidOutPage {
  id: string
  number: number
  side: PageSide
  kind: PageKind
  chapterId?: string
  chapterTitle?: string
  blocks: ContentBlock[]
  /**
   * Set only when `kind === 'structural'` — the id of the `StructuralPage`
   * (see `src/types/structuralPage.ts`) this page renders. Populated by
   * `src/renderer/composePages.ts`, which splices front-/back-matter
   * structural pages around this file's own chapter-flow output; `paginate`
   * itself never produces a `'structural'` page or touches this field.
   */
  structuralPageId?: string
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
 * about how tall a block "really" is. Looked up from the block-type
 * registry (`src/blocks/registry.ts`) rather than a hardcoded switch, so a
 * new block type only needs to touch the registry — see
 * docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 1. */
function blockSpacing(block: ContentBlock): number {
  return getBlockTypeDefinition(block.type)?.blockSpacing?.(block) ?? 0
}

/**
 * Greedily flows chapters into fixed-height pages using real measured
 * block heights. Block-level granularity (a paragraph never splits across
 * a page boundary) — see docs/STATUS.md for why, and where line-level flow
 * would extend this.
 */
/**
 * A flow page's React identity, derived from its page number rather than
 * generated fresh each run.
 *
 * This is load-bearing for the writing experience, not a tidiness change.
 * `paginate` re-runs on every content change, and `LazySpread` keys its
 * pages by `page.id`. With a random id per run, every repagination handed
 * React a brand-new key for every page, so it unmounted and rebuilt the
 * entire page subtree — destroying the DOM node that had focus along with
 * the caret inside it. Pressing Enter mid-paragraph therefore split the
 * paragraph correctly and then dropped the cursor on the floor: the new
 * paragraph was focused ~27ms in and remounted out of existence ~9ms later,
 * so everything typed next went nowhere (traced 2026-09-04).
 *
 * Keyed by number, "page 7" stays page 7 across runs even as its contents
 * reflow, which is exactly the identity a paginated document has. Nothing
 * persists these ids — they are React keys, DOM anchors for scroll-to-page,
 * and thumbnail keys, all session-scoped — so deriving them is safe, and it
 * also keeps a pending scroll target valid across a repagination.
 *
 * Structural pages are unaffected: `composePages.ts` gives them their own
 * store ids, which never collide with this prefix.
 */
function flowPageId(pageNumber: number): string {
  return `flow-${pageNumber}`
}

export function paginate(
  chapters: Chapter[],
  getHeight: (block: ContentBlock) => number,
  contentHeightPx: number,
  chapterOpenerTopSpacerPx: number,
  /**
   * True rendered height of a chapter's opener-page header (number label +
   * title, per `Page.tsx`'s `chapter-start` markup) — measured off-screen by
   * `HeightMeasurer.tsx` the same way block heights are. Without this, only
   * the theme's fixed `chapterOpenerTopSpacerPx` was reserved above the
   * blocks on a chapter's first page; the title/label's own height (which
   * grows with a longer or line-wrapping chapter title) was never
   * accounted for, so it silently ate into space assumed free for blocks —
   * overflowing the page (reported 2026-07-31, "chapters are still getting
   * cut off occasionally"). Defaults to 0 for any caller that hasn't been
   * updated to measure it (keeps this an additive, non-breaking parameter).
   */
  getOpenerHeaderHeight: (chapter: Chapter) => number = () => 0,
): PaginationResult {
  const pages: LaidOutPage[] = []
  const tocStartPage: TocEntry[] = []

  // Reserve page 1 for the table of contents; chapters begin after it.
  pages.push({ id: flowPageId(1), number: 1, side: 'right', kind: 'toc', blocks: [] })
  let pageNumber = 2

  for (const chapter of chapters) {
    // Chapter openers always start on a right-hand (recto) page.
    const wouldBeSide: PageSide = pageNumber % 2 === 1 ? 'right' : 'left'
    if (wouldBeSide !== 'right') {
      pages.push({ id: flowPageId(pageNumber), number: pageNumber, side: 'left', kind: 'blank', blocks: [] })
      pageNumber++
    }

    tocStartPage.push({ chapterId: chapter.id, title: chapter.title, pageNumber })

    let isOpener = true
    let currentBlocks: ContentBlock[] = []
    let currentHeight = 0
    let available = contentHeightPx - chapterOpenerTopSpacerPx - getOpenerHeaderHeight(chapter)

    const flush = () => {
      pages.push({
        id: flowPageId(pageNumber),
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

      // Heading-orphan guard: don't strand a heading alone at the bottom of
      // a page with no following content beneath it. Must reserve the
      // *entire* following block's height, not just a small slice of it —
      // block-level pagination can't split a block across the boundary, so
      // reserving only a sliver (e.g. 32px) only guarantees the heading
      // fits *alongside that sliver*; the very next loop iteration then
      // re-checks the following block against its own *full* height and,
      // finding it doesn't fit in the remaining space, flushes it to a new
      // page anyway — stranding the heading alone on the page it was
      // supposedly protected on. Reserving the full height here means: if
      // the heading is kept on this page, the block after it is now
      // guaranteed to fit too, so that later check can never undo this
      // one. (Documented previously as fixed with a 32px lookahead, which
      // this replaces — see docs/ROADMAP.md Phase B and docs/STATUS.md.)
      const next = chapter.blocks[i + 1]
      const requiredHeight = block.type === 'heading' && next ? height + getHeight(next) + blockSpacing(next) : height

      if (currentBlocks.length > 0 && currentHeight + requiredHeight > available) {
        flush()
      }
      currentBlocks.push(block)
      currentHeight += height

      // Manual page break (Phase 51): lets a user force whatever comes next
      // onto a fresh page regardless of remaining space — e.g. a
      // chapter-opener that's just a title + photo, with the following
      // paragraph text always starting a new page rather than flowing up
      // into the leftover space beneath the photo. `flush()` already
      // no-ops safely if this happens to be the chapter's last block (the
      // post-loop `currentBlocks.length > 0 || isOpener` check finds
      // nothing left to do).
      if (block.breakAfter) flush()
    }

    if (currentBlocks.length > 0 || isOpener) flush()
  }

  return { pages, toc: tocStartPage }
}
