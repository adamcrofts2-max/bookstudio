import { useEffect } from 'react'
import { ListChecks, Square, SquareCheck } from 'lucide-react'

import type { ChecklistBlock, ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { ResolvedBookTheme } from '@/theme/presets'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

/** One checklist row — its own component so hooks stay unconditional
 * regardless of item count (see `ListItemField`'s identical rationale in
 * `src/blocks/shared.tsx`). The checkbox is a drawn glyph (a `<button>`
 * toggling `checked` via `onCommit`), deliberately NOT a native
 * `<input type="checkbox">`, which would fight this codebase's inline-
 * contentEditable editing pattern used everywhere else. Clicking the glyph
 * toggles `checked`; double-clicking the text edits its wording — the same
 * "click vs. double-click" split `image.tsx`'s drag-to-replace uses to keep
 * two different interactions from stepping on each other. */
function ChecklistItemField({
  item,
  editable,
  theme,
  onToggle,
  onCommitText,
}: {
  item: ChecklistBlock['items'][number]
  editable?: boolean
  theme: ResolvedBookTheme
  onToggle: () => void
  onCommitText: (value: string) => void
}) {
  const text = useEditableField({ mode: 'text', initialValue: item.text, onCommit: onCommitText })
  const Icon = item.checked ? SquareCheck : Square

  return (
    <li className="flex items-start gap-2 pb-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (editable) onToggle()
        }}
        className={cn('mt-0.5 shrink-0', editable ? 'cursor-pointer' : 'cursor-default')}
        aria-pressed={item.checked}
        style={{ color: item.checked ? theme.page.accent : theme.page.mutedInk }}
      >
        <Icon className="h-[1.1em] w-[1.1em]" />
      </button>
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
        className={cn('flex-1', item.checked && !text.isEditing && 'line-through opacity-70')}
        style={{ fontFamily: theme.fonts.body, fontSize: theme.typography.bodySize * 0.95, lineHeight: theme.typography.lineHeight, color: theme.page.ink }}
      >
        {!text.isEditing ? item.text : null}
      </p>
    </li>
  )
}

function ChecklistRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  useEffect(() => {
    if (autoEdit && editable) {
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'checklist') return null

  return (
    <ul
      onClick={onSelect}
      className={cn('list-none outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false), 'cursor-pointer pb-4')}
    >
      {block.items.length > 0 ? (
        block.items.map((item, i) => (
          <ChecklistItemField
            key={i}
            item={item}
            editable={editable}
            theme={theme}
            onToggle={() => {
              const items = block.items.slice()
              items[i] = { ...items[i], checked: !items[i].checked }
              onCommit?.({ items })
            }}
            onCommitText={(value) => {
              const items = block.items.slice()
              items[i] = { ...items[i], text: value }
              onCommit?.({ items })
            }}
          />
        ))
      ) : (
        <p style={{ fontFamily: theme.fonts.body, fontSize: theme.typography.bodySize * 0.92, color: theme.page.mutedInk }}>No checklist items yet.</p>
      )}
    </ul>
  )
}

function drawCheckboxGlyph(ctx: DrawCtx, x: number, y: number, size: number, checked: boolean, accent: ReturnType<typeof hexToPdfColor>, muted: ReturnType<typeof hexToPdfColor>) {
  ctx.page.drawRectangle({ x, y, width: size, height: size, borderColor: checked ? accent : muted, borderWidth: 1 })
  if (checked) {
    ctx.page.drawLine({ start: { x: x + size * 0.2, y: y + size * 0.5 }, end: { x: x + size * 0.42, y: y + size * 0.25 }, thickness: 1.2, color: accent })
    ctx.page.drawLine({ start: { x: x + size * 0.42, y: y + size * 0.25 }, end: { x: x + size * 0.82, y: y + size * 0.78 }, thickness: 1.2, color: accent })
  }
}

function drawChecklistPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'checklist') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  const muted = hexToPdfColor(theme.page.mutedInk, ctx.colorMode)
  const accent = hexToPdfColor(theme.page.accent, ctx.colorMode)

  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const sizePt = theme.typography.bodySize * 0.95 * PX_TO_PT
  const lineHeight = sizePt * theme.typography.lineHeight
  const boxSize = sizePt * 0.8
  const indent = boxSize + 8

  if (block.items.length === 0) {
    ctx.cursorY -= lineHeight
    ctx.page.drawText('No checklist items yet.', { x: ctx.contentX, y: ctx.cursorY, size: sizePt, font, color: muted })
    ctx.cursorY -= 8
    return
  }

  block.items.forEach((item) => {
    const lines = wrapRuns([{ text: item.text, bold: false }], font, font, sizePt, ctx.contentWidthPt - indent)
    const topY = ctx.cursorY
    const shifted = { ...ctx, contentX: ctx.contentX + indent }
    drawWrappedLines(shifted, lines, sizePt, lineHeight, item.checked ? muted : ink, font, font)
    drawCheckboxGlyph(ctx, ctx.contentX, topY - lineHeight * 0.85, boxSize, item.checked, accent, muted)
    ctx.cursorY = shifted.cursorY
  })
  ctx.cursorY -= 8
}

export const checklistBlockType: BlockTypeDefinition = {
  id: 'checklist',
  label: 'Checklist',
  icon: ListChecks,
  Render: ChecklistRender,
  drawPdf: drawChecklistPdf,
}
