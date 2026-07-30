import { FileText } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

/** Simpler, smaller, whitespace-heavy sibling of Cover — centred title/
 * subtitle/author, no background image. */
function TitlePageRender({ page, theme, selected, onSelect }: StructuralPageRenderProps) {
  if (page.type !== 'title-page') return null

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 px-16 text-center',
        outlineClass(selected, false),
      )}
      style={{ background: theme.page.background }}
    >
      <h1
        style={{
          fontFamily: theme.fonts.heading,
          fontWeight: theme.typography.headingWeight,
          fontSize: '2em',
          lineHeight: 1.2,
          color: theme.page.ink,
        }}
      >
        {page.content.title || 'Untitled'}
      </h1>
      {page.content.subtitle && (
        <p style={{ fontFamily: theme.fonts.body, fontSize: '1.05em', color: theme.page.mutedInk }}>{page.content.subtitle}</p>
      )}
      {page.content.author && (
        <p
          style={{
            fontFamily: theme.fonts.body,
            fontSize: '0.95em',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: theme.page.accent,
            marginTop: 24,
          }}
        >
          {page.content.author}
        </p>
      )}
    </div>
  )
}

function drawTitlePagePdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme, pageBox: PageBox) {
  if (page.type !== 'title-page') return

  const bleedPt = pageBox.bleedPx * PX_TO_PT
  const widthPt = pageBox.widthPx * PX_TO_PT
  const heightPt = pageBox.heightPx * PX_TO_PT
  const centerX = bleedPt + widthPt / 2
  const centerY = bleedPt + heightPt / 2

  const titleFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const ink = hexToPdfColor(theme.page.ink)
  const mutedInk = hexToPdfColor(theme.page.mutedInk)
  const accent = hexToPdfColor(theme.page.accent)

  const title = page.content.title || 'Untitled'
  const titleSize = theme.typography.bodySize * 1.7 * PX_TO_PT
  const titleWidth = titleFont.widthOfTextAtSize(title, titleSize)

  let cursorY = centerY + titleSize * 0.5
  ctx.page.drawText(title, { x: centerX - titleWidth / 2, y: cursorY, size: titleSize, font: titleFont, color: ink })

  if (page.content.subtitle) {
    cursorY -= titleSize * 1.4
    const subSize = theme.typography.bodySize * 1.05 * PX_TO_PT
    const subWidth = bodyFont.widthOfTextAtSize(page.content.subtitle, subSize)
    ctx.page.drawText(page.content.subtitle, { x: centerX - subWidth / 2, y: cursorY, size: subSize, font: bodyFont, color: mutedInk })
  }

  if (page.content.author) {
    cursorY -= theme.typography.bodySize * 2.2 * PX_TO_PT
    const authorSize = theme.typography.bodySize * 0.95 * PX_TO_PT
    const authorWidth = bodyFont.widthOfTextAtSize(page.content.author, authorSize)
    ctx.page.drawText(page.content.author, { x: centerX - authorWidth / 2, y: cursorY, size: authorSize, font: bodyFont, color: accent })
  }
}

export const titlePageType: StructuralPageTypeDefinition = {
  id: 'title-page',
  category: 'front-matter',
  label: 'Title Page',
  icon: FileText,
  Render: TitlePageRender,
  drawPdf: drawTitlePagePdf,
  defaultContent: () => ({}),
}
