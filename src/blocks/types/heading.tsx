import { useEffect } from 'react'
import { Heading as HeadingIcon } from 'lucide-react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

function HeadingRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  const primary = useEditableField({
    mode: 'text',
    initialValue: block.type === 'heading' ? block.text : '',
    onCommit: (value) => {
      if (block.type === 'heading') onCommit?.({ text: value })
    },
  })

  useEffect(() => {
    if (autoEdit && editable) {
      primary.startEditing()
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'heading') return null

  const Tag = block.level === 2 ? 'h2' : 'h3'
  return (
    <Tag
      ref={(el) => {
        primary.ref.current = el
      }}
      onClick={!primary.isEditing ? onSelect : undefined}
      onDoubleClick={editable ? primary.startEditing : undefined}
      contentEditable={primary.isEditing}
      suppressContentEditableWarning
      onBlur={primary.isEditing ? primary.handleBlur : undefined}
      onKeyDown={primary.isEditing ? primary.handleKeyDown : undefined}
      className={cn(
        'outline-offset-4 transition-[outline-color] duration-150',
        outlineClass(!!selected, primary.isEditing),
        'cursor-pointer pt-8 pb-2.5',
      )}
      style={{
        fontFamily: theme.fonts.heading,
        fontWeight: theme.typography.headingWeight,
        fontSize: block.level === 2 ? '1.5em' : '1.2em',
        lineHeight: 1.25,
        color: theme.page.ink,
      }}
    >
      {!primary.isEditing ? block.text : null}
    </Tag>
  )
}

function drawHeadingPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'heading') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink)
  ctx.cursorY -= 20
  const sizePt = (block.level === 2 ? theme.typography.bodySize * 1.5 : theme.typography.bodySize * 1.2) * PX_TO_PT
  const font = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const lines = wrapRuns([{ text: block.text, bold: false }], font, font, sizePt, ctx.contentWidthPt)
  drawWrappedLines(ctx, lines, sizePt, sizePt * 1.25, ink, font, font)
  ctx.cursorY -= 6
}

export const headingBlockType: BlockTypeDefinition = {
  id: 'heading',
  label: 'Heading',
  icon: HeadingIcon,
  Render: HeadingRender,
  drawPdf: drawHeadingPdf,
  blockSpacing: () => 8,
}
