import { useEffect } from 'react'
import { GraduationCap } from 'lucide-react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { splitParagraphs } from '@/structuralPages/longForm'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

/** Heading + body paragraph(s) in a boxed/bordered treatment, set apart from
 * regular flowing body text — reuses `splitParagraphs` (shared with the
 * Foreword/Preface/Acknowledgements/Appendix/About the Author structural
 * pages) so free-form text with blank-line breaks renders as real separate
 * paragraphs rather than one run-on block. */
function CaseStudyRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props

  const title = useEditableField({
    mode: 'text',
    initialValue: block.type === 'case-study' ? block.title : '',
    onCommit: (value) => {
      if (block.type === 'case-study') onCommit?.({ title: value })
    },
  })

  const text = useEditableField({
    mode: 'text',
    initialValue: block.type === 'case-study' ? block.text : '',
    onCommit: (value) => {
      if (block.type === 'case-study') onCommit?.({ text: value })
    },
  })

  useEffect(() => {
    if (autoEdit && editable) {
      text.startEditing()
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'case-study') return null
  const paragraphs = splitParagraphs(block.text)

  return (
    <div
      onClick={!title.isEditing && !text.isEditing ? onSelect : undefined}
      className={cn(
        'outline-offset-4 transition-[outline-color] duration-150',
        outlineClass(!!selected, title.isEditing || text.isEditing),
        'my-2 cursor-pointer rounded-[var(--radius-card)] border px-6 py-5',
      )}
      style={{ borderColor: theme.page.ruleColor }}
    >
      <p
        ref={(el) => {
          title.ref.current = el
        }}
        className="mb-3 font-semibold"
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
        style={{ fontFamily: theme.fonts.heading, fontSize: theme.typography.bodySize * 1.15, color: theme.page.ink }}
      >
        {!title.isEditing ? block.title || (editable ? 'Case study title…' : '') : null}
      </p>
      <div
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
        className="flex flex-col gap-3"
        style={{ fontFamily: theme.fonts.body, fontSize: theme.typography.bodySize * 0.95, lineHeight: theme.typography.lineHeight, color: theme.page.ink }}
      >
        {!text.isEditing
          ? (paragraphs.length > 0 ? paragraphs : ['Case study details…']).map((p, i) => <p key={i}>{p}</p>)
          : null}
      </div>
    </div>
  )
}

function drawCaseStudyPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'case-study') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  const ruleColor = hexToPdfColor(theme.page.ruleColor, ctx.colorMode)

  const padX = 16
  const padTop = 14
  const padBottom = 14

  const titleFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const titleSize = theme.typography.bodySize * 1.15 * PX_TO_PT
  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const bodySize = theme.typography.bodySize * 0.95 * PX_TO_PT
  const lineHeight = bodySize * theme.typography.lineHeight

  const innerWidth = ctx.contentWidthPt - padX * 2
  const titleLines = wrapRuns([{ text: block.title, bold: false }], titleFont, titleFont, titleSize, innerWidth)
  const paragraphs = splitParagraphs(block.text)
  const paragraphLines = (paragraphs.length > 0 ? paragraphs : ['Case study details…']).map((p) =>
    wrapRuns([{ text: p, bold: false }], bodyFont, bodyFont, bodySize, innerWidth),
  )

  const boxHeight =
    padTop +
    padBottom +
    titleLines.length * (titleSize * 1.3) +
    10 +
    paragraphLines.reduce((sum, lines) => sum + lines.length * lineHeight + lineHeight * 0.4, 0)

  const boxTop = ctx.cursorY
  const boxBottom = boxTop - boxHeight
  ctx.page.drawRectangle({
    x: ctx.contentX,
    y: boxBottom,
    width: ctx.contentWidthPt,
    height: boxHeight,
    borderColor: ruleColor,
    borderWidth: 1,
  })

  const drawCtx = { ...ctx, contentX: ctx.contentX + padX, cursorY: boxTop - padTop }
  drawWrappedLines(drawCtx, titleLines, titleSize, titleSize * 1.3, ink, titleFont, titleFont)
  drawCtx.cursorY -= 10
  for (const lines of paragraphLines) {
    drawWrappedLines(drawCtx, lines, bodySize, lineHeight, ink, bodyFont, bodyFont)
    drawCtx.cursorY -= lineHeight * 0.4
  }

  ctx.cursorY = boxBottom - 10
}

export const caseStudyBlockType: BlockTypeDefinition = {
  id: 'case-study',
  label: 'Case Study',
  icon: GraduationCap,
  Render: CaseStudyRender,
  drawPdf: drawCaseStudyPdf,
  blockSpacing: () => 8,
}
