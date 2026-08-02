import { BookA } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { wrapRuns } from '@/pdf/textWrap'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const GLOSSARY_PLACEHOLDER = 'No terms added yet.'

/** A list of term/definition pairs, each rendered as a bold term followed by
 * its definition on the same flowing line — "**Term** — definition". */
function GlossaryRender({ page, theme, selected, onSelect }: StructuralPageRenderProps) {
  if (page.type !== 'glossary') return null
  const entries = (page.content.entries ?? []).filter((e) => e.term.trim())

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col gap-6 px-16 py-20', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <h2 style={{ fontFamily: theme.fonts.heading, fontWeight: theme.typography.headingWeight, fontSize: '1.5em', color: theme.page.ink }}>
        Glossary
      </h2>
      {entries.length > 0 ? (
        <div className="flex flex-col gap-3">
          {entries.map((entry, i) => (
            <p key={i} style={{ fontFamily: theme.fonts.body, fontSize: '0.95em', lineHeight: theme.typography.lineHeight, color: theme.page.ink }}>
              <span style={{ fontWeight: 700 }}>{entry.term.trim()}</span>
              {entry.definition.trim() && <> — {entry.definition.trim()}</>}
            </p>
          ))}
        </div>
      ) : (
        <p style={{ fontFamily: theme.fonts.body, fontSize: '0.95em', color: theme.page.mutedInk }}>{GLOSSARY_PLACEHOLDER}</p>
      )}
    </div>
  )
}

function drawGlossaryPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'glossary') return
  const entries = (page.content.entries ?? []).filter((e) => e.term.trim())

  const headingFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const headingSize = theme.typography.bodySize * 1.5 * PX_TO_PT
  ctx.cursorY -= headingSize
  ctx.page.drawText('Glossary', { x: ctx.contentX, y: ctx.cursorY, size: headingSize, font: headingFont, color: hexToPdfColor(theme.page.ink, ctx.colorMode) })
  ctx.cursorY -= headingSize * 1.1

  const regularFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const boldFont = pickFont(ctx.fonts, theme.fonts.body, 700)
  const bodySize = theme.typography.bodySize * 0.95 * PX_TO_PT
  const lineHeight = bodySize * theme.typography.lineHeight
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)

  if (entries.length === 0) {
    const lines = wrapRuns([{ text: GLOSSARY_PLACEHOLDER, bold: false }], regularFont, boldFont, bodySize, ctx.contentWidthPt)
    drawWrappedLines(ctx, lines, bodySize, lineHeight, hexToPdfColor(theme.page.mutedInk, ctx.colorMode), regularFont, boldFont)
    return
  }

  for (const entry of entries) {
    const runs = entry.definition.trim()
      ? [{ text: `${entry.term.trim()} — `, bold: true }, { text: entry.definition.trim(), bold: false }]
      : [{ text: entry.term.trim(), bold: true }]
    const lines = wrapRuns(runs, regularFont, boldFont, bodySize, ctx.contentWidthPt)
    drawWrappedLines(ctx, lines, bodySize, lineHeight, ink, regularFont, boldFont)
    ctx.cursorY -= lineHeight * 0.5
  }
}

export const glossaryPageType: StructuralPageTypeDefinition = {
  id: 'glossary',
  category: 'back-matter',
  label: 'Glossary',
  icon: BookA,
  Render: GlossaryRender,
  drawPdf: drawGlossaryPdf,
  defaultContent: () => ({}),
}
