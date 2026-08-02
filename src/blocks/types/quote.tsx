import { useEffect } from 'react'
import { TextQuote } from 'lucide-react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

function QuoteRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  const primary = useEditableField({
    mode: 'text',
    initialValue: block.type === 'quote' ? block.text : '',
    onCommit: (value) => {
      if (block.type === 'quote') onCommit?.({ text: value })
    },
  })

  const attribution = useEditableField({
    mode: 'text',
    initialValue: block.type === 'quote' ? (block.attribution ?? '') : '',
    onCommit: (value) => {
      if (block.type === 'quote') onCommit?.({ attribution: value.trim() || undefined })
    },
  })

  useEffect(() => {
    if (autoEdit && editable) {
      primary.startEditing()
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'quote') return null

  return (
    <blockquote
      onClick={!primary.isEditing && !attribution.isEditing ? onSelect : undefined}
      className={cn(
        'outline-offset-4 transition-[outline-color] duration-150',
        outlineClass(!!selected, primary.isEditing || attribution.isEditing),
        'cursor-pointer py-6 pl-5',
      )}
      style={{
        fontFamily: theme.fonts.heading,
        fontSize: theme.typography.bodySize * 1.15,
        lineHeight: 1.5,
        color: theme.page.accent,
        borderLeft: `2px solid ${theme.page.ruleColor}`,
      }}
    >
      <p
        ref={(el) => {
          primary.ref.current = el
        }}
        className="italic"
        onDoubleClick={
          editable
            ? (e) => {
                e.stopPropagation()
                primary.startEditing()
              }
            : undefined
        }
        contentEditable={primary.isEditing}
        suppressContentEditableWarning
        onBlur={primary.isEditing ? primary.handleBlur : undefined}
        onKeyDown={primary.isEditing ? primary.handleKeyDown : undefined}
      >
        {!primary.isEditing ? <>&ldquo;{block.text}&rdquo;</> : null}
      </p>
      {(block.attribution || attribution.isEditing || editable) && (
        <footer
          ref={(el) => {
            attribution.ref.current = el
          }}
          className="mt-2 text-[0.7em] not-italic"
          style={{ color: theme.page.mutedInk }}
          onDoubleClick={
            editable
              ? (e) => {
                  e.stopPropagation()
                  attribution.startEditing()
                }
              : undefined
          }
          contentEditable={attribution.isEditing}
          suppressContentEditableWarning
          onBlur={attribution.isEditing ? attribution.handleBlur : undefined}
          onKeyDown={attribution.isEditing ? attribution.handleKeyDown : undefined}
        >
          {!attribution.isEditing ? (block.attribution ? `— ${block.attribution}` : editable ? 'Add attribution…' : '') : null}
        </footer>
      )}
    </blockquote>
  )
}

function drawQuotePdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'quote') return
  const { theme } = ctx
  const muted = hexToPdfColor(theme.page.mutedInk, ctx.colorMode)
  const accent = hexToPdfColor(theme.page.accent, ctx.colorMode)
  const sizePt = theme.typography.bodySize * 1.05 * PX_TO_PT
  const font = pickFont(ctx.fonts, theme.fonts.heading, 400)
  ctx.cursorY -= 8
  const ruleTop = ctx.cursorY + sizePt
  const lines = wrapRuns([{ text: `“${block.text}”`, bold: false }], font, font, sizePt, ctx.contentWidthPt - 16)
  const startCtx = { ...ctx, contentX: ctx.contentX + 16 }
  drawWrappedLines(startCtx, lines, sizePt, sizePt * 1.5, accent, font, font)
  ctx.cursorY = startCtx.cursorY
  ctx.page.drawRectangle({ x: ctx.contentX, y: ctx.cursorY, width: 2, height: ruleTop - ctx.cursorY, color: hexToPdfColor(theme.page.ruleColor, ctx.colorMode) })
  if (block.attribution) {
    ctx.cursorY -= 4
    const capSize = theme.typography.bodySize * 0.8 * PX_TO_PT
    ctx.page.drawText(`— ${block.attribution}`, { x: ctx.contentX + 16, y: ctx.cursorY - capSize, size: capSize, font: pickFont(ctx.fonts, theme.fonts.body, 400), color: muted })
    ctx.cursorY -= capSize + 4
  }
  ctx.cursorY -= 10
}

export const quoteBlockType: BlockTypeDefinition = {
  id: 'quote',
  label: 'Quote',
  icon: TextQuote,
  Render: QuoteRender,
  drawPdf: drawQuotePdf,
  blockSpacing: () => 6,
}
