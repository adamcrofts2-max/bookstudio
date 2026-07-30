import { useEffect } from 'react'
import { Lightbulb, TriangleAlert, Info, type LucideIcon } from 'lucide-react'

import type { CalloutBlock, ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

/**
 * ONE callout type with a `variant`, per docs/MODULAR_PAGE_SYSTEM_PLAN.md
 * §7.5 (and Phase 21's Glossary/Bibliography precedent for generalizing
 * instead of taxonomy-bloating) — not three near-identical Tip/Warning/Info
 * block types.
 *
 * Colour/icon per variant are fixed, hardcoded values, not read from
 * `ResolvedBookTheme` — `theme.page` has no per-block-type accent extension
 * point yet (that's `pageStyles`, explicitly deferred to Milestone 6 per the
 * plan's §7). Documented here as a deliberate simplification, same honesty
 * as this project's other "known simplification" notes (see docs/STATUS.md).
 */
const VARIANTS: Record<CalloutBlock['variant'], { label: string; icon: LucideIcon; accent: string; background: string }> = {
  tip: { label: 'Tip', icon: Lightbulb, accent: '#3ba776', background: '#eaf7f1' },
  warning: { label: 'Warning', icon: TriangleAlert, accent: '#d89b00', background: '#fdf5e3' },
  info: { label: 'Info', icon: Info, accent: '#3b7dd8', background: '#eaf1fb' },
}

function CalloutRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  const title = useEditableField({
    mode: 'text',
    initialValue: block.type === 'callout' ? (block.title ?? '') : '',
    onCommit: (value) => {
      if (block.type === 'callout') onCommit?.({ title: value.trim() || undefined })
    },
  })

  const text = useEditableField({
    mode: 'text',
    initialValue: block.type === 'callout' ? block.text : '',
    onCommit: (value) => {
      if (block.type === 'callout') onCommit?.({ text: value })
    },
  })

  useEffect(() => {
    if (autoEdit && editable) {
      text.startEditing()
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'callout') return null
  const variant = VARIANTS[block.variant]
  const Icon = variant.icon

  return (
    <div
      onClick={!title.isEditing && !text.isEditing ? onSelect : undefined}
      className={cn(
        'outline-offset-4 transition-[outline-color] duration-150',
        outlineClass(!!selected, title.isEditing || text.isEditing),
        'my-2 cursor-pointer rounded-[var(--radius-card)] py-4 pr-5 pl-4',
      )}
      style={{ background: variant.background, borderLeft: `3px solid ${variant.accent}` }}
    >
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-[1.1em] w-[1.1em] shrink-0" style={{ color: variant.accent }} />
        <div className="min-w-0 flex-1">
          {(block.title || title.isEditing || editable) && (
            <p
              ref={(el) => {
                title.ref.current = el
              }}
              className="mb-1 font-semibold"
              onDoubleClick={
                editable
                  ? (e) => {
                      e.stopPropagation()
                      title.startEditing()
                    }
                  : undefined
              }
              contentEditable={title.isEditing}
              suppressContentEditableWarning
              onBlur={title.isEditing ? title.handleBlur : undefined}
              onKeyDown={title.isEditing ? title.handleKeyDown : undefined}
              style={{ fontFamily: theme.fonts.heading, color: variant.accent, fontSize: theme.typography.bodySize * 0.95 }}
            >
              {!title.isEditing ? (block.title || (editable ? `${variant.label}…` : '')) : null}
            </p>
          )}
          <p
            ref={(el) => {
              text.ref.current = el
            }}
            onDoubleClick={
              editable
                ? (e) => {
                    e.stopPropagation()
                    text.startEditing()
                  }
                : undefined
            }
            contentEditable={text.isEditing}
            suppressContentEditableWarning
            onBlur={text.isEditing ? text.handleBlur : undefined}
            onKeyDown={text.isEditing ? text.handleKeyDown : undefined}
            style={{
              fontFamily: theme.fonts.body,
              fontSize: theme.typography.bodySize * 0.92,
              lineHeight: theme.typography.lineHeight,
              color: theme.page.ink,
            }}
          >
            {!text.isEditing ? block.text : null}
          </p>
        </div>
      </div>
    </div>
  )
}

function drawCalloutPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'callout') return
  const { theme } = ctx
  const variant = VARIANTS[block.variant]
  const accent = hexToPdfColor(variant.accent)
  const background = hexToPdfColor(variant.background)
  const ink = hexToPdfColor(theme.page.ink)

  const padX = 14
  const padTop = 12
  const padBottom = 12
  const textIndent = 20

  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const boldFont = pickFont(ctx.fonts, theme.fonts.heading, 600)
  const bodySize = theme.typography.bodySize * 0.92 * PX_TO_PT
  const bodyLineHeight = bodySize * theme.typography.lineHeight
  const titleSize = theme.typography.bodySize * 0.95 * PX_TO_PT

  const innerWidth = ctx.contentWidthPt - padX - textIndent
  const bodyLines = wrapRuns([{ text: block.text, bold: false }], bodyFont, bodyFont, bodySize, innerWidth)
  const titleLines = block.title ? wrapRuns([{ text: block.title, bold: false }], boldFont, boldFont, titleSize, innerWidth) : []

  const boxHeight =
    padTop + padBottom + (titleLines.length > 0 ? titleLines.length * (titleSize * 1.2) + 4 : 0) + bodyLines.length * bodyLineHeight

  const boxTop = ctx.cursorY
  const boxBottom = boxTop - boxHeight
  ctx.page.drawRectangle({ x: ctx.contentX, y: boxBottom, width: ctx.contentWidthPt, height: boxHeight, color: background })
  ctx.page.drawRectangle({ x: ctx.contentX, y: boxBottom, width: 3, height: boxHeight, color: accent })

  const drawCtx = { ...ctx, contentX: ctx.contentX + padX + textIndent, cursorY: boxTop - padTop }
  if (titleLines.length > 0) {
    drawWrappedLines(drawCtx, titleLines, titleSize, titleSize * 1.2, accent, boldFont, boldFont)
    drawCtx.cursorY -= 4
  }
  drawWrappedLines(drawCtx, bodyLines, bodySize, bodyLineHeight, ink, bodyFont, bodyFont)

  ctx.cursorY = boxBottom - 10
}

export const calloutBlockType: BlockTypeDefinition = {
  id: 'callout',
  label: 'Callout',
  icon: Info,
  Render: CalloutRender,
  drawPdf: drawCalloutPdf,
  blockSpacing: () => 8,
}
