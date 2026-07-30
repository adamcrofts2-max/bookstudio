import { useEffect } from 'react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { TableCellField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
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

function drawTablePdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'table') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink)
  const sizePt = theme.typography.bodySize * 0.85 * PX_TO_PT
  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const boldFont = pickFont(ctx.fonts, theme.fonts.body, 600)
  const colWidth = ctx.contentWidthPt / Math.max(1, block.header.length)
  ctx.cursorY -= sizePt * 1.6
  block.header.forEach((cell, i) => {
    ctx.page.drawText(cell, { x: ctx.contentX + i * colWidth, y: ctx.cursorY, size: sizePt, font: boldFont, color: ink })
  })
  ctx.page.drawLine({ start: { x: ctx.contentX, y: ctx.cursorY - 4 }, end: { x: ctx.contentX + ctx.contentWidthPt, y: ctx.cursorY - 4 }, thickness: 0.75, color: hexToPdfColor(theme.page.ruleColor) })
  ctx.cursorY -= 10
  for (const row of block.rows) {
    row.forEach((cell, i) => {
      ctx.page.drawText(cell, { x: ctx.contentX + i * colWidth, y: ctx.cursorY, size: sizePt, font, color: ink })
    })
    ctx.cursorY -= sizePt * 1.6
  }
  ctx.cursorY -= 10
}

export const tableBlockType: BlockTypeDefinition = {
  id: 'table',
  Render: TableRender,
  drawPdf: drawTablePdf,
}
