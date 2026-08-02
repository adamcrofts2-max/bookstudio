import { useEffect } from 'react'
import { CircleHelp } from 'lucide-react'

import type { ContentBlock, FaqBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { ResolvedBookTheme } from '@/theme/presets'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const EMPTY_PLACEHOLDER = 'No questions added yet.'

/** One question/answer pair — its own component so hooks stay unconditional
 * regardless of entry count (see `ListItemField`'s identical rationale). No
 * add/remove-entry UI this milestone, matching `list.tsx`/`table.tsx`. */
function FaqEntryField({
  entry,
  isLast,
  editable,
  theme,
  onCommitQuestion,
  onCommitAnswer,
}: {
  entry: FaqBlock['entries'][number]
  isLast: boolean
  editable?: boolean
  theme: ResolvedBookTheme
  onCommitQuestion: (value: string) => void
  onCommitAnswer: (value: string) => void
}) {
  const question = useEditableField({ mode: 'text', initialValue: entry.question, onCommit: onCommitQuestion })
  const answer = useEditableField({ mode: 'text', initialValue: entry.answer, onCommit: onCommitAnswer })

  return (
    <div className={cn('pb-4', isLast && 'pb-0')}>
      <p
        ref={(el) => {
          question.ref.current = el
        }}
        className="mb-1 font-semibold"
        onDoubleClick={
          editable
            ? (e) => {
                e.stopPropagation()
                question.startEditing()
              }
            : undefined
        }
        contentEditable={question.isEditing}
        suppressContentEditableWarning
        onBlur={question.isEditing ? question.handleBlur : undefined}
        onKeyDown={question.isEditing ? question.handleKeyDown : undefined}
        style={{ fontFamily: theme.fonts.heading, fontSize: theme.typography.bodySize * 0.98, color: theme.page.ink }}
      >
        {!question.isEditing ? entry.question : null}
      </p>
      <p
        ref={(el) => {
          answer.ref.current = el
        }}
        onDoubleClick={
          editable
            ? (e) => {
                e.stopPropagation()
                answer.startEditing()
              }
            : undefined
        }
        contentEditable={answer.isEditing}
        suppressContentEditableWarning
        onBlur={answer.isEditing ? answer.handleBlur : undefined}
        onKeyDown={answer.isEditing ? answer.handleKeyDown : undefined}
        style={{ fontFamily: theme.fonts.body, fontSize: theme.typography.bodySize * 0.92, lineHeight: theme.typography.lineHeight, color: theme.page.mutedInk }}
      >
        {!answer.isEditing ? entry.answer : null}
      </p>
    </div>
  )
}

function FaqRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  useEffect(() => {
    if (autoEdit && editable) {
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'faq') return null

  return (
    <div onClick={onSelect} className={cn('outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false), 'cursor-pointer py-3')}>
      {block.entries.length > 0 ? (
        block.entries.map((entry, i) => (
          <FaqEntryField
            key={i}
            entry={entry}
            isLast={i === block.entries.length - 1}
            editable={editable}
            theme={theme}
            onCommitQuestion={(value) => {
              const entries = block.entries.slice()
              entries[i] = { ...entries[i], question: value }
              onCommit?.({ entries })
            }}
            onCommitAnswer={(value) => {
              const entries = block.entries.slice()
              entries[i] = { ...entries[i], answer: value }
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

function drawFaqPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'faq') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  const muted = hexToPdfColor(theme.page.mutedInk, ctx.colorMode)

  const questionFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const answerFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const questionSize = theme.typography.bodySize * 0.98 * PX_TO_PT
  const answerSize = theme.typography.bodySize * 0.92 * PX_TO_PT
  const questionLineHeight = questionSize * 1.25
  const answerLineHeight = answerSize * theme.typography.lineHeight

  if (block.entries.length === 0) {
    const lines = wrapRuns([{ text: EMPTY_PLACEHOLDER, bold: false }], answerFont, answerFont, answerSize, ctx.contentWidthPt)
    drawWrappedLines(ctx, lines, answerSize, answerLineHeight, muted, answerFont, answerFont)
    ctx.cursorY -= 10
    return
  }

  for (const entry of block.entries) {
    const questionLines = wrapRuns([{ text: entry.question, bold: false }], questionFont, questionFont, questionSize, ctx.contentWidthPt)
    drawWrappedLines(ctx, questionLines, questionSize, questionLineHeight, ink, questionFont, questionFont)
    ctx.cursorY -= 2
    const answerLines = wrapRuns([{ text: entry.answer, bold: false }], answerFont, answerFont, answerSize, ctx.contentWidthPt)
    drawWrappedLines(ctx, answerLines, answerSize, answerLineHeight, muted, answerFont, answerFont)
    ctx.cursorY -= 12
  }
  ctx.cursorY += 2
}

export const faqBlockType: BlockTypeDefinition = {
  id: 'faq',
  label: 'FAQ',
  icon: CircleHelp,
  Render: FaqRender,
  drawPdf: drawFaqPdf,
  blockSpacing: () => 8,
}
