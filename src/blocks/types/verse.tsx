import { useEffect, useState } from 'react'
import { Feather } from 'lucide-react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'
import { BLOCK_SPACING } from '@/blocks/blockSpacing'

/** Indent, in px on screen and points in print, of the whole verse block —
 * the traditional setting, which is what tells a reader at a glance that
 * these lines are not prose. */
const VERSE_INDENT_PX = 28

/** A run-over line (one too long for the measure) is indented further still,
 * so it reads as a continuation rather than as a new line of the poem. This
 * is the single most important thing to get right about setting verse: a
 * wrapped line that looks like a fresh line changes the poem. */
const RUNOVER_INDENT_PX = 20

/** How tall a stanza break is, as a multiple of the line height. */
const STANZA_BREAK_RATIO = 0.75

const isStanzaBreak = (line: string) => line.trim() === ''

/**
 * One line of the poem. Its own component so the editing hooks stay
 * unconditional however many lines a verse block has, exactly like
 * `ListItemField` — but a `<div>`, not an `<li>`, and with no list marker.
 */
function VerseLineField({
  text,
  editable,
  autoEdit,
  onCommit,
  onSplit,
  onMergeWithPrevious,
  onFocused,
}: {
  text: string
  editable?: boolean
  autoEdit?: boolean
  onCommit: (value: string) => void
  onSplit: (before: string, after: string) => void
  onMergeWithPrevious?: () => void
  onFocused?: () => void
}) {
  const field = useEditableField({ mode: 'text', initialValue: text, onCommit, onSplit, onMergeWithPrevious })

  useEffect(() => {
    if (autoEdit && editable) field.startEditing('start')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  return (
    <div
      ref={(el) => {
        field.ref.current = el
      }}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onDoubleClick={editable ? () => field.startEditing() : undefined}
      onFocus={autoEdit ? () => onFocused?.() : undefined}
      onBlur={field.isEditing ? field.handleBlur : undefined}
      onKeyDown={field.isEditing ? field.handleKeyDown : undefined}
      style={{ paddingLeft: RUNOVER_INDENT_PX, textIndent: -RUNOVER_INDENT_PX }}
      className={cn(field.isEditing && 'outline outline-2 outline-offset-2 outline-[var(--color-warning)] rounded-sm')}
    >
      {/* A genuinely empty line would collapse to zero height and become
          uneditable, so an editing surface always has something in it. */}
      {!field.isEditing ? (text === '' ? ' ' : text) : null}
    </div>
  )
}

/**
 * Verse — poetry, lyrics, an epigraph in metre. See `VerseBlock` in
 * `types/content.ts` for why it is its own type rather than a run of
 * paragraphs.
 *
 * Everything here exists to keep the author's line breaks: no
 * justification, no auto-wrap that could pass for a line break, a hanging
 * indent so a run-over is visibly a run-over, and an empty entry rendered
 * as a stanza break rather than as an empty line of the poem.
 *
 * Splitting and merging lines is handled inside this block rather than
 * through `editorActions`' `splitListItemWithHistory` — the whole edit is
 * one `onCommit` of a new `lines` array, so it needs nothing from the
 * Content layer that a plain field edit doesn't already have.
 */
function VerseRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  // Which line to drop the caret into after a split or merge. Local, because
  // it is a one-frame intention rather than state anyone else needs; if a
  // pagination-driven remount loses it the line is still there to click.
  const [focusLine, setFocusLine] = useState<number | null>(null)

  useEffect(() => {
    // A block-level edit request (the Virtual Editor's "Edit", the inserter)
    // names no line, so it opens the first one — and must be consumed either
    // way or it hangs forever waiting for a field that never focuses.
    if (autoEdit && editable) {
      setFocusLine(0)
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'verse') return null

  const commitLines = (lines: string[]) => onCommit?.({ lines })

  return (
    <div
      onClick={onSelect}
      className={cn('cursor-pointer outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false))}
      style={{
        // Paired with `drawVersePdf` below — `blocks/blockSpacing.ts`.
        paddingTop: BLOCK_SPACING.verse.before,
        paddingBottom: BLOCK_SPACING.verse.after,
        paddingLeft: VERSE_INDENT_PX,
        fontFamily: theme.fonts.body,
        fontSize: theme.typography.bodySize,
        lineHeight: theme.typography.lineHeight,
        color: theme.page.ink,
        // Verse is never justified: even spacing between words is what
        // metre depends on.
        textAlign: 'left',
      }}
    >
      {block.lines.map((line, i) =>
        isStanzaBreak(line) ? (
          // `em` here is the container's font size, so the ratio has to be
          // multiplied by the line height to mean "three quarters of a
          // line" — the same thing `drawVersePdf` computes. Getting this
          // wrong is worth 7.9px a stanza, which the PDF fidelity suite
          // caught the first time this block was exported.
          <div key={i} aria-hidden style={{ height: `${STANZA_BREAK_RATIO * theme.typography.lineHeight}em` }} />
        ) : (
          <VerseLineField
            key={i}
            text={line}
            editable={editable}
            autoEdit={focusLine === i}
            onFocused={() => setFocusLine(null)}
            onCommit={(value) => {
              const lines = block.lines.slice()
              lines[i] = value
              commitLines(lines)
            }}
            onSplit={(before, after) => {
              const lines = block.lines.slice()
              lines.splice(i, 1, before, after)
              commitLines(lines)
              setFocusLine(i + 1)
            }}
            onMergeWithPrevious={
              i > 0
                ? () => {
                    const lines = block.lines.slice()
                    const previous = lines[i - 1] ?? ''
                    lines.splice(i - 1, 2, previous + lines[i])
                    commitLines(lines)
                    setFocusLine(i - 1)
                  }
                : undefined
            }
          />
        ),
      )}
    </div>
  )
}

function drawVersePdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'verse') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  const sizePt = theme.typography.bodySize * PX_TO_PT
  const lineHeightPt = sizePt * theme.typography.lineHeight
  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const indentPt = VERSE_INDENT_PX * PX_TO_PT
  const runoverPt = RUNOVER_INDENT_PX * PX_TO_PT

  ctx.cursorY -= BLOCK_SPACING.verse.before * PX_TO_PT
  for (const line of block.lines) {
    if (isStanzaBreak(line)) {
      ctx.cursorY -= lineHeightPt * STANZA_BREAK_RATIO
      continue
    }
    // Each line is wrapped on its own, so a line that fits — nearly all of
    // them — produces exactly one drawn line at exactly one baseline, which
    // is the whole point of the block type. A line too long for the measure
    // runs over to the deeper indent instead of being clipped, and the two
    // widths passed here are the two the browser gives the same text: the
    // first line hangs back out to the verse indent (`textIndent: -20px`)
    // and so has 20px more room than the ones under it.
    const wrapped = wrapRuns([{ text: line, bold: false }], font, font, sizePt, ctx.contentWidthPt - indentPt - runoverPt, {
      firstLineWidth: ctx.contentWidthPt - indentPt,
    })
    if (wrapped.length === 0) continue
    const first = { ...ctx, contentX: ctx.contentX + indentPt }
    drawWrappedLines(first, wrapped.slice(0, 1), sizePt, lineHeightPt, ink, font, font)
    ctx.cursorY = first.cursorY
    if (wrapped.length > 1) {
      const runover = { ...ctx, contentX: ctx.contentX + indentPt + runoverPt }
      drawWrappedLines(runover, wrapped.slice(1), sizePt, lineHeightPt, ink, font, font)
      ctx.cursorY = runover.cursorY
    }
  }
  ctx.cursorY -= BLOCK_SPACING.verse.after * PX_TO_PT
}

export const verseBlockType: BlockTypeDefinition = {
  id: 'verse',
  label: 'Verse',
  icon: Feather,
  Render: VerseRender,
  drawPdf: drawVersePdf,
}
