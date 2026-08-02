import { ListOrdered } from 'lucide-react'

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

const INDEX_PLACEHOLDER = 'No index entries added yet.'

/**
 * A manually-typed list of index entries (e.g. "Composting, 45, 112").
 *
 * Known V1 simplification (see docs/STATUS.md's Phase 21 entry): real book
 * indexes are automatically generated from actual page references across the
 * whole manuscript — that requires knowing final page numbers after layout,
 * cross-referencing search terms against every chapter, and is exactly the
 * kind of thing `docs/ARCHITECTURE_PRINCIPLES.md`'s "design with future AI
 * integration in mind" principle earmarks for a future AI-powered feature.
 * This milestone ships a manual, single-column freeform list only — no
 * automatic term/page-number computation.
 */
function IndexRender({ page, theme, selected, onSelect }: StructuralPageRenderProps) {
  if (page.type !== 'index') return null
  const entries = (page.content.entries ?? []).map((e) => e.trim()).filter(Boolean)

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col gap-6 px-16 py-20', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <h2 style={{ fontFamily: theme.fonts.heading, fontWeight: theme.typography.headingWeight, fontSize: '1.5em', color: theme.page.ink }}>
        Index
      </h2>
      <div className="flex flex-col gap-1.5">
        {(entries.length > 0 ? entries : [INDEX_PLACEHOLDER]).map((entry, i) => (
          <p key={i} style={{ fontFamily: theme.fonts.body, fontSize: '0.9em', color: theme.page.ink }}>
            {entry}
          </p>
        ))}
      </div>
    </div>
  )
}

function drawIndexPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'index') return
  const entries = (page.content.entries ?? []).map((e) => e.trim()).filter(Boolean)

  const headingFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const headingSize = theme.typography.bodySize * 1.5 * PX_TO_PT
  ctx.cursorY -= headingSize
  ctx.page.drawText('Index', { x: ctx.contentX, y: ctx.cursorY, size: headingSize, font: headingFont, color: hexToPdfColor(theme.page.ink, ctx.colorMode) })
  ctx.cursorY -= headingSize * 1.1

  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const bodySize = theme.typography.bodySize * 0.9 * PX_TO_PT
  const lineHeight = bodySize * 1.3
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  for (const entry of entries.length > 0 ? entries : [INDEX_PLACEHOLDER]) {
    const lines = wrapRuns([{ text: entry, bold: false }], bodyFont, bodyFont, bodySize, ctx.contentWidthPt)
    drawWrappedLines(ctx, lines, bodySize, lineHeight, ink, bodyFont, bodyFont)
  }
}

export const indexPageType: StructuralPageTypeDefinition = {
  id: 'index',
  category: 'back-matter',
  label: 'Index',
  icon: ListOrdered,
  Render: IndexRender,
  drawPdf: drawIndexPdf,
  defaultContent: () => ({}),
}
