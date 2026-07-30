import type { LaidOutPage, PageSide } from '@/renderer/paginate'
import type { StructuralPage } from '@/types/structuralPage'

function toLaidOutPage(page: StructuralPage, positionInBook: number): LaidOutPage {
  const side: PageSide = positionInBook % 2 === 1 ? 'right' : 'left'
  return {
    id: page.id,
    number: 0,
    side,
    kind: 'structural',
    structuralPageId: page.id,
    blocks: [],
  }
}

/**
 * Splices front-matter and back-matter `StructuralPage`s around the
 * existing chapter-flow pagination output. Pure function — no store reads,
 * see `scripts/smoke-test.ts` for direct unit coverage.
 *
 * `paginated`'s own `.number`/`.side` values are never touched: front matter
 * is conventionally unnumbered or separately numbered, and main-body
 * numbering starts fresh at the first chapter, per real print-book
 * convention (see docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 2 — this is a
 * deliberately lower-risk choice than renumbering `paginate.ts`'s output).
 *
 * Each structural page's `side` is computed from its simple 1-indexed
 * position within the FULL concatenated output array (position 1 = right,
 * 2 = left, 3 = right, …) — the same left/right convention `paginate.ts`
 * already uses elsewhere, just applied by position here since these pages
 * aren't part of that file's own page-number bookkeeping.
 */
export function composeBookPages(
  frontMatter: StructuralPage[],
  paginated: LaidOutPage[],
  backMatter: StructuralPage[],
): LaidOutPage[] {
  const frontLaidOut = frontMatter.map((page, i) => toLaidOutPage(page, i + 1))
  const backLaidOut = backMatter.map((page, i) => toLaidOutPage(page, frontMatter.length + paginated.length + i + 1))
  return [...frontLaidOut, ...paginated, ...backLaidOut]
}
