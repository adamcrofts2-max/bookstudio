import { useEffect } from 'react'
import { Quote } from 'lucide-react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

/**
 * The classic magazine "pull quote" — large, centred, decorative extracted
 * text with flanking rule marks above/below and no left rule. Deliberately
 * NOT `quote.tsx`'s visual treatment (a small left-ruled blockquote): this is
 * meant to read as a big, standalone display element pulled out of the flow,
 * not an attributed citation.
 */
function PullQuoteRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  const primary = useEditableField({
    mode: 'text',
    initialValue: block.type === 'pull-quote' ? block.text : '',
    onCommit: (value) => {
      if (block.type === 'pull-quote') onCommit?.({ text: value })
    },
  })

  const attribution = useEditableField({
    mode: 'text',
    initialValue: block.type === 'pull-quote' ? (block.attribution ?? '') : '',
    onCommit: (value) => {
      if (block.type === 'pull-quote') onCommit?.({ attribution: value.trim() || undefined })
    },
  })

  useEffect(() => {
    if (autoEdit && editable) {
      primary.startEditing()
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'pull-quote') return null

  return (
    <figure
      onClick={!primary.isEditing && !attribution.isEditing ? onSelect : undefined}
      className={cn(
        'outline-offset-4 transition-[outline-color] duration-150',
        outlineClass(!!selected, primary.isEditing || attribution.isEditing),
        'cursor-pointer px-10 py-8 text-center',
      )}
    >
      <div className="mx-auto mb-5 h-px w-10" style={{ background: theme.page.ruleColor }} />
      <p
        ref={(el) => {
          primary.ref.current = el
        }}
        className="font-semibold"
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
        style={{
          fontFamily: theme.fonts.heading,
          fontSize: theme.typography.bodySize * 1.9,
          lineHeight: 1.3,
          color: theme.page.ink,
        }}
      >
        {!primary.isEditing ? block.text : null}
      </p>
      <div className="mx-auto mt-5 h-px w-10" style={{ background: theme.page.ruleColor }} />
      {(block.attribution || attribution.isEditing || editable) && (
        <figcaption
          ref={(el) => {
            attribution.ref.current = el
          }}
          className="mt-3 text-[0.7em] tracking-wide uppercase"
          style={{ fontFamily: theme.fonts.body, color: theme.page.mutedInk }}
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
          {!attribution.isEditing ? (block.attribution || (editable ? 'Add attribution…' : '')) : null}
        </figcaption>
      )}
    </figure>
  )
}

function drawPullQuotePdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'pull-quote') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  const muted = hexToPdfColor(theme.page.mutedInk, ctx.colorMode)
  const rule = hexToPdfColor(theme.page.ruleColor, ctx.colorMode)
  const centerX = ctx.contentX + ctx.contentWidthPt / 2
  const ruleHalfWidth = 18

  ctx.cursorY -= 10
  ctx.page.drawLine({ start: { x: centerX - ruleHalfWidth, y: ctx.cursorY }, end: { x: centerX + ruleHalfWidth, y: ctx.cursorY }, thickness: 1, color: rule })
  ctx.cursorY -= 18

  const font = pickFont(ctx.fonts, theme.fonts.heading, 600)
  const sizePt = theme.typography.bodySize * 1.7 * PX_TO_PT
  const lineHeight = sizePt * 1.3
  const lines = wrapRuns([{ text: block.text, bold: false }], font, font, sizePt, ctx.contentWidthPt * 0.85)
  for (const line of lines) {
    ctx.cursorY -= lineHeight
    const lineWidth = line.fragments.reduce((w, f) => w + font.widthOfTextAtSize(f.text, sizePt), 0)
    let x = centerX - lineWidth / 2
    for (const fragment of line.fragments) {
      ctx.page.drawText(fragment.text, { x, y: ctx.cursorY, size: sizePt, font, color: ink })
      x += font.widthOfTextAtSize(fragment.text, sizePt)
    }
  }

  ctx.cursorY -= 14
  ctx.page.drawLine({ start: { x: centerX - ruleHalfWidth, y: ctx.cursorY }, end: { x: centerX + ruleHalfWidth, y: ctx.cursorY }, thickness: 1, color: rule })
  ctx.cursorY -= 18

  if (block.attribution) {
    const capFont = pickFont(ctx.fonts, theme.fonts.body, 400)
    const capSize = theme.typography.bodySize * 0.7 * PX_TO_PT
    const text = block.attribution.toUpperCase()
    const width = capFont.widthOfTextAtSize(text, capSize)
    ctx.page.drawText(text, { x: centerX - width / 2, y: ctx.cursorY, size: capSize, font: capFont, color: muted })
    ctx.cursorY -= capSize + 8
  }
  ctx.cursorY -= 8
}

export const pullQuoteBlockType: BlockTypeDefinition = {
  id: 'pull-quote',
  label: 'Pull Quote',
  icon: Quote,
  Render: PullQuoteRender,
  drawPdf: drawPullQuotePdf,
  blockSpacing: () => 8,
}
