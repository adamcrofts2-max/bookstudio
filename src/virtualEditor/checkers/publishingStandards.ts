/**
 * Virtual Editor — Publishing Standards checkers.
 *
 * The first checkers that read real pagination output (`CheckerContext.pages`)
 * rather than just the raw `Manuscript` — see `docs/VIRTUAL_EDITOR.md` § the
 * architectural gap this closes. All three checkers here are deterministic,
 * synchronous, book-wide-pattern checks in the same "flag-only, honest
 * confidence, no NLP" spirit as `consistency.ts`.
 *
 * **Every checker below must filter out `page.kind === 'structural'` first.**
 * `composePages.ts` deliberately gives every front-/back-matter page
 * `number: 0` and no `chapterId` — real print convention, not a bug — but it
 * means an unfiltered scan would misread every Cover/Copyright/Bibliography
 * page as part of "the book's chapters." Page-numbering-uniqueness itself
 * was considered and deliberately dropped from this milestone's scope for
 * exactly this reason: once you correctly exclude structural pages, there's
 * nothing left to check (`paginate.ts` numbers every real content page
 * exactly once, by construction) — not a gap, a non-finding.
 *
 * Also **not** checked here, and not a gap either:
 * - **Widow/orphan headings** — `paginate.ts`'s heading-orphan guard (see its
 *   `requiredHeight` calculation) already structurally prevents a heading
 *   from being stranded alone at the bottom of a page with no following
 *   content beneath it. There is nothing to detect after the fact because
 *   the layout engine never produces the bad state in the first place.
 * - **True whitespace/fill-ratio measurement** (e.g. "this page is only 20%
 *   full") — `LaidOutPage` doesn't store each block's real rendered height,
 *   only the blocks themselves; that height only exists transiently inside
 *   `HeightMeasurer`'s off-screen DOM pass. A genuine page-density check
 *   would need that measurement threaded through too, which is future work,
 *   not something silently faked here.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import type { LaidOutPage } from '@/renderer/paginate'
import { blockPlainText } from '@/virtualEditor/textExtract'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'publishingStandards',
    source: 'deterministic',
    ...partial,
  }
}

/** One real chapter as it appears in the pagination output: its id, display
 * title (read off its `chapter-start` page), and every non-structural page
 * belonging to it, in book order. Every chapter always has at least one page
 * — `paginate.ts` always flushes a `chapter-start` page even for a chapter
 * with zero blocks — so this never needs to handle "a chapter with no pages
 * at all." */
interface PagedChapter {
  id: string
  title: string
  pages: LaidOutPage[]
}

/** Groups `pages` (already-composed, front/back matter included) into one
 * entry per real chapter, preserving first-seen book order. Structural pages
 * never carry a `chapterId`, so filtering `kind !== 'structural'` and
 * grouping by `chapterId` are equivalent here — both are done anyway, per
 * this file's own documented gotcha, for defence in depth. */
function chaptersFromPages(pages: LaidOutPage[]): PagedChapter[] {
  const order: string[] = []
  const byId = new Map<string, PagedChapter>()

  for (const page of pages) {
    if (page.kind === 'structural' || !page.chapterId) continue
    let entry = byId.get(page.chapterId)
    if (!entry) {
      entry = { id: page.chapterId, title: page.chapterTitle ?? 'Untitled chapter', pages: [] }
      byId.set(page.chapterId, entry)
      order.push(page.chapterId)
    }
    entry.pages.push(page)
  }

  return order.map((id) => byId.get(id)!)
}

const SPARSE_ENDING_WORD_THRESHOLD = 25

/**
 * Flags a chapter whose very last page contains exactly one block, that
 * block is a paragraph, and it's short — the classic "single short paragraph
 * stranded alone on the final page" shape that prints as a nearly-blank
 * page. A 25-word threshold is a deliberately simple, hand-checkable
 * boundary: short enough that a genuinely brief closing line ("And that was
 * that.") is still exactly the case this is meant to catch, not so short
 * that a normal, slightly-shorter-than-average final paragraph gets flagged.
 *
 * **Honest limitation**: this is a heuristic, not a real whitespace
 * measurement (see this file's header comment) — a short final paragraph
 * could be a deliberate stylistic choice (a punchy one-line chapter ending),
 * and this checker has no way to distinguish that from an accidental
 * near-blank page. `confidence: 0.5` reflects that: as certain as "a pattern
 * across the book," not "a per-instance fact."
 */
export const sparseChapterEndingChecker: Checker = {
  id: 'publishingStandards.sparse-chapter-ending',
  category: 'publishingStandards',
  label: 'Sparse chapter ending',
  description:
    'Flags a chapter whose final page is a single short paragraph alone, which prints as a nearly-blank page.',
  isApplicable: (ctx) => !!ctx.pages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.pages) return []
    const findings: Finding[] = []

    for (const chapter of chaptersFromPages(ctx.pages)) {
      const lastPage = chapter.pages[chapter.pages.length - 1]
      if (!lastPage || lastPage.blocks.length !== 1) continue

      const block = lastPage.blocks[0]!
      if (block.type !== 'paragraph') continue

      const wordCount = blockPlainText(block).split(/\s+/).filter(Boolean).length
      if (wordCount === 0 || wordCount >= SPARSE_ENDING_WORD_THRESHOLD) continue

      findings.push(
        makeFinding({
          checkerId: sparseChapterEndingChecker.id,
          issueType: 'sparse-chapter-ending',
          severity: 'minor',
          confidence: 0.5,
          location: { chapterId: chapter.id, blockId: block.id },
          message: `"${chapter.title}" ends with a single short paragraph (${wordCount} words) alone on its final page, which will print as a nearly-blank page.`,
          whyItMatters:
            'A page that\'s almost entirely empty reads as a layout mistake to a reader, not a deliberate pause — publishers normally either shorten the preceding page to pull the ending paragraph up, or accept it only when the brevity is clearly intentional.',
        }),
      )
    }

    return findings
  },
}

/**
 * Flags a chapter with literally zero content: its `chapter-start` page (and
 * every other page belonging to it, if any) has no blocks at all. This is a
 * real authoring mistake — a chapter title with nothing underneath it —
 * not a style nit, hence `major` severity and high confidence: either a
 * chapter has blocks somewhere in its pages or it doesn't, no judgement
 * call involved. The one nuance worth naming: this codebase has no distinct
 * "part divider" block type for a chapter that's deliberately title-only, so
 * a genuinely intentional divider chapter (if one existed) would still be
 * flagged here — `confidence: 0.9`, not 1.0, to leave room for that.
 */
export const emptyChapterOpenerChecker: Checker = {
  id: 'publishingStandards.empty-chapter',
  category: 'publishingStandards',
  label: 'Empty chapter',
  description: 'Flags a chapter that has no content at all — just a title and nothing underneath it.',
  isApplicable: (ctx) => !!ctx.pages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.pages) return []
    const findings: Finding[] = []

    for (const chapter of chaptersFromPages(ctx.pages)) {
      const totalBlocks = chapter.pages.reduce((sum, page) => sum + page.blocks.length, 0)
      if (totalBlocks > 0) continue

      findings.push(
        makeFinding({
          checkerId: emptyChapterOpenerChecker.id,
          issueType: 'empty-chapter',
          severity: 'major',
          confidence: 0.9,
          location: { chapterId: chapter.id },
          message: `"${chapter.title}" has no content at all — the chapter opens and immediately ends with nothing underneath its title.`,
          whyItMatters:
            'A chapter with no body content is almost always an authoring mistake (content not yet written, or lost during import/editing) rather than a deliberate design choice, and a reader would find an entirely blank chapter jarring in a finished, printed book.',
        }),
      )
    }

    return findings
  },
}

/**
 * `paginate.ts` only ever inserts exactly one blank page at a time (to force
 * the next chapter onto a recto page — see its `wouldBeSide !== 'right'`
 * check). Two blank pages appearing back to back is therefore something
 * that should be structurally impossible by construction today; this
 * checker is a low-probability sanity net, not a checker expected to find
 * anything in normal use — flagged honestly as such rather than presented
 * as a common, expected finding. If it ever fires, it's a strong signal
 * something upstream (a future pagination change) introduced a real bug.
 *
 * Since a blank page carries no `chapterId` of its own, the finding is
 * attributed to the chapter immediately following the blank run (the
 * chapter that run of blank pages exists to push onto a recto page) — falling
 * back to the chapter immediately before it if the run happens to sit at the
 * very end of the book with no following chapter (edge case, not expected to
 * occur in practice since blank pages only ever precede a chapter start).
 *
 * `confidence: 0.85` — the detection itself (counting adjacent blank pages)
 * is exact and unambiguous, not a heuristic; it's shaded down slightly from
 * 1.0 only because "this should always be treated as a bug" is asserted
 * about a situation the pagination engine's own construction has never had
 * to reason about actually happening.
 */
export const consecutiveBlankPagesChecker: Checker = {
  id: 'publishingStandards.consecutive-blank-pages',
  category: 'publishingStandards',
  label: 'Consecutive blank pages',
  description:
    'Sanity check: flags two or more blank pages in a row, which paginate.ts should never produce by construction.',
  isApplicable: (ctx) => !!ctx.pages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.pages) return []
    const pages = ctx.pages
    const findings: Finding[] = []

    const findChapterId = (fromIndex: number, direction: 1 | -1): string | undefined => {
      for (let i = fromIndex; i >= 0 && i < pages.length; i += direction) {
        const id = pages[i]!.chapterId
        if (id) return id
      }
      return undefined
    }

    let i = 0
    while (i < pages.length) {
      if (pages[i]!.kind !== 'blank') {
        i++
        continue
      }
      let runEnd = i
      while (runEnd + 1 < pages.length && pages[runEnd + 1]!.kind === 'blank') runEnd++

      const runLength = runEnd - i + 1
      if (runLength >= 2) {
        const chapterId = findChapterId(runEnd + 1, 1) ?? findChapterId(i - 1, -1)
        if (chapterId) {
          findings.push(
            makeFinding({
              checkerId: consecutiveBlankPagesChecker.id,
              issueType: 'consecutive-blank-pages',
              severity: 'minor',
              confidence: 0.85,
              location: { chapterId },
              message: `${runLength} blank pages appear back to back in the layout — paginate.ts should only ever insert one blank page at a time to force a recto chapter start.`,
              whyItMatters:
                'A run of blank pages in a printed book reads as a production error, not a design choice; since this specific shape should be structurally impossible given how pagination works today, it likely points at a real, previously-unseen pagination bug worth investigating.',
            }),
          )
        }
      }
      i = runEnd + 1
    }

    return findings
  },
}

export const PUBLISHING_STANDARDS_CHECKERS: Checker[] = [
  sparseChapterEndingChecker,
  emptyChapterOpenerChecker,
  consecutiveBlankPagesChecker,
]
