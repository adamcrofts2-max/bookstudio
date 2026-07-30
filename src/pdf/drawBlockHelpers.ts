import { rgb, type PDFFont } from 'pdf-lib'

import type { DrawCtx } from '@/pdf/exportPdf'
import type { WrappedLine } from '@/pdf/textWrap'

/** CSS px (96dpi) → PDF points (72dpi). Shared by `exportPdf.ts`'s own page
 * geometry math and by every block type's `drawPdf` in `src/blocks/types/`. */
export const PX_TO_PT = 72 / 96

/** Draws pre-wrapped text lines (see `wrapRuns`) at the current cursor,
 * advancing `ctx.cursorY` for each line drawn. Shared by every block type
 * whose PDF rendering flows wrapped text (heading/paragraph/quote/list). */
export function drawWrappedLines(ctx: DrawCtx, lines: WrappedLine[], sizePt: number, lineHeightPt: number, color: ReturnType<typeof rgb>, regularFont: PDFFont, boldFont: PDFFont) {
  for (const line of lines) {
    ctx.cursorY -= lineHeightPt
    for (const fragment of line.fragments) {
      ctx.page.drawText(fragment.text, {
        x: ctx.contentX + fragment.x,
        y: ctx.cursorY,
        size: sizePt,
        font: fragment.bold ? boldFont : regularFont,
        color,
      })
    }
  }
}
