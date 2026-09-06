/**
 * The chapter opener's type metrics, in CSS pixels — one table, read by
 * everything that draws or measures it.
 *
 * A chapter-start page carries a number label ("Chapter One") and the
 * chapter title above the first block. Three places have to agree about how
 * much room that takes: `Page.tsx` draws it, `HeightMeasurer.tsx` measures a
 * copy of it so `paginate.ts` can reserve the space, and `exportPdf.ts`
 * draws it again for print. Until Phase 162 the first two shared Tailwind
 * classes and a comment warning that they "must mirror each other exactly
 * or the two heights will silently drift apart", while the third carried
 * its own hand-chosen point values — and did drift: the printed label was
 * 11pt against 14px on screen, the title 30pt against 36px, and the whole
 * opener was ~29px shorter in print, which was enough to fit an extra line
 * of body text onto every chapter's first page.
 *
 * The values are the Tailwind classes they replace, so nothing about the
 * rendered result changes: `text-sm` is 14px/20px, `text-4xl` is 36px/40px,
 * `pb-3` is 12px and `pb-10` is 40px.
 */
export const CHAPTER_OPENER = {
  label: {
    fontPx: 14,
    lineHeightPx: 20,
    /** `pb-3` */
    afterPx: 12,
    letterSpacingEm: 0.2,
  },
  title: {
    fontPx: 36,
    lineHeightPx: 40,
    /** `pb-10` */
    afterPx: 40,
  },
} as const
