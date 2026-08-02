import type { Color, PDFFont } from 'pdf-lib'

import type { DrawCtx } from '@/pdf/exportPdf'
import type { WrappedLine } from '@/pdf/textWrap'

/** CSS px (96dpi) → PDF points (72dpi). Shared by `exportPdf.ts`'s own page
 * geometry math and by every block type's `drawPdf` in `src/blocks/types/`. */
export const PX_TO_PT = 72 / 96

/** Optional extras for `drawWrappedLines` — every existing call site (see
 * `pdf/textWrap.ts`'s `WrapRunsOptions` doc comment for the same "~20
 * call sites, all additive" note) keeps compiling unchanged since this
 * whole parameter is optional. Only `paragraph.tsx` passes one, since it's
 * the only block type whose runs can carry italic/link styling at all. */
export interface DrawWrappedLinesOptions {
  italicFont?: PDFFont
  boldItalicFont?: PDFFont
  /**
   * Colour used for link-run text and its underline. Falls back to `color`
   * (the paragraph's own ink colour) if omitted — a link is still
   * distinguished from surrounding text by the underline alone in that
   * case, just not by colour too.
   */
  linkColor?: Color
}

/** Draws pre-wrapped text lines (see `wrapRuns`) at the current cursor,
 * advancing `ctx.cursorY` for each line drawn. Shared by every block type
 * whose PDF rendering flows wrapped text (heading/paragraph/quote/list).
 *
 * Link runs (`fragment.href`) are drawn in `options.linkColor` (or `color`)
 * with a real underline rule beneath the text — real visual distinction,
 * same principle as bold — but **not** a clickable PDF link annotation:
 * this exporter targets print-ready output first (see `CLAUDE.md`), and a
 * clickable in-PDF link is a materially bigger, harder-to-verify piece of
 * work (hand-constructing a `/Link` annotation dictionary via pdf-lib's
 * low-level API, with no PDF viewer available in this environment to
 * confirm it actually resolves) for a feature more valuable in the EPUB
 * export this same roadmap phase adds next. Honestly scoped, not silently
 * dropped — see docs/STATUS.md Phase 39.
 */
export function drawWrappedLines(
  ctx: DrawCtx,
  lines: WrappedLine[],
  sizePt: number,
  lineHeightPt: number,
  color: Color,
  regularFont: PDFFont,
  boldFont: PDFFont,
  options?: DrawWrappedLinesOptions,
) {
  const linkColor = options?.linkColor ?? color
  for (const line of lines) {
    ctx.cursorY -= lineHeightPt
    for (const fragment of line.fragments) {
      const font =
        fragment.italic && fragment.bold ? (options?.boldItalicFont ?? options?.italicFont ?? boldFont)
        : fragment.italic ? (options?.italicFont ?? regularFont)
        : fragment.bold ? boldFont
        : regularFont
      const fragmentColor = fragment.href ? linkColor : color
      const x = ctx.contentX + fragment.x
      ctx.page.drawText(fragment.text, {
        x,
        y: ctx.cursorY,
        size: sizePt,
        font,
        color: fragmentColor,
      })
      if (fragment.href) {
        ctx.page.drawLine({
          start: { x, y: ctx.cursorY - 1 },
          end: { x: x + fragment.width, y: ctx.cursorY - 1 },
          thickness: 0.6,
          color: fragmentColor,
        })
      }
    }
  }
}
