import { useEffect } from 'react'
import { ChartBar } from 'lucide-react'

import type { ContentBlock, StatisticsBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { ResolvedBookTheme } from '@/theme/presets'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const EMPTY_PLACEHOLDER = 'No statistics added yet.'

/** One big bold value + its small muted label beneath — its own component so
 * hooks stay unconditional regardless of entry count (see `ListItemField`'s
 * identical rationale). No add/remove-entry UI this milestone. */
function StatEntryField({
  entry,
  editable,
  theme,
  onCommitValue,
  onCommitLabel,
}: {
  entry: StatisticsBlock['entries'][number]
  editable?: boolean
  theme: ResolvedBookTheme
  onCommitValue: (value: string) => void
  onCommitLabel: (value: string) => void
}) {
  const value = useEditableField({ mode: 'text', initialValue: entry.value, onCommit: onCommitValue })
  const label = useEditableField({ mode: 'text', initialValue: entry.label, onCommit: onCommitLabel })

  return (
    <div className="flex min-w-[6em] flex-1 flex-col items-center text-center">
      <p
        ref={(el) => {
          value.ref.current = el
        }}
        className="font-bold"
        onDoubleClick={
          editable
            ? (e) => {
                e.stopPropagation()
                value.startEditing()
              }
            : undefined
        }
        contentEditable={value.isEditing}
        suppressContentEditableWarning
        onBlur={value.isEditing ? value.handleBlur : undefined}
        onKeyDown={value.isEditing ? value.handleKeyDown : undefined}
        style={{ fontFamily: theme.fonts.heading, fontSize: theme.typography.bodySize * 2.1, color: theme.page.accent }}
      >
        {!value.isEditing ? entry.value : null}
      </p>
      <p
        ref={(el) => {
          label.ref.current = el
        }}
        className="mt-1 text-[0.75em] tracking-wide uppercase"
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
        style={{ fontFamily: theme.fonts.body, color: theme.page.mutedInk }}
      >
        {!label.isEditing ? entry.label : null}
      </p>
    </div>
  )
}

function StatisticsRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  useEffect(() => {
    if (autoEdit && editable) {
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'statistics') return null

  return (
    <div
      onClick={onSelect}
      className={cn('outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false), 'cursor-pointer py-4')}
    >
      {block.entries.length > 0 ? (
        <div className="flex flex-wrap justify-around gap-4">
          {block.entries.map((entry, i) => (
            <StatEntryField
              key={i}
              entry={entry}
              editable={editable}
              theme={theme}
              onCommitValue={(value) => {
                const entries = block.entries.slice()
                entries[i] = { ...entries[i], value }
                onCommit?.({ entries })
              }}
              onCommitLabel={(label) => {
                const entries = block.entries.slice()
                entries[i] = { ...entries[i], label }
                onCommit?.({ entries })
              }}
            />
          ))}
        </div>
      ) : (
        <p style={{ fontFamily: theme.fonts.body, fontSize: theme.typography.bodySize * 0.92, color: theme.page.mutedInk }}>{EMPTY_PLACEHOLDER}</p>
      )}
    </div>
  )
}

function drawStatisticsPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'statistics') return
  const { theme } = ctx
  const accent = hexToPdfColor(theme.page.accent, ctx.colorMode)
  const muted = hexToPdfColor(theme.page.mutedInk, ctx.colorMode)

  const valueFont = pickFont(ctx.fonts, theme.fonts.heading, 700)
  const labelFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const valueSize = theme.typography.bodySize * 2.1 * PX_TO_PT
  const labelSize = theme.typography.bodySize * 0.75 * PX_TO_PT

  if (block.entries.length === 0) {
    ctx.cursorY -= labelSize + 10
    ctx.page.drawText(EMPTY_PLACEHOLDER, { x: ctx.contentX, y: ctx.cursorY, size: labelSize, font: labelFont, color: muted })
    ctx.cursorY -= 10
    return
  }

  const colWidth = ctx.contentWidthPt / block.entries.length
  ctx.cursorY -= valueSize
  block.entries.forEach((entry, i) => {
    const cellX = ctx.contentX + i * colWidth
    const valueWidth = valueFont.widthOfTextAtSize(entry.value, valueSize)
    ctx.page.drawText(entry.value, { x: cellX + (colWidth - valueWidth) / 2, y: ctx.cursorY, size: valueSize, font: valueFont, color: accent })
  })
  ctx.cursorY -= labelSize + 6
  block.entries.forEach((entry, i) => {
    const cellX = ctx.contentX + i * colWidth
    const label = entry.label.toUpperCase()
    const labelWidth = labelFont.widthOfTextAtSize(label, labelSize)
    ctx.page.drawText(label, { x: cellX + (colWidth - labelWidth) / 2, y: ctx.cursorY, size: labelSize, font: labelFont, color: muted })
  })
  ctx.cursorY -= 14
}

export const statisticsBlockType: BlockTypeDefinition = {
  id: 'statistics',
  label: 'Statistics',
  icon: ChartBar,
  Render: StatisticsRender,
  drawPdf: drawStatisticsPdf,
  blockSpacing: () => 8,
}
