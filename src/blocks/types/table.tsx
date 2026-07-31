import { useEffect } from 'react'
import { Table as TableIcon } from 'lucide-react'

import type { PDFFont } from 'pdf-lib'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { TableCellField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT, drawWrappedLines } from '@/pdf/drawBlockHelpers'
import { wrapRuns } from '@/pdf/textWrap'
import { cn } from '@/lib/utils'

function TableRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  // See list.tsx's comment: the old unconditional autoEdit effect never
  // actually entered edit mode for table blocks (no `primary` field was
  // rendered), only fired `onAutoEditHandled` — reproduced here verbatim.
  useEffect(() => {
    if (autoEdit && editable) {
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'table') return null

  const wrapperClass = cn('outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false))
  return (
    <table
      onClick={onSelect}
      className={cn(wrapperClass, 'w-full cursor-pointer border-collapse pb-5 text-[0.85em]')}
      style={{ fontFamily: theme.fonts.body, color: theme.page.ink }}
    >
      <thead>
        <tr>
          {block.header.map((cell, i) => (
            <TableCellField
              as="th"
              key={i}
              text={cell}
              editable={editable}
              className="border-b py-1.5 text-left font-semibold"
              style={{ borderColor: theme.page.ruleColor }}
              onCommit={(value) => {
                const header = block.header.slice()
                header[i] = value
                onCommit?.({ header })
              }}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <TableCellField
                as="td"
                key={ci}
                text={cell}
                editable={editable}
                className="border-b py-1.5"
                style={{ borderColor: theme.page.ruleColor }}
                onCommit={(value) => {
                  const rows = block.rows.map((r) => r.slice())
                  rows[ri][ci] = value
                  onCommit?.({ rows })
                }}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const TABLE_CELL_PADDING_PT = 4

/**
 * Wraps and draws one row of cells, each independently word-wrapped to its
 * own column width (matching the screen renderer's native CSS wrapping —
 * see the roadmap item this closes: "Table cell text wrapping in PDF
 * export"). Every cell in the row is drawn starting from the *same*
 * `ctx.cursorY` (via an isolated per-cell scratch context so
 * `drawWrappedLines`'s internal cursor mutation never leaks between
 * cells), and the row as a whole only advances the real `ctx.cursorY` once,
 * by whichever cell wrapped to the most lines — so every cell's text stays
 * vertically aligned within its row regardless of how much any single cell
 * wrapped.
 */
function drawTableRow(ctx: DrawCtx, cells: string[], font: PDFFont, sizePt: number, lineHeightPt: number, colWidth: number, color: ReturnType<typeof hexToPdfColor>) {
  const cellWidth = Math.max(1, colWidth - TABLE_CELL_PADDING_PT * 2)
  const wrappedPerCell = cells.map((cell) => wrapRuns([{ text: cell, bold: false }], font, font, sizePt, cellWidth))
  const rowLineCount = Math.max(1, ...wrappedPerCell.map((lines) => lines.length))

  cells.forEach((_, i) => {
    const cellCtx: DrawCtx = { ...ctx, contentX: ctx.contentX + i * colWidth + TABLE_CELL_PADDING_PT, cursorY: ctx.cursorY }
    drawWrappedLines(cellCtx, wrappedPerCell[i]!, sizePt, lineHeightPt, color, font, font)
  })
  ctx.cursorY -= rowLineCount * lineHeightPt
}

function drawTablePdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'table') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink)
  const sizePt = theme.typography.bodySize * 0.85 * PX_TO_PT
  const lineHeightPt = sizePt * 1.35
  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const boldFont = pickFont(ctx.fonts, theme.fonts.body, 600)
  const colWidth = ctx.contentWidthPt / Math.max(1, block.header.length)

  ctx.cursorY -= lineHeightPt * 0.2
  drawTableRow(ctx, block.header, boldFont, sizePt, lineHeightPt, colWidth, ink)
  ctx.page.drawLine({ start: { x: ctx.contentX, y: ctx.cursorY - 2 }, end: { x: ctx.contentX + ctx.contentWidthPt, y: ctx.cursorY - 2 }, thickness: 0.75, color: hexToPdfColor(theme.page.ruleColor) })
  ctx.cursorY -= 8
  for (const row of block.rows) {
    drawTableRow(ctx, row, font, sizePt, lineHeightPt, colWidth, ink)
    ctx.cursorY -= 4
  }
  ctx.cursorY -= 6
}

export const tableBlockType: BlockTypeDefinition = {
  id: 'table',
  label: 'Table',
  icon: TableIcon,
  Render: TableRender,
  drawPdf: drawTablePdf,
}
