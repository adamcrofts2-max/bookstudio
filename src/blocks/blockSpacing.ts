/**
 * The space around a block, in CSS pixels — one table, read by both
 * renderers.
 *
 * Every block type is drawn twice: once by React for the screen, once by
 * `drawPdf` for print. The two agreed on typography and disagreed, quietly,
 * on the gaps between blocks. Measured in Phase 159 by parsing an exported
 * PDF's own content streams and comparing the y of every drawn line against
 * the same line's position in the DOM: a paragraph gap was **14px on screen
 * and 4pt (5.3px) in print**, so from the second paragraph onward every
 * line in the PDF sat higher up the page than the one the author had been
 * looking at, and the error accumulated with each paragraph — roughly an
 * inch and three quarters over a twenty-paragraph chapter.
 *
 * That is not a cosmetic difference. `HeightMeasurer` measures the *screen*
 * layout, and pagination assigns blocks to pages from those heights, so the
 * PDF was laying the same blocks into the same pages with systematically
 * tighter spacing: same words on the same page, wrong rhythm, and a strip
 * of unexplained white space at the bottom of every full page.
 *
 * So the numbers live here, in px, and both sides read them — the component
 * as an inline style (rather than a Tailwind `pb-*` class a PDF exporter
 * can't see) and `drawPdf` via `PX_TO_PT`. `scripts/e2e/pdfFidelity.e2e.mjs`
 * holds them to it by comparing real geometry from a real export.
 *
 * Only the five block types a book is mostly made of are here so far —
 * those are the ones the fidelity suite actually exercises, and a table
 * that claims types nobody measured would be back to guessing. The other
 * nine still carry hand-chosen numbers in their own `drawPdf`; see
 * docs/ROADMAP.md.
 */
export const BLOCK_SPACING = {
  /** `paragraph.tsx` */
  paragraph: { before: 0, after: 14 },
  /** `heading.tsx` — the generous space above is what separates sections. */
  heading: { before: 32, after: 10 },
  /** `list.tsx` */
  list: { before: 0, after: 16 },
  /** `image.tsx` — a figure needs room before the text resumes. */
  image: { before: 0, after: 20 },
  /** `quote.tsx` — symmetrical, hence `py-6` on screen. */
  quote: { before: 24, after: 24 },
} as const

export type SpacedBlockType = keyof typeof BLOCK_SPACING
