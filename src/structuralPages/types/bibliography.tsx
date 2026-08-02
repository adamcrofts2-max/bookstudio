import { Library } from 'lucide-react'

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

const BIBLIOGRAPHY_PLACEHOLDER = 'No references added yet.'

/** A list of freeform citation entries — one per line, plain left-aligned
 * (a real hanging-indent bibliography style is a nice-to-have left for a
 * future typography pass, not required for this milestone). */
function BibliographyRender({ page, theme, selected, onSelect }: StructuralPageRenderProps) {
  if (page.type !== 'bibliography') return null
  const entries = (page.content.entries ?? []).map((e) => e.trim()).filter(Boolean)

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col gap-6 px-16 py-20', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <h2 style={{ fontFamily: theme.fonts.heading, fontWeight: theme.typography.headingWeight, fontSize: '1.5em', color: theme.page.ink }}>
        Bibliography
      </h2>
      <div className="flex flex-col gap-3">
        {(entries.length > 0 ? entries : [BIBLIOGRAPHY_PLACEHOLDER]).map((entry, i) => (
          <p
            key={i}
            style={{ fontFamily: theme.fonts.body, fontSize: '0.95em', lineHeight: theme.typography.lineHeight, color: theme.page.ink }}
          >
            {entry}
          </p>
        ))}
      </div>
    </div>
  )
}

function drawBibliographyPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'bibliography') return
  const entries = (page.content.entries ?? []).map((e) => e.trim()).filter(Boolean)

  const headingFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const headingSize = theme.typography.bodySize * 1.5 * PX_TO_PT
  ctx.cursorY -= headingSize
  ctx.page.drawText('Bibliography', { x: ctx.contentX, y: ctx.cursorY, size: headingSize, font: headingFont, color: hexToPdfColor(theme.page.ink, ctx.colorMode) })
  ctx.cursorY -= headingSize * 1.1

  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const bodySize = theme.typography.bodySize * 0.95 * PX_TO_PT
  const lineHeight = bodySize * theme.typography.lineHeight
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  for (const entry of entries.length > 0 ? entries : [BIBLIOGRAPHY_PLACEHOLDER]) {
    const lines = wrapRuns([{ text: entry, bold: false }], bodyFont, bodyFont, bodySize, ctx.contentWidthPt)
    drawWrappedLines(ctx, lines, bodySize, lineHeight, ink, bodyFont, bodyFont)
    ctx.cursorY -= lineHeight * 0.5
  }
}

export const bibliographyPageType: StructuralPageTypeDefinition = {
  id: 'bibliography',
  category: 'back-matter',
  label: 'Bibliography',
  icon: Library,
  Render: BibliographyRender,
  drawPdf: drawBibliographyPdf,
  defaultContent: () => ({}),
}
