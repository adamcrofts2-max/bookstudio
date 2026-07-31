import { useEffect } from 'react'
import { List as ListIcon } from 'lucide-react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { ListItemField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

function ListRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  // The monolithic switch's shared `primary`/`attribution` fields were
  // constructed unconditionally for every block type, but list blocks never
  // rendered either one — the only externally observable effect of the old
  // autoEdit effect for this block type was firing `onAutoEditHandled`, so
  // that's the only part reproduced here.
  useEffect(() => {
    if (autoEdit && editable) {
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'list') return null

  const wrapperClass = cn('outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false))
  const Tag = block.ordered ? 'ol' : 'ul'
  return (
    <Tag
      onClick={onSelect}
      className={cn(wrapperClass, 'cursor-pointer pb-4 pl-6', block.ordered ? 'list-decimal' : 'list-disc')}
      style={{
        fontFamily: theme.fonts.body,
        fontSize: theme.typography.bodySize,
        lineHeight: theme.typography.lineHeight,
        color: theme.page.ink,
      }}
    >
      {block.items.map((item, i) => (
        <ListItemField
          key={i}
          text={item}
          editable={editable}
          onCommit={(value) => {
            const items = block.items.slice()
            items[i] = value
            onCommit?.({ items })
          }}
        />
      ))}
    </Tag>
  )
}

function drawListPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'list') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink)
  const sizePt = theme.typography.bodySize * PX_TO_PT
  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const indent = 16
  block.items.forEach((item, i) => {
    const prefix = block.ordered ? `${i + 1}.` : '•'
    const lines = wrapRuns([{ text: item, bold: false }], font, font, sizePt, ctx.contentWidthPt - indent)
    const startY = ctx.cursorY
    const shifted = { ...ctx, contentX: ctx.contentX + indent }
    drawWrappedLines(shifted, lines, sizePt, sizePt * theme.typography.lineHeight, ink, font, font)
    ctx.page.drawText(prefix, { x: ctx.contentX, y: startY - sizePt * theme.typography.lineHeight, size: sizePt, font, color: ink })
    ctx.cursorY = shifted.cursorY
  })
  ctx.cursorY -= 10
}

export const listBlockType: BlockTypeDefinition = {
  id: 'list',
  label: 'List',
  icon: ListIcon,
  Render: ListRender,
  drawPdf: drawListPdf,
}
