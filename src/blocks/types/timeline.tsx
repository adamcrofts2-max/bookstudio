import { useEffect } from 'react'
import { GitCommitVertical } from 'lucide-react'

import type { ContentBlock, TimelineBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { ResolvedBookTheme } from '@/theme/presets'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const EMPTY_PLACEHOLDER = 'No timeline entries yet.'

/** One entry's editable label + text, connected to the vertical rule by a
 * dot marker. Its own component so hooks stay unconditional regardless of
 * how many entries a timeline has (see `ListItemField`'s identical rationale
 * in `src/blocks/shared.tsx`). No add/remove-entry UI this milestone — same
 * scope as `list.tsx`/`table.tsx`, which only edit existing import-created
 * items inline. */
function TimelineEntryField({
  entry,
  isLast,
  editable,
  theme,
  onCommitLabel,
  onCommitText,
}: {
  entry: TimelineBlock['entries'][number]
  isLast: boolean
  editable?: boolean
  theme: ResolvedBookTheme
  onCommitLabel: (value: string) => void
  onCommitText: (value: string) => void
}) {
  const label = useEditableField({ mode: 'text', initialValue: entry.label, onCommit: onCommitLabel })
  const text = useEditableField({ mode: 'text', initialValue: entry.text, onCommit: onCommitText })

  return (
    <div className={cn('relative pb-6 pl-7', isLast && 'pb-0')}>
      {!isLast && <span className="absolute top-2.5 left-[3px] w-px" style={{ bottom: 0, background: theme.page.ruleColor }} />}
      <span className="absolute top-1.5 left-0 h-2 w-2 rounded-full" style={{ background: theme.page.accent }} />
      <p
        ref={(el) => {
          label.ref.current = el
        }}
        className="mb-0.5 font-semibold"
        onDoubleClick={
          editable
            ? (e) => {
                e.stopPropagation()
                label.startEditing()
              }
            : undefined
        }
        contentEditable={label.isEditing}
        suppressContentEditableWarning
        onBlur={label.isEditing ? label.handleBlur : undefined}
        onKeyDown={label.isEditing ? label.handleKeyDown : undefined}
        style={{ fontFamily: theme.fonts.heading, fontSize: theme.typography.bodySize * 0.85, color: theme.page.accent }}
      >
        {!label.isEditing ? entry.label : null}
      </p>
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
        style={{ fontFamily: theme.fonts.body, fontSize: theme.typography.bodySize * 0.92, lineHeight: theme.typography.lineHeight, color: theme.page.ink }}
      >
        {!text.isEditing ? entry.text : null}
      </p>
    </div>
  )
}

function TimelineRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  // See list.tsx's comment: no `primary` editable field lives directly on
  // this block (each entry owns its own), so the old unconditional autoEdit
  // effect's only observable behaviour to reproduce is firing the handler.
  useEffect(() => {
    if (autoEdit && editable) {
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'timeline') return null

  return (
    <div onClick={onSelect} className={cn('outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false), 'cursor-pointer py-3')}>
      {block.entries.length > 0 ? (
        block.entries.map((entry, i) => (
          <TimelineEntryField
            key={i}
            entry={entry}
            isLast={i === block.entries.length - 1}
            editable={editable}
            theme={theme}
            onCommitLabel={(value) => {
              const entries = block.entries.slice()
              entries[i] = { ...entries[i], label: value }
              onCommit?.({ entries })
            }}
            onCommitText={(value) => {
              const entries = block.entries.slice()
              entries[i] = { ...entries[i], text: value }
              onCommit?.({ entries })
            }}
          />
        ))
      ) : (
        <p style={{ fontFamily: theme.fonts.body, fontSize: theme.typography.bodySize * 0.92, color: theme.page.mutedInk }}>{EMPTY_PLACEHOLDER}</p>
      )}
    </div>
  )
}

function drawTimelinePdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'timeline') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink)
  const muted = hexToPdfColor(theme.page.mutedInk)
  const accent = hexToPdfColor(theme.page.accent)
  const rule = hexToPdfColor(theme.page.ruleColor)

  const labelFont = pickFont(ctx.fonts, theme.fonts.heading, 600)
  const textFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const labelSize = theme.typography.bodySize * 0.85 * PX_TO_PT
  const textSize = theme.typography.bodySize * 0.92 * PX_TO_PT
  const labelLineHeight = labelSize * 1.3
  const textLineHeight = textSize * theme.typography.lineHeight
  const indent = 22

  if (block.entries.length === 0) {
    const lines = wrapRuns([{ text: EMPTY_PLACEHOLDER, bold: false }], textFont, textFont, textSize, ctx.contentWidthPt)
    drawWrappedLines(ctx, lines, textSize, textLineHeight, muted, textFont, textFont)
    ctx.cursorY -= 10
    return
  }

  const innerWidth = ctx.contentWidthPt - indent
  const entryLines = block.entries.map((entry) => ({
    labelLines: wrapRuns([{ text: entry.label, bold: false }], labelFont, labelFont, labelSize, innerWidth),
    textLines: wrapRuns([{ text: entry.text, bold: false }], textFont, textFont, textSize, innerWidth),
  }))
  const entryGap = 14
  const entryHeights = entryLines.map(
    ({ labelLines, textLines }) => labelLines.length * labelLineHeight + 4 + textLines.length * textLineHeight + entryGap,
  )
  const totalHeight = entryHeights.reduce((sum, h) => sum + h, 0) - entryGap

  const ruleX = ctx.contentX + 3
  const ruleTop = ctx.cursorY - 6
  ctx.page.drawLine({ start: { x: ruleX, y: ruleTop }, end: { x: ruleX, y: ruleTop - totalHeight + 8 }, thickness: 1, color: rule })

  block.entries.forEach((_entry, i) => {
    const { labelLines, textLines } = entryLines[i]
    ctx.page.drawCircle({ x: ruleX, y: ctx.cursorY - 6, size: 3, color: accent })
    const drawCtx = { ...ctx, contentX: ctx.contentX + indent }
    drawWrappedLines(drawCtx, labelLines, labelSize, labelLineHeight, accent, labelFont, labelFont)
    drawCtx.cursorY -= 4
    drawWrappedLines(drawCtx, textLines, textSize, textLineHeight, ink, textFont, textFont)
    ctx.cursorY = drawCtx.cursorY - entryGap
  })
  ctx.cursorY += entryGap - 10
}

export const timelineBlockType: BlockTypeDefinition = {
  id: 'timeline',
  label: 'Timeline',
  icon: GitCommitVertical,
  Render: TimelineRender,
  drawPdf: drawTimelinePdf,
  blockSpacing: () => 8,
}
